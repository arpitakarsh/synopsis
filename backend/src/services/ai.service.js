const axios  = require('axios')
const prisma = require('../lib/prisma')

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

async function extractContractText(s3Key) {
  if (!s3Key) return ''

  const response = await axios.get(s3Key, {
    responseType: 'arraybuffer',
    timeout: 60000,
  })

  const buffer = Buffer.from(response.data)
  const header = buffer.subarray(0, 5).toString('utf8')
  const isPdf = header === '%PDF-'

  if (isPdf) {
    try {
      const pdfParse = require('pdf-parse')
      const parsed = await pdfParse(buffer)
      const text = normalizeWhitespace(parsed?.text)
      if (text) return text
    } catch (_) {
      // Fall through to plain decoding below.
    }
  }

  return normalizeWhitespace(buffer.toString('utf8'))
}

function normalizeRiskLevel(value) {
  const raw = String(value || '').trim().toUpperCase()
  if (raw.includes('CRIT')) return 'CRITICAL'
  if (raw.includes('HIGH')) return 'HIGH'
  if (raw.includes('MED')) return 'MEDIUM'
  if (raw.includes('LOW')) return 'LOW'
  return 'LOW'
}

function coerceObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseJsonString(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch (_) {
    // Try extracting JSON from markdown code fences or mixed text.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim())
      } catch (_) {
        return null
      }
    }
    return null
  }
}

function pickFirst(...values) {
  return values.find(v => v !== undefined && v !== null)
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v ?? '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|;/)
      .map(v => v.replace(/^[\s*\-•]+/, '').trim())
      .filter(Boolean)
  }
  return []
}

function toClauseArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(raw => coerceObject(raw))
    .map(clause => ({
      clause_type: pickFirst(clause.clause_type, clause.clauseType, 'General Clause'),
      extracted_text: pickFirst(clause.extracted_text, clause.extractedText, ''),
      risk_level: pickFirst(clause.risk_level, clause.riskLevel, 'LOW'),
      explanation: pickFirst(clause.explanation, 'No explanation provided by AI.'),
      negotiation_recommendation: pickFirst(
        clause.negotiation_recommendation,
        clause.negotiationRecommendation,
        'No recommendation provided.'
      ),
    }))
}

function scoreFromClauses(clauses) {
  if (!clauses.length) return 0
  const weights = { LOW: 20, MEDIUM: 45, HIGH: 75, CRITICAL: 90 }
  const total = clauses.reduce((sum, clause) => {
    const level = normalizeRiskLevel(clause.risk_level)
    return sum + (weights[level] || 20)
  }, 0)
  return Math.max(0, Math.min(100, Math.round(total / clauses.length)))
}

function normalizeAnalysisPayload(rawPayload) {
  let payload = rawPayload
  const parsedTopLevel = parseJsonString(payload)
  if (parsedTopLevel) payload = parsedTopLevel

  const base = coerceObject(payload)
  const nested = coerceObject(
    pickFirst(
      base.analysis,
      base.result,
      base.output,
      base.response,
      base.data
    )
  )
  const source = Object.keys(nested).length ? nested : base

  const clauses = toClauseArray(
    pickFirst(source.clauses, source.clause_analysis, source.clauseAnalysis, [])
  )
  const overallRiskScore = toNumber(
    pickFirst(
      source.overall_risk_score,
      source.overallRiskScore,
      source.risk_score,
      source.riskScore
    )
  )
  const executiveSummary = String(
    pickFirst(
      source.executive_summary,
      source.executiveSummary,
      source.summary,
      'No executive summary provided by AI.'
    ) || ''
  ).trim() || 'No executive summary provided by AI.'
  const redFlags = toStringArray(
    pickFirst(
      source.red_flags,
      source.redFlags,
      source.key_risks,
      source.keyRisks,
      []
    )
  )

  return {
    overall_risk_score: overallRiskScore ?? scoreFromClauses(clauses),
    executive_summary: executiveSummary,
    red_flags: redFlags,
    clauses,
  }
}

async function analyzeContract(contractId, s3Key, metadata = {}) {
  try {
    const vendorName = String(metadata.vendorName || '').trim()
    const contractTitle = String(metadata.contractTitle || metadata.fileName || '').trim()
    let contractText = String(metadata.contractText || '').trim()
    if (!contractText) {
      contractText = await extractContractText(s3Key)
    }
    if (!contractText) {
      contractText = [
        'Contract text extraction failed.',
        `Contract title: ${contractTitle || 'Unknown'}`,
        `Vendor name: ${vendorName || 'Unknown'}`,
        `Source key: ${s3Key || 'Unavailable'}`,
      ].join('\n')
    }

    const response = await axios.post(
      `${process.env.AI_SERVICE_URL}/analyze`,
      {
        contract_id: contractId,
        s3_key: s3Key,
        contract_title: contractTitle,
        vendor_name: vendorName,
        contract_text: contractText,
      },
      { timeout: 120000 }
    )

    const normalized = normalizeAnalysisPayload(response.data)
    const {
      overall_risk_score,
      executive_summary,
      red_flags,
      clauses,
    } = normalized

    const safeClauses = Array.isArray(clauses) ? clauses : []

    await prisma.$transaction([
      prisma.clause.deleteMany({
        where: { contractId },
      }),
      prisma.contract.update({
        where: { id: contractId },
        data: {
          overallRiskScore: overall_risk_score,
          executiveSummary: executive_summary,
          redFlags:  Array.isArray(red_flags) ? red_flags : [],
          status:   'DONE',
          processedAt: new Date(),
        },
      }),
      ...safeClauses.map(clause =>
        prisma.clause.create({
          data: {
            contractId,
            clauseType: clause.clause_type || 'General Clause',
            extractedText: clause.extracted_text || '',
            riskLevel: normalizeRiskLevel(clause.risk_level),
            explanation: clause.explanation || 'No explanation provided by AI.',
            negotiationRecommendation: clause.negotiation_recommendation || 'No recommendation provided.',
          },
        })
      ),
    ])

    console.log(`Contract ${contractId} analyzed successfully`)
  } catch (err) {
    const detail = err?.response?.data
      ? JSON.stringify(err.response.data)
      : err.message
    console.error(`Analysis failed for contract ${contractId}:`, detail)

    await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: 'ERROR',
        errorMessage: detail,
      },
    })
  }
}

module.exports = { analyzeContract }
