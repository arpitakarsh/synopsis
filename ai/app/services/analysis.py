import os
import re
from io import BytesIO
from urllib.parse import quote
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

from pypdf import PdfReader

from ..models.schemas import AnalyzeRequest, AnalyzeResponse, ClauseResult
from ..prompts import SYSTEM_PROMPT


RISK_WEIGHTS = {"LOW": 20, "MEDIUM": 45, "HIGH": 75, "CRITICAL": 90}
SEVERITY_ORDER = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
ACTIVE_ANALYSIS_POLICY = SYSTEM_PROMPT
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


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


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

    # If the caller already sent a full URL, try that first.
    if key.startswith("http://") or key.startswith("https://"):
        return [key]

    base = _cloudinary_raw_url(key)
    candidates = [base]
    lower_key = key.lower()
    if not lower_key.endswith(".pdf"):
        candidates.append(f"{base}.pdf")
    return candidates


def _fetch_contract_bytes(s3_key: str) -> bytes:
    errors: list[str] = []
    for url in _candidate_urls(s3_key):
        try:
            with urlopen(url, timeout=30) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            errors.append(f"{url} -> {str(exc)}")
            continue
    raise RuntimeError("Unable to fetch contract file. Attempts: " + " | ".join(errors))


def _extract_text(file_bytes: bytes, s3_key: str) -> str:
    is_pdf = s3_key.lower().endswith(".pdf") or file_bytes[:5] == b"%PDF-"
    if is_pdf:
        try:
            reader = PdfReader(BytesIO(file_bytes))
            pages = []
            for page in reader.pages:
                pages.append(page.extract_text() or "")
            return _normalize_whitespace(" ".join(pages))
        except Exception:
            # Fall back to best-effort text decode for malformed PDFs.
            pass

    try:
        return _normalize_whitespace(file_bytes.decode("utf-8", errors="ignore"))
    except Exception:
        return ""


def _snippet_around(text: str, keyword: str, radius: int = 260) -> str:
    idx = text.lower().find(keyword.lower())
    if idx < 0:
        return text[: min(len(text), 500)]
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
        "non-renewal",
        "notice of non-renewal",
        "term",
    ]
    lower = contract_text.lower()
    if not _contains_any(lower, ["renew", "term"]):
        return None

    anchor = _pick_anchor(contract_text, markers)
    snippet = _snippet_around(contract_text, anchor)
    snippet_lower = snippet.lower()
    has_auto_renewal = _contains_any(
        snippet_lower,
        ["auto-renew", "automatic renewal", "automatically renew", "renew automatically"],
    )
    notice_days = _extract_day_values(snippet)
    has_long_notice = any(days >= 60 for days in notice_days)

    if not (has_auto_renewal or has_long_notice):
        return None

    risk_level = "CRITICAL" if (has_auto_renewal and any(days >= 90 for days in notice_days)) else "HIGH"
    reasons: list[str] = []
    if has_auto_renewal:
        reasons.append("includes auto-renewal mechanics")
    if has_long_notice:
        reasons.append("requires long non-renewal notice (60+ days)")

    return ClauseResult(
        clause_type="Term & Renewal",
        extracted_text=snippet,
        risk_level=risk_level,
        explanation="Term and renewal language is risky because it " + " and ".join(reasons) + ".",
        negotiation_recommendation="Limit renewals to explicit written consent or cap non-renewal notice at 30 days.",
    )


def _evaluate_fees_and_billing(contract_text: str) -> ClauseResult | None:
    markers = [
        "cpi +",
        "automatic increase",
        "fees shall increase",
        "price increase",
        "net 15",
        "invoice",
        "payment terms",
    ]
    lower = contract_text.lower()
    if not _contains_any(lower, ["fee", "billing", "invoice", "payment", "price", "cpi"]):
        return None

    anchor = _pick_anchor(contract_text, markers)
    snippet = _snippet_around(contract_text, anchor)
    snippet_lower = snippet.lower()

    uncapped_markers = [
        "cpi +",
        "plus ten percent",
        "automatic increase",
        "automatically increase",
        "sole discretion",
        "without cap",
        "uncapped",
    ]
    has_uncapped_increase = _contains_any(snippet_lower, uncapped_markers)

    payment_days = _extract_day_values(snippet)
    shortest_payment = min(payment_days) if payment_days else None
    has_short_payment = shortest_payment is not None and shortest_payment <= 15

    if not (has_uncapped_increase or has_short_payment):
        return None

    levels: list[str] = []
    reasons: list[str] = []
    if has_uncapped_increase:
        levels.append("CRITICAL")
        reasons.append("uses uncapped or aggressive automatic fee increases")
    if has_short_payment:
        levels.append("HIGH")
        reasons.append(f"imposes short payment terms (net {shortest_payment})")

    return ClauseResult(
        clause_type="Fees & Billing",
        extracted_text=snippet,
        risk_level=_max_risk(levels),
        explanation="Billing terms are risky because the clause " + " and ".join(reasons) + ".",
        negotiation_recommendation="Cap annual increases at the lesser of CPI or 3%, and require net-30 or net-45 payment terms.",
    )


def _evaluate_termination_rights(contract_text: str) -> ClauseResult | None:
    markers = [
        "terminate for convenience",
        "provider may terminate",
        "vendor may terminate",
        "customer may not terminate",
        "termination",
    ]
    lower = contract_text.lower()
    if not _contains_any(lower, ["terminate", "termination", "cancel"]):
        return None

    anchor = _pick_anchor(contract_text, markers)
    snippet = _snippet_around(contract_text, anchor)
    snippet_lower = snippet.lower()

    vendor_side = _contains_any(
        snippet_lower,
        [
            "provider may terminate",
            "vendor may terminate",
            "supplier may terminate",
            "company may terminate",
        ],
    )
    customer_restricted = _contains_any(
        snippet_lower,
        [
            "customer may not terminate",
            "customer cannot terminate",
            "for cause only",
            "non-cancelable",
            "non cancellable",
            "may not terminate for convenience",
        ],
    )
    one_sided = vendor_side and customer_restricted

    if not one_sided:
        return None

    return ClauseResult(
        clause_type="Termination Rights",
        extracted_text=snippet,
        risk_level="CRITICAL",
        explanation="Termination rights are one-sided: vendor retains broad cancellation rights while customer termination is restricted.",
        negotiation_recommendation="Require mutual termination rights and remove one-way convenience termination during the initial term.",
    )


def _evaluate_data_security(contract_text: str) -> ClauseResult | None:
    markers = [
        "data breach",
        "security incident",
        "loss of data",
        "no liability",
        "not liable",
    ]
    lower = contract_text.lower()
    has_security_context = _contains_any(lower, ["data breach", "security", "loss of data", "confidentiality"])
    if not has_security_context:
        return None

    anchor = _pick_anchor(contract_text, markers)
    snippet = _snippet_around(contract_text, anchor)
    snippet_lower = snippet.lower()

    disclaimer_markers = [
        "no liability",
        "disclaims all liability",
        "not liable",
        "customer assumes all risk",
        "no financial liability",
    ]
    no_vendor_liability = _contains_any(snippet_lower, disclaimer_markers)
    if not no_vendor_liability:
        return None

    return ClauseResult(
        clause_type="Data Security",
        extracted_text=snippet,
        risk_level="CRITICAL",
        explanation="Security clause disclaims vendor financial responsibility for breaches or data loss.",
        negotiation_recommendation="Add vendor indemnity and uncapped liability for breaches caused by vendor negligence or security failure.",
    )


def _evaluate_limitation_of_liability(contract_text: str) -> ClauseResult | None:
    markers = [
        "limitation of liability",
        "aggregate liability",
        "in no event",
        "preceding month",
        "one (1) month",
    ]
    lower = contract_text.lower()
    if not _contains_any(lower, ["limitation of liability", "aggregate liability", "in no event"]):
        return None

    anchor = _pick_anchor(contract_text, markers)
    snippet = _snippet_around(contract_text, anchor)
    snippet_lower = snippet.lower()

    months = _extract_month_values(snippet)
    has_one_month_marker = _contains_any(
        snippet_lower,
        ["one (1) month", "1 month", "preceding month", "prior month"],
    )
    low_cap_months = min(months) if months else None
    has_low_cap = has_one_month_marker or (low_cap_months is not None and low_cap_months < 12)

    if not has_low_cap:
        return None

    level = "CRITICAL" if (low_cap_months is None or low_cap_months <= 3 or has_one_month_marker) else "HIGH"
    cap_text = f"{low_cap_months} months" if low_cap_months is not None else "less than 12 months"

    return ClauseResult(
        clause_type="Limitation of Liability",
        extracted_text=snippet,
        risk_level=level,
        explanation=f"Liability cap appears too low ({cap_text}), which may not cover realistic enterprise losses.",
        negotiation_recommendation="Set liability cap to at least 12 months of fees and carve out confidentiality, IP, and data-breach liabilities.",
    )


def _heuristic_analysis(contract_text: str) -> AnalyzeResponse:
    clauses: list[ClauseResult] = []
    red_flags: list[str] = []
    evaluators = [
        _evaluate_term_and_renewal,
        _evaluate_fees_and_billing,
        _evaluate_termination_rights,
        _evaluate_data_security,
        _evaluate_limitation_of_liability,
    ]

    for evaluator in evaluators:
        clause = evaluator(contract_text)
        if clause is None:
            continue
        clauses.append(clause)
        if clause.risk_level.upper() in ("CRITICAL", "HIGH"):
            red_flags.append(f"{clause.clause_type}: {clause.explanation}")

    if not clauses:
        clauses.append(
            ClauseResult(
                clause_type="General Risk Review",
                extracted_text=contract_text[:500] or "No extractable contract text.",
                risk_level="MEDIUM",
                explanation="No known high-risk clause patterns were detected with heuristics.",
                negotiation_recommendation="Run manual legal review for data protection, liability, termination, and pricing protections.",
            )
        )

    score = round(sum(RISK_WEIGHTS.get(c.risk_level.upper(), 45) for c in clauses) / max(len(clauses), 1))
    score = max(0, min(100, score))
    high_count = sum(1 for c in clauses if c.risk_level.upper() in ("HIGH", "CRITICAL"))
    summary = (
        "Section-by-section review completed across 5 required categories. "
        f"Detected {len(clauses)} risky category clauses with {high_count} high/critical findings."
    )

    return AnalyzeResponse(
        overall_risk_score=score,
        executive_summary=summary,
        red_flags=red_flags[:6],
        clauses=clauses,
    )


async def analyze_contract(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        file_bytes = _fetch_contract_bytes(request.s3_key)
        contract_text = _extract_text(file_bytes, request.s3_key)

        if not contract_text:
            return AnalyzeResponse(
                overall_risk_score=55,
                executive_summary="Could not extract contract text reliably. Returning baseline risk and requiring manual review.",
                red_flags=["Contract text could not be extracted from uploaded file."],
                clauses=[
                    ClauseResult(
                        clause_type="Extraction Failure",
                        extracted_text="No readable text could be extracted.",
                        risk_level="HIGH",
                        explanation="AI could not parse the uploaded document content.",
                        negotiation_recommendation="Re-upload a text-based PDF (not a scanned image) or add OCR before analysis.",
                    )
                ],
            )

        # Primary mode: deterministic text-driven analysis (varies per contract text).
        # If you later add LLM generation, keep this as a fallback for reliability.
        return _heuristic_analysis(contract_text)
    except Exception as exc:
        # Always return a valid schema payload so backend does not receive hard 500s for recoverable analysis failures.
        return AnalyzeResponse(
            overall_risk_score=60,
            executive_summary="Automated analysis could not fully process this file. Returning fallback risk output; manual legal review recommended.",
            red_flags=[f"Analyzer fallback triggered: {str(exc)}"],
            clauses=[
                ClauseResult(
                    clause_type="Analyzer Fallback",
                    extracted_text=request.s3_key,
                    risk_level="HIGH",
                    explanation="The analyzer encountered an internal processing error while fetching or parsing the uploaded file.",
                    negotiation_recommendation="Verify file accessibility and format, then re-run analysis. If repeated, inspect AI service logs for root cause.",
                )
            ],
        )
