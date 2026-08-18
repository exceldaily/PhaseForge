// Versatile punch-list PDF text parser. Construction punch lists come in many
// layouts — plain numbered lists, "1) item" lists, and repeating title-block
// tables (ITEM / FLOOR / ROOM / SHEET / ISSUE / COMMENTS with the number on its
// own line). This turns any of them into { description, location } items.
//
// Strategy, in order of reliability:
//   1. Drop boilerplate: exact column-header keywords, and any line that
//      repeats on most pages (document title, address, GC, date, author).
//   2. An item starts at a line beginning with a number followed by text —
//      "1. ", "1) ", "1: ", or just "1   " (number + whitespace). Lines with a
//      bare number and nothing else (the table's echoed ITEM value) are skipped.
//   3. Lines with no leading number continue the current item's description.

export interface ParsedPunchItem { description: string; location: string | null }

const HEADER_KEYWORDS = new Set([
  'item', 'floor', 'room', 'sheet', 'issue', 'comments', 'comment', 'status',
  'description', 'description of work', 'location', 'trade', 'photo', 'picture',
  'before picture', 'after picture', 'not completed', 'completed', 'notes', 'note',
  'no.', 'no', '#', 'qty',
])

// "1. text" | "1) text" | "1: text" | "1 - text" | "1   text"
const NUMBERED = /^#?\s*(\d{1,4})\s*[.):\-]?\s+(\S.*)$/
// A line that is ONLY a number (the table echoes the item number alone).
const BARE_NUMBER = /^#?\s*\d{1,4}\s*$/

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function parsePunchPdfText(text: string): ParsedPunchItem[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // ── 1. Boilerplate detection by repetition ────────────────────────────────
  // Page headers/footers repeat on every page. Any non-item line appearing 3+
  // times is treated as boilerplate (title, address, GC, date, author, etc.).
  const freq = new Map<string, number>()
  for (const l of lines) freq.set(l, (freq.get(l) ?? 0) + 1)
  const isHeaderKeyword = (l: string) => HEADER_KEYWORDS.has(l.toLowerCase().replace(/[:\s]+$/, ''))
  const isBoilerplate = (l: string) =>
    isHeaderKeyword(l) || (!NUMBERED.test(l) && (freq.get(l) ?? 0) >= 3)

  // ── 2/3. Walk lines building items ────────────────────────────────────────
  const items: ParsedPunchItem[] = []
  let cur: string[] | null = null
  const flush = () => {
    if (cur) {
      const desc = normalize(cur.join(' '))
      if (desc.length >= 3) items.push({ description: desc, location: null })
    }
    cur = null
  }

  for (const line of lines) {
    if (isBoilerplate(line)) { flush(); continue }   // boundary + skip
    if (BARE_NUMBER.test(line)) { continue }          // echoed number, ignore
    const m = NUMBERED.exec(line)
    if (m) { flush(); cur = [m[2].trim()] }           // new item
    else if (cur) { cur.push(line) }                  // continuation
    // else: stray text before any item — ignore
  }
  flush()

  // De-duplicate identical descriptions (some exports print each item twice).
  const seen = new Set<string>()
  return items.filter((it) => {
    const key = it.description.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
