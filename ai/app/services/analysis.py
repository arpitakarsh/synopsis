import json
import math
import os
import re
from io import BytesIO
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

from openai import AsyncOpenAI
from pypdf import PdfReader

from ..models.schemas import AnalyzeRequest, AnalyzeResponse, ClauseResult
from ..prompts import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

RISK_WEIGHTS = {"LOW": 20, "MEDIUM": 45, "HIGH": 75, "CRITICAL": 90}
SEVERITY_ORDER = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
MAX_CHARS = 80_000
WORD_TO_NUMBER = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
_client: AsyncOpenAI | None = None


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _chunk_text(text: str, max_chars: int = MAX_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    front = math.floor(max_chars * 0.70)
    back = math.floor(max_chars * 0.15)
    return text[:front] + "\n[...middle sections truncated for length...]\n" + text[-back:]


def _api_key() -> str | None:
    return (os.getenv("GROQ_API_KEY") or "").strip() or None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        key = _api_key()
        if not key:
            raise RuntimeError("Missing GROQ_API_KEY in AI service environment.")
        if not key.startswith("gsk_"):
            raise RuntimeError("Invalid GROQ_API_KEY format. Expected key to start with 'gsk_'.")
        _client = AsyncOpenAI(
            api_key=key,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


def _build_user_prompt(request: AnalyzeRequest, contract_text: str) -> str:
    prompt = USER_PROMPT_TEMPLATE
    replacements = {
        "{contract_title}": request.contract_title or "Untitled contract",
        "{vendor_name}": request.vendor_name or "Unknown vendor",
        "{contract_value}": request.contract_value or "Not specified",
        "{page_count}": str(max(1, len(contract_text) // 3000)),
        "{full_contract_text}": contract_text,
    }
    for key, value in replacements.items():
        prompt = prompt.replace(key, value)
    return prompt


def _clamp_int(value: object, default: int = 50) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return default


def _parse_json_payload(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw, re.IGNORECASE)
    if fenced:
        parsed = json.loads(fenced.group(1).strip())
        if isinstance(parsed, dict):
            return parsed
    raise ValueError("AI returned non-JSON payload.")


def _normalize_ai_response(data: dict) -> AnalyzeResponse:
    source = data.get("analysis") if isinstance(data.get("analysis"), dict) else data

    dimension_scores = source.get("dimension_scores") if isinstance(source.get("dimension_scores"), dict) else {}
    red_flags = source.get("red_flags")
    if not isinstance(red_flags, list):
        red_flags = []

    raw_clauses = source.get("clauses")
    if not isinstance(raw_clauses, list):
        raw_clauses = []

    clauses: list[ClauseResult] = []
    for raw_clause in raw_clauses:
        if not isinstance(raw_clause, dict):
            continue
        risk_level = str(raw_clause.get("risk_level", "MEDIUM")).upper().strip()
        if risk_level not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            risk_level = "MEDIUM"
        clauses.append(
            ClauseResult(
                clause_type=str(raw_clause.get("clause_type", "General Clause")).strip() or "General Clause",
                extracted_text=str(raw_clause.get("extracted_text", "")).strip(),
                risk_level=risk_level,
                explanation=str(raw_clause.get("explanation", "No explanation provided by AI.")).strip(),
                negotiation_recommendation=(
                    str(raw_clause.get("negotiation_recommendation", "No recommendation provided by AI.")).strip()
                ),
            )
        )

    if not clauses:
        raise ValueError("AI response did not include any clauses.")

    return AnalyzeResponse(
        overall_risk_score=_clamp_int(source.get("overall_risk_score"), default=_score_from_clauses(clauses)),
        executive_summary=str(source.get("executive_summary", "No executive summary provided by AI.")).strip()
        or "No executive summary provided by AI.",
        red_flags=[str(flag).strip() for flag in red_flags if str(flag).strip()][:12],
        clauses=clauses,
        liability_score=_clamp_int(dimension_scores.get("liability"), 50),
        renewal_risk_score=_clamp_int(dimension_scores.get("renewal_risk"), 50),
        ip_ownership_score=_clamp_int(dimension_scores.get("ip_ownership"), 50),
        termination_score=_clamp_int(dimension_scores.get("termination"), 50),
        payment_exposure_score=_clamp_int(dimension_scores.get("payment_exposure"), 50),
    )


async def _analyze_with_llm(request: AnalyzeRequest, contract_text: str) -> AnalyzeResponse:
    model = os.getenv("MODEL", "llama-3.3-70b-versatile").strip() or "llama-3.3-70b-versatile"
    max_tokens = int(os.getenv("MAX_TOKENS", 4000))
    safe_text = _chunk_text(contract_text)
    user_prompt = _build_user_prompt(request, safe_text)

    client = _get_client()
    response = await client.chat.completions.create(
        model=model,
        temperature=0.1,
        max_tokens=max_tokens,
        timeout=90,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = response.choices[0].message.content or ""

    try:
        parsed = _parse_json_payload(content)
    except Exception:
        retry_prompt = (
            user_prompt
            + "\n\nCRITICAL: Return ONLY valid JSON for the required structure. No markdown, no explanations."
        )
        retry = await client.chat.completions.create(
            model=model,
            temperature=0.0,
            max_tokens=max_tokens,
            timeout=90,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": retry_prompt},
            ],
        )
        parsed = _parse_json_payload(retry.choices[0].message.content or "")

    return _normalize_ai_response(parsed)


def _cloudinary_raw_url(public_id: str) -> str:
    cloud = os.getenv("CLOUDINARY_CLOUD_NAME", "").strip()
    if not cloud:
        raise ValueError("CLOUDINARY_CLOUD_NAME is required for file retrieval")
    encoded = quote(public_id, safe="/")
    return f"https://res.cloudinary.com/{cloud}/raw/upload/{encoded}"


def _candidate_urls(s3_key: str) -> list[str]:
    key = (s3_key or "").strip()
    if not key:
        return []
    if key.startswith("http://") or key.startswith("https://"):
        return [key]

    base = _cloudinary_raw_url(key)
    urls = [base]
    if not key.lower().endswith(".pdf"):
        urls.append(f"{base}.pdf")
    return urls


def _fetch_contract_bytes(s3_key: str) -> bytes:
    errors: list[str] = []
    for url in _candidate_urls(s3_key):
        try:
            with urlopen(url, timeout=30) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append(f"{url}: {exc}")
    raise RuntimeError("Unable to fetch contract file. " + " | ".join(errors))


def _extract_text(file_bytes: bytes, source_key: str) -> str:
    is_pdf = source_key.lower().endswith(".pdf") or file_bytes[:5] == b"%PDF-"
    if is_pdf:
        try:
            reader = PdfReader(BytesIO(file_bytes))
            pages = [page.extract_text() or "" for page in reader.pages]
            return _normalize_whitespace(" ".join(pages))
        except Exception:
            pass
    try:
        return _normalize_whitespace(file_bytes.decode("utf-8", errors="ignore"))
    except Exception:
        return ""


def _snippet_around(text: str, keyword: str, radius: int = 280) -> str:
    idx = text.lower().find(keyword.lower())
    if idx < 0:
        return text[: min(len(text), 650)]
    start = max(0, idx - radius)
    end = min(len(text), idx + len(keyword) + radius)
    return _normalize_whitespace(text[start:end])


def _contains_any(text: str, markers: list[str]) -> bool:
    lower = text.lower()
    return any(marker in lower for marker in markers)


def _pick_anchor(text: str, markers: list[str]) -> str:
    lower = text.lower()
    for marker in markers:
        if marker in lower:
            return marker
    return markers[0] if markers else ""


def _token_to_int(token: str) -> int | None:
    value = token.strip().lower()
    if value.isdigit():
        return int(value)
    return WORD_TO_NUMBER.get(value)


def _extract_values_with_unit(text: str, unit_pattern: str) -> list[int]:
    values: list[int] = []
    pattern = rf"\b([a-z]+|\d{{1,3}})\s*(?:\(\s*(\d{{1,3}})\s*\))?\s*{unit_pattern}\b"
    for match in re.finditer(pattern, text.lower()):
        paren_number = match.group(2)
        if paren_number:
            values.append(int(paren_number))
            continue
        first = _token_to_int(match.group(1))
        if first is not None:
            values.append(first)
    return values


def _extract_day_values(text: str) -> list[int]:
    values = _extract_values_with_unit(text, "days?")
    for match in re.finditer(r"\bnet\s*(\d{1,3})\b", text.lower()):
        values.append(int(match.group(1)))
    return values


def _extract_month_values(text: str) -> list[int]:
    return _extract_values_with_unit(text, "months?")


def _max_risk(levels: list[str]) -> str:
    return max(levels, key=lambda lvl: SEVERITY_ORDER.get(lvl, 1))


def _evaluate_term_and_renewal(contract_text: str) -> ClauseResult | None:
    markers = [
        "auto-renew",
        "automatic renewal",
        "automatically renew",
        "renewal term",
        "notice of non-renewal",
        "non-renewal",
    ]
    if not _contains_any(contract_text, ["renew", "term"]):
        return None
    snippet = _snippet_around(contract_text, _pick_anchor(contract_text, markers))
    has_auto = _contains_any(snippet, ["auto-renew", "automatic renewal", "automatically renew"])
    notice_days = _extract_day_values(snippet)
    has_long_notice = any(days >= 60 for days in notice_days)
    if not (has_auto or has_long_notice):
        return None

    level = "CRITICAL" if has_auto and any(days >= 90 for days in notice_days) else "HIGH"
    reasons: list[str] = []
    if has_auto:
        reasons.append("contains auto-renewal language")
    if has_long_notice:
        reasons.append("requires long non-renewal notice (60+ days)")
    return ClauseResult(
        clause_type="Term & Renewal",
        extracted_text=snippet,
        risk_level=level,
        explanation="Term and renewal terms are risky because the clause " + " and ".join(reasons) + ".",
        negotiation_recommendation="Remove auto-renewal or require explicit written renewal; cap non-renewal notice at 30 days.",
    )


def _evaluate_fees_and_billing(contract_text: str) -> ClauseResult | None:
    markers = ["cpi +", "automatic increase", "fees shall increase", "net 15", "payment terms", "invoice"]
    if not _contains_any(contract_text, ["fee", "billing", "invoice", "payment", "price", "cpi"]):
        return None
    snippet = _snippet_around(contract_text, _pick_anchor(contract_text, markers))
    has_uncapped_increase = _contains_any(
        snippet,
        ["cpi +", "plus ten percent", "automatic increase", "sole discretion", "without cap", "uncapped"],
    )
    days = _extract_day_values(snippet)
    shortest = min(days) if days else None
    has_short_payment = shortest is not None and shortest <= 15
    if not (has_uncapped_increase or has_short_payment):
        return None

    levels: list[str] = []
    reasons: list[str] = []
    if has_uncapped_increase:
        levels.append("CRITICAL")
        reasons.append("uses uncapped or aggressive automatic price increases")
    if has_short_payment:
        levels.append("HIGH")
        reasons.append(f"imposes short payment terms (net {shortest})")
    return ClauseResult(
        clause_type="Fees & Billing",
        extracted_text=snippet,
        risk_level=_max_risk(levels),
        explanation="Fees and billing terms are risky because the clause " + " and ".join(reasons) + ".",
        negotiation_recommendation="Cap annual increases to the lesser of CPI or 3%, and change payment terms to net-30 or net-45.",
    )


def _evaluate_termination_rights(contract_text: str) -> ClauseResult | None:
    markers = ["terminate for convenience", "provider may terminate", "vendor may terminate", "customer may not terminate"]
    if not _contains_any(contract_text, ["terminate", "termination", "cancel"]):
        return None
    snippet = _snippet_around(contract_text, _pick_anchor(contract_text, markers))
    vendor_can = _contains_any(snippet, ["provider may terminate", "vendor may terminate", "supplier may terminate"])
    customer_restricted = _contains_any(
        snippet,
        ["customer may not terminate", "customer cannot terminate", "non-cancelable", "may not terminate for convenience"],
    )
    if not (vendor_can and customer_restricted):
        return None
    return ClauseResult(
        clause_type="Termination Rights",
        extracted_text=snippet,
        risk_level="CRITICAL",
        explanation="Termination rights are one-sided: vendor can terminate while customer rights are restricted.",
        negotiation_recommendation="Require mutual termination for convenience rights or remove convenience termination during initial term.",
    )


def _evaluate_data_security(contract_text: str) -> ClauseResult | None:
    markers = ["data breach", "security incident", "loss of data", "no liability", "not liable"]
    if not _contains_any(contract_text, ["data breach", "security", "loss of data", "confidentiality"]):
        return None
    snippet = _snippet_around(contract_text, _pick_anchor(contract_text, markers))
    no_vendor_liability = _contains_any(
        snippet,
        ["no liability", "disclaims all liability", "not liable", "customer assumes all risk", "no financial liability"],
    )
    if not no_vendor_liability:
        return None
    return ClauseResult(
        clause_type="Data Security",
        extracted_text=snippet,
        risk_level="CRITICAL",
        explanation="Security terms disclaim vendor financial liability for breaches or data loss.",
        negotiation_recommendation="Add explicit vendor indemnity and carve out data-breach losses from the general liability cap.",
    )


def _evaluate_limitation_of_liability(contract_text: str) -> ClauseResult | None:
    markers = ["limitation of liability", "aggregate liability", "in no event", "one (1) month", "preceding month", "$500"]
    if not _contains_any(contract_text, ["limitation of liability", "aggregate liability", "in no event"]):
        return None
    snippet = _snippet_around(contract_text, _pick_anchor(contract_text, markers))
    months = _extract_month_values(snippet)
    has_one_month_marker = _contains_any(snippet, ["one (1) month", "1 month", "preceding month", "prior month"])
    has_low_dollar_cap = _contains_any(snippet, ["$500", "usd 500", "500 dollars"])
    low_cap_months = min(months) if months else None
    has_low_cap = has_one_month_marker or has_low_dollar_cap or (low_cap_months is not None and low_cap_months < 12)
    if not has_low_cap:
        return None

    cap_text = "$500" if has_low_dollar_cap else (f"{low_cap_months} months" if low_cap_months is not None else "less than 12 months")
    level = "CRITICAL" if has_one_month_marker or has_low_dollar_cap or (low_cap_months is not None and low_cap_months <= 3) else "HIGH"
    return ClauseResult(
        clause_type="Limitation of Liability",
        extracted_text=snippet,
        risk_level=level,
        explanation=f"Liability cap appears too low ({cap_text}) for enterprise risk exposure.",
        negotiation_recommendation="Set liability cap to at least 12 months of fees, with carve-outs for data breach, confidentiality, and IP infringement.",
    )


def _score_from_clauses(clauses: list[ClauseResult]) -> int:
    score = round(sum(RISK_WEIGHTS.get(c.risk_level.upper(), 45) for c in clauses) / max(len(clauses), 1))
    critical_count = sum(1 for c in clauses if c.risk_level.upper() == "CRITICAL")
    if critical_count >= 3:
        score = max(score, 80)
    return max(0, min(100, score))


def _dimension_scores(clauses: list[ClauseResult]) -> dict[str, int]:
    by_type = {c.clause_type: RISK_WEIGHTS.get(c.risk_level.upper(), 45) for c in clauses}
    return {
        "liability_score": by_type.get("Limitation of Liability", 35),
        "renewal_risk_score": by_type.get("Term & Renewal", 35),
        "ip_ownership_score": 35,
        "termination_score": by_type.get("Termination Rights", 35),
        "payment_exposure_score": by_type.get("Fees & Billing", 35),
    }


def _heuristic_analysis(contract_text: str) -> AnalyzeResponse:
    evaluators = [
        _evaluate_term_and_renewal,
        _evaluate_fees_and_billing,
        _evaluate_termination_rights,
        _evaluate_data_security,
        _evaluate_limitation_of_liability,
    ]

    clauses: list[ClauseResult] = []
    red_flags: list[str] = []
    for evaluator in evaluators:
        clause = evaluator(contract_text)
        if clause is None:
            continue
        clauses.append(clause)
        if clause.risk_level.upper() in ("CRITICAL", "HIGH"):
            red_flags.append(f"{clause.clause_type}: {clause.explanation}")

    if not clauses:
        clauses = [
            ClauseResult(
                clause_type="General Risk Review",
                extracted_text=contract_text[:650] or "No extractable contract text.",
                risk_level="MEDIUM",
                explanation="No required high-risk category was clearly detected with heuristic analysis.",
                negotiation_recommendation="Run manual legal review across renewal, pricing, termination, security, and liability sections.",
            )
        ]

    score = _score_from_clauses(clauses)
    high_count = sum(1 for c in clauses if c.risk_level.upper() in ("HIGH", "CRITICAL"))
    dims = _dimension_scores(clauses)
    return AnalyzeResponse(
        overall_risk_score=score,
        executive_summary=(
            "Section-by-section review completed across required buyer-risk categories. "
            f"Detected {len(clauses)} risky clauses with {high_count} high/critical findings."
        ),
        red_flags=red_flags[:8],
        clauses=clauses,
        liability_score=dims["liability_score"],
        renewal_risk_score=dims["renewal_risk_score"],
        ip_ownership_score=dims["ip_ownership_score"],
        termination_score=dims["termination_score"],
        payment_exposure_score=dims["payment_exposure_score"],
    )


async def analyze_contract(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        if request.contract_text and request.contract_text.strip():
            contract_text = _normalize_whitespace(request.contract_text)
        elif request.s3_key:
            file_bytes = _fetch_contract_bytes(request.s3_key)
            contract_text = _extract_text(file_bytes, request.s3_key)
        else:
            raise ValueError("Either contract_text or s3_key must be provided.")

        if not contract_text:
            raise ValueError("Could not extract readable contract text from input.")

        try:
            return await _analyze_with_llm(request, contract_text)
        except Exception:
            if os.getenv("ALLOW_HEURISTIC_FALLBACK", "false").strip().lower() in {"1", "true", "yes"}:
                return _heuristic_analysis(contract_text)
            raise
    except Exception as exc:
        raise RuntimeError(f"AI analysis failed: {str(exc)}") from exc
