'use client'

// Sheet-number / title / revision detection from a drawing page's text layer.
// Construction title blocks live along the right edge or bottom strip of the
// sheet, with the sheet number in the bottom-right corner — detection weights
// candidates by position so "A1.01" in a plan note doesn't beat the real one.

import { DISCIPLINE_PREFIXES } from './constants'
import type { PageText } from './pdf'

// "A1.01" "M-101" "E2.3" "FP1.01" "S0.00" "T-1" "A10.02a"
const SHEET_NUMBER_RE = /^[A-Z]{1,3}[-.]?\d{1,3}(\.\d{1,3})?[a-zA-Z]?$/
// Junk that matches the shape but is never a sheet number
const SHEET_NUMBER_BLACKLIST = /^(NO\.?\d*|RM\d+|PG\d+|P\d{4,}|[A-Z]\d{4,})$/

const REV_RE = /\b(?:REV(?:ISION)?\.?\s*[:#]?\s*)(\d{1,2}|[A-Z])\b/i
const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g

export interface DetectionResult {
  sheetNumber: string | null
  title: string | null
  discipline: string | null
  revisionLabel: string | null
  revisionDate: string | null
  confident: boolean
}

export function disciplineFromSheetNumber(num: string): string | null {
  const prefix = num.match(/^([A-Z]{1,3})/)?.[1]
  if (!prefix) return null
  return DISCIPLINE_PREFIXES[prefix] ?? DISCIPLINE_PREFIXES[prefix[0]] ?? null
}

/** Positional weight: bottom-right corner scores highest, then right edge, then bottom strip. */
function positionScore(x: number, y: number): number {
  let score = 0
  if (x > 0.78 && y > 0.78) score += 6        // bottom-right corner (classic title block)
  else if (x > 0.82) score += 3               // right-edge title block
  else if (y > 0.85) score += 2               // bottom-strip title block
  if (x > 0.9 && y > 0.9) score += 3          // extreme corner bonus
  return score
}

export function detectSheetInfo(text: PageText): DetectionResult {
  // ── Sheet number: score every token that looks like one ──
  let best: { num: string; score: number } | null = null
  for (const item of text.items) {
    const token = item.str.trim().toUpperCase()
    if (token.length < 2 || token.length > 10) continue
    if (!SHEET_NUMBER_RE.test(token) || SHEET_NUMBER_BLACKLIST.test(token)) continue
    let score = positionScore(item.x, item.y)
    if (/\d\.\d/.test(token)) score += 2      // "A1.01" style beats bare "A1"
    if (disciplineFromSheetNumber(token)) score += 1
    if (score > 0 && (!best || score > best.score)) best = { num: token, score }
  }
  // Fallback: any plausible number anywhere (still useful on odd layouts)
  if (!best) {
    for (const item of text.items) {
      const token = item.str.trim().toUpperCase()
      if (SHEET_NUMBER_RE.test(token) && !SHEET_NUMBER_BLACKLIST.test(token) && /\d\.\d/.test(token)) {
        best = { num: token, score: 0 }
        break
      }
    }
  }

  const sheetNumber = best?.num ?? null
  const confident = (best?.score ?? 0) >= 4

  // ── Title: the longest mostly-uppercase text run near the title block, that
  //    isn't an address/date/number and isn't tiny boilerplate. ──
  let title: string | null = null
  let titleScore = 0
  for (const item of text.items) {
    const s = item.str.trim()
    if (s.length < 6 || s.length > 60) continue
    const letters = s.replace(/[^A-Za-z]/g, '')
    if (letters.length < 5) continue
    const upperRatio = letters.replace(/[^A-Z]/g, '').length / letters.length
    if (upperRatio < 0.8) continue
    if (/\d{2,}/.test(s) && !/PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE|NOTES/i.test(s)) continue
    if (/^(SCALE|DATE|DRAWN|CHECKED|PROJECT|SHEET|DRAWING|REVISION|COPYRIGHT|ALL RIGHTS)/i.test(s)) continue
    let score = positionScore(item.x, item.y) + Math.min(s.length / 12, 3)
    if (/PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE|NOTES|COVER|LEGEND|RISER|DIAGRAM/i.test(s)) score += 3
    if (score > titleScore) { titleScore = score; title = s }
  }

  // ── Revision + date near the title block ──
  let revisionLabel: string | null = null
  let revisionDate: string | null = null
  const blockText = text.items
    .filter((i) => positionScore(i.x, i.y) > 0)
    .map((i) => i.str)
    .join(' ')
  const rev = blockText.match(REV_RE)
  if (rev) revisionLabel = rev[1].toUpperCase()
  const dates = [...blockText.matchAll(DATE_RE)].map((m) => m[1])
  if (dates.length) {
    // Latest date in the block is almost always the current issue/revision date
    const parsed = dates
      .map((d) => ({ d, t: Date.parse(normalizeDate(d) ?? '') }))
      .filter((x) => !isNaN(x.t))
      .sort((a, b) => b.t - a.t)
    if (parsed.length) revisionDate = normalizeDate(parsed[0].d)
  }

  return {
    sheetNumber,
    title: title ? toTitleCase(title) : null,
    discipline: sheetNumber ? disciplineFromSheetNumber(sheetNumber) : null,
    revisionLabel,
    revisionDate,
    confident,
  }
}

/**
 * Sheet number from a FILENAME — individual sheet PDFs are usually named
 * things like "A1.01 First Floor Plan.pdf" or "M-101_Mechanical.pdf".
 */
export function filenameSheetNumber(name: string): string | null {
  const base = name.replace(/\.pdf$/i, '').trim()
  const m = base.match(/^([A-Za-z]{1,3}[-.]?\d{1,3}(?:\.\d{1,3})?[A-Za-z]?)(?=[\s_\-.]|$)/)
  if (!m) return null
  const token = m[1].toUpperCase()
  return SHEET_NUMBER_BLACKLIST.test(token) ? null : token
}

/** Human title from a filename once the sheet number is stripped. */
export function filenameTitle(name: string): string {
  let base = name.replace(/\.pdf$/i, '').trim()
  const num = filenameSheetNumber(name)
  if (num) base = base.slice(num.length)
  base = base.replace(/[_]+/g, ' ').replace(/^[\s\-–—.]+/, '').replace(/\s{2,}/g, ' ').trim()
  return base ? toTitleCase(base) : ''
}

function normalizeDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!m) return null
  const [, mm, dd] = m
  let yy = m[3]
  if (yy.length === 2) yy = (parseInt(yy) > 50 ? '19' : '20') + yy
  const month = parseInt(mm), day = parseInt(dd), year = parseInt(yy)
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1950 || year > 2100) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) =>
    w.length <= 2 && !/^(of|to|in|at|on|by)$/i.test(w)
      ? w.toUpperCase()
      : w[0].toUpperCase() + w.slice(1).toLowerCase(),
  )
}
