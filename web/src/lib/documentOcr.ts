'use client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocType = 'NATIONAL_ID' | 'PASSPORT' | 'REFUGEE_CARD' | 'DRIVERS_LICENSE' | 'OTHER'

export interface ExtractedDocument {
  doc_type: DocType
  doc_number: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null        // ISO date YYYY-MM-DD
  nationality: string | null           // ISO 3166-1 alpha-3
  gender: string | null
  expiry_date: string | null          // ISO date
  issuing_country: string | null
  issuing_authority: string | null
  mrz_line1: string | null
  mrz_line2: string | null
  raw_ocr_text: string
  scan_method: 'OCR_AUTO' | 'OCR_ASSISTED' | 'MANUAL'
  ocr_confidence: number              // 0-100
}

export interface OcrResult {
  text: string
  confidence: number
}

// ─── MRZ parser (ICAO TD3 passports + TD1 ID cards) ──────────────────────────

function mrzDateToISO(d: string): string | null {
  // YYMMDD → YYYY-MM-DD, pivot at 30
  if (!/^\d{6}$/.test(d)) return null
  const yy = parseInt(d.slice(0, 2))
  const mm = d.slice(2, 4)
  const dd = d.slice(4, 6)
  const yyyy = yy <= 30 ? 2000 + yy : 1900 + yy
  return `${yyyy}-${mm}-${dd}`
}

function mrzGender(c: string): string {
  if (c === 'M') return 'M'
  if (c === 'F') return 'F'
  return 'U'
}

// ICAO TD3 (passport) — two 44-char lines
function parseTD3(line1: string, line2: string): Partial<ExtractedDocument> {
  if (line1.length < 44 || line2.length < 44) return {}

  // Line 1: P<XXX<SURNAME<<GIVEN<NAMES<<<...
  const countryCode = line1.slice(2, 5).replace(/<$/,'')
  const names = line1.slice(5).replace(/</g, ' ').trim().split('  ')
  const last_name  = (names[0] ?? '').trim() || null
  const first_name = (names.slice(1).join(' ')).trim() || null

  // Line 2: DOCNUMBER<X<NATIONALITY<YYMMDD<X<YYMMDD<X<<<<<<<<<<<X
  const doc_number  = line2.slice(0, 9).replace(/</g, '').trim() || null
  const nationality = line2.slice(10, 13).replace(/<$/,'')
  const dob         = mrzDateToISO(line2.slice(13, 19))
  const gender      = mrzGender(line2[20] ?? '')
  const expiry      = mrzDateToISO(line2.slice(21, 27))

  return {
    doc_type: 'PASSPORT',
    doc_number,
    first_name,
    last_name,
    full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
    nationality: nationality || null,
    issuing_country: countryCode || null,
    date_of_birth: dob,
    gender,
    expiry_date: expiry,
    mrz_line1: line1,
    mrz_line2: line2,
  }
}

// ICAO TD1 (ID card) — three 30-char lines (we use first two meaningful ones)
function parseTD1(line1: string, line2: string, line3?: string): Partial<ExtractedDocument> {
  if (line1.length < 30 || line2.length < 30) return {}

  const countryCode = line1.slice(2, 5).replace(/<$/,'')
  const doc_number  = line1.slice(5, 14).replace(/</g, '').trim() || null
  const dob         = mrzDateToISO(line2.slice(0, 6))
  const gender      = mrzGender(line2[7] ?? '')
  const expiry      = mrzDateToISO(line2.slice(8, 14))
  const nationality = line2.slice(15, 18).replace(/<$/,'')

  let first_name: string | null = null
  let last_name:  string | null = null
  if (line3) {
    const parts = line3.replace(/</g, ' ').trim().split('  ')
    last_name  = (parts[0] ?? '').trim() || null
    first_name = (parts.slice(1).join(' ')).trim() || null
  }

  return {
    doc_type: 'NATIONAL_ID',
    doc_number,
    first_name,
    last_name,
    full_name: [first_name, last_name].filter(Boolean).join(' ') || null,
    nationality: nationality || null,
    issuing_country: countryCode || null,
    date_of_birth: dob,
    gender,
    expiry_date: expiry,
    mrz_line1: line1,
    mrz_line2: line2,
  }
}

// Find MRZ lines in raw OCR text
function extractMrzLines(text: string): string[] {
  // MRZ lines contain mostly alphanumeric + < characters
  const lines = text.split('\n').map(l => l.replace(/\s+/g, '').toUpperCase())
  return lines.filter(l => l.length >= 30 && /^[A-Z0-9<]{30,44}$/.test(l))
}

export function parseMrz(ocrText: string): Partial<ExtractedDocument> {
  const mrzLines = extractMrzLines(ocrText)
  if (mrzLines.length >= 2) {
    // TD3 passport: two 44-char lines
    const td3Lines = mrzLines.filter(l => l.length === 44)
    if (td3Lines.length >= 2) {
      const parsed = parseTD3(td3Lines[0], td3Lines[1])
      if (parsed.doc_number) return parsed
    }
    // TD1 ID card: three 30-char lines
    const td1Lines = mrzLines.filter(l => l.length === 30)
    if (td1Lines.length >= 2) {
      const parsed = parseTD1(td1Lines[0], td1Lines[1], td1Lines[2])
      if (parsed.doc_number) return parsed
    }
    // Fallback: try any two longest lines
    const sorted = [...mrzLines].sort((a, b) => b.length - a.length)
    const p = parseTD3(sorted[0], sorted[1])
    if (p.doc_number) return p
  }
  return {}
}

// ─── Rwanda NID text patterns ────────────────────────────────────────────────

function parseRwandaNID(text: string): Partial<ExtractedDocument> {
  const upper = text.toUpperCase()
  const result: Partial<ExtractedDocument> = { doc_type: 'NATIONAL_ID', nationality: 'RWA', issuing_country: 'RWA' }

  // NID number: 16 digits
  const nidMatch = text.match(/\b(\d{16})\b/)
  if (nidMatch) result.doc_number = nidMatch[1]

  // Name patterns: "NAMES: JOHN DOE" or "NOM: ..." or just CAPS words
  const nameMatch = text.match(/(?:names?|nom|prénom)[:\s]+([A-ZÀ-Ÿ][A-ZÀ-Ÿ\s]{2,40})/i)
  if (nameMatch) {
    const parts = nameMatch[1].trim().split(/\s+/)
    result.first_name = parts[0] ?? null
    result.last_name  = parts.slice(1).join(' ') || null
    result.full_name  = nameMatch[1].trim()
  }

  // DOB patterns: "01/01/1990" or "01-01-1990" or "DATE OF BIRTH: ..."
  const dobMatch = text.match(/(?:date of birth|dob|né[e]?\s*le|naissance)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i)
    ?? text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/)
  if (dobMatch) {
    const parts = dobMatch[1].split(/[\/\-\.]/)
    if (parts.length === 3) {
      result.date_of_birth = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
    }
  }

  // Gender
  if (/\bMALE\b|\bM\b/.test(upper)) result.gender = 'M'
  else if (/\bFEMALE\b|\bF\b/.test(upper)) result.gender = 'F'

  // Expiry date
  const expMatch = text.match(/(?:expiry|expires?|valid until|validité)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i)
  if (expMatch) {
    const parts = expMatch[1].split(/[\/\-]/)
    if (parts.length === 3) {
      result.expiry_date = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
    }
  }

  return result
}

// ─── Main extraction function ────────────────────────────────────────────────

export function extractDocumentData(
  ocrText: string,
  confidence: number,
  hintDocType?: DocType,
): ExtractedDocument {
  const base: ExtractedDocument = {
    doc_type: hintDocType ?? 'OTHER',
    doc_number: null,
    full_name: null,
    first_name: null,
    last_name: null,
    date_of_birth: null,
    nationality: null,
    gender: null,
    expiry_date: null,
    issuing_country: null,
    issuing_authority: null,
    mrz_line1: null,
    mrz_line2: null,
    raw_ocr_text: ocrText,
    scan_method: 'OCR_AUTO',
    ocr_confidence: confidence,
  }

  // Try MRZ first (most reliable)
  const mrzData = parseMrz(ocrText)
  if (mrzData.doc_number) {
    return { ...base, ...mrzData, raw_ocr_text: ocrText, ocr_confidence: confidence, scan_method: 'OCR_AUTO' }
  }

  // Try Rwanda NID text patterns
  const nidData = parseRwandaNID(ocrText)
  if (nidData.doc_number) {
    return { ...base, ...nidData, raw_ocr_text: ocrText, ocr_confidence: confidence, scan_method: 'OCR_AUTO' }
  }

  // Nothing extracted — return raw text for manual review
  return { ...base, scan_method: 'OCR_ASSISTED', raw_ocr_text: ocrText, ocr_confidence: confidence }
}

// ─── Run Tesseract OCR (client-side, lazy loaded) ─────────────────────────────

export async function runOcr(
  imageSource: File | HTMLImageElement | string,
  onProgress?: (pct: number) => void,
): Promise<OcrResult> {
  // Dynamic import — keeps Tesseract out of SSR bundle
  const Tesseract = await import('tesseract.js')

  const result = await Tesseract.recognize(imageSource, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100))
      }
    },
  })

  return {
    text: result.data.text,
    confidence: result.data.confidence,
  }
}
