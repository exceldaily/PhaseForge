// "Type it" for the calendar: turn one line like
//   "Oct 12 Gulf Breeze set cases"
//   "move Stuart startup to Friday"
//   "10/14-10/16 2533 rack set Venezia"
// into a date (or range), an optional time, a job, a super, and what is being
// done. Pure pattern matching, no AI and no outside service: the same text
// always reads the same way, and it works offline.
//
// Reading order matters. Dates and times come out first because their shapes
// are unmistakable (10/12, Oct 12, Friday, 7am). Then the super, then the
// job, matched against the company's own project names and job numbers.
// Whatever is left is the title.

import { addDaysIso, diffDaysIso, dowIso, makeIso, monthOf, startOfWeekIso, yearOf, dayOf } from './dates'

export interface QaProject { id: string; name: string; jobNumber: string | null }
export interface QaSuper { id: string; name: string }

export interface QaParse {
  startDate: string | null
  endDate: string | null
  /** "from Oct 3 to Oct 5" typed with a move word: where it is now. */
  fromDate: string | null
  /** 'HH:MM', 24 hour. */
  startTime: string | null
  endTime: string | null
  /** Best job matches, best first. More than one means a tie to choose from. */
  projects: QaProject[]
  superId: string | null
  /** The super's name as typed, in case it doubles as the work ("Startup"). */
  superText: string
  title: string
  /** A move word was typed (move, push, bump, reschedule). */
  move: boolean
}

const SEP = '\uE000'

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
}

const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?'
const DAYNUM = '(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)'
const YEAR = '(?:,?\\s+(20\\d{2})(?!\\d))?'
const TO = '\\s*(?:-|\u2013|to|thru|through|until|till)\\s*'
const NOT_TIME = '(?!\\s*(?:am|pm|a\\b|p\\b|:\\d))'
const WD = '(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:s|nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)'

/** Words that show up in lots of job names and say nothing about which job. */
const GENERIC = new Set([
  'cap', 'capx', 'sup', 'ground', 'up', 'club', 'fuel', 'station', 'store', 'plan', 'example', 'work',
  'condenser', 'condensers', 'combo', 'conbo', 'st', 'the', 'and', 'of', 'new', 'remodel', 'project', 'job',
])
const FILLER = new Set(['on', 'at', 'for', 'to', 'from', 'in', 'by', 'the', 'of', 'with', 'is', 'now', 'then'])
const MATCH_THRESHOLD = 0.3

/** A date with no year means the next time it comes around, within reason. */
function inferYear(month: number, day: number, today: string): string | null {
  const y = yearOf(today)
  const thisYear = makeIso(y, month, day)
  if (thisYear && diffDaysIso(thisYear, today) <= 60) return thisYear
  return makeIso(y + 1, month, day) ?? thisYear
}
function withYear(month: number, day: number, year: string | undefined, today: string): string | null {
  if (!year) return inferYear(month, day, today)
  const y = year.length <= 2 ? 2000 + Number(year) : Number(year)
  return makeIso(y, month, day)
}

/** The next time this weekday comes around, today included. */
function nextWeekday(dow: number, today: string, mod: string | undefined): string {
  const ahead = (dow - dowIso(today) + 7) % 7
  if (mod?.toLowerCase() === 'next') return addDaysIso(startOfWeekIso(today), 7 + dow)
  return addDaysIso(today, ahead)
}

interface DateHit { start: string; end: string; index: number; length: number; range: boolean }

function findDate(s: string, today: string): DateHit | null {
  const tries: [RegExp, (m: RegExpExecArray) => { start: string | null; end?: string | null } | null][] = [
    // Oct 12-14, Oct 12 to Oct 14, Oct 30 - Nov 2
    [new RegExp(`\\b${MON}\\s+${DAYNUM}${TO}(?:${MON}\\s+)?${DAYNUM}${NOT_TIME}${YEAR}`, 'i'), (m) => {
      const m1 = MONTHS[m[1].toLowerCase().replace('.', '')]
      const m2 = m[3] ? MONTHS[m[3].toLowerCase().replace('.', '')] : m1
      const start = withYear(m1, Number(m[2]), m[5], today)
      let end = start ? makeIso(yearOf(start), m2, Number(m[4])) : null
      if (start && end && end < start) end = makeIso(yearOf(start) + 1, m2, Number(m[4]))
      return { start, end }
    }],
    // 10/12-10/14, 10/12-14
    [new RegExp(`\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${TO}(?:(\\d{1,2})/)?(\\d{1,2})(?:/(\\d{2}|\\d{4}))?(?![\\d/])${NOT_TIME}`, 'i'), (m) => {
      const start = withYear(Number(m[1]), Number(m[2]), m[3] ?? m[6], today)
      let end = start ? makeIso(yearOf(start), m[4] ? Number(m[4]) : Number(m[1]), Number(m[5])) : null
      if (start && end && end < start) end = makeIso(yearOf(start) + 1, m[4] ? Number(m[4]) : Number(m[1]), Number(m[5]))
      return { start, end }
    }],
    // 2026-10-12
    [/\b(\d{4})-(\d{2})-(\d{2})\b/, (m) => ({ start: makeIso(Number(m[1]), Number(m[2]), Number(m[3])) })],
    // Oct 12, October 12th, 2026
    [new RegExp(`\\b${MON}\\s+${DAYNUM}${YEAR}`, 'i'), (m) => ({ start: withYear(MONTHS[m[1].toLowerCase().replace('.', '')], Number(m[2]), m[3], today) })],
    // 12 Oct, 12th of October
    [new RegExp(`\\b${DAYNUM}\\s+(?:of\\s+)?${MON}(?![a-z])${YEAR}`, 'i'), (m) => ({ start: withYear(MONTHS[m[2].toLowerCase().replace('.', '')], Number(m[1]), m[3], today) })],
    // 10/12, 10/12/26
    [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/, (m) => ({ start: withYear(Number(m[1]), Number(m[2]), m[3], today) })],
    [/\bday after (?:tomorrow|tmrw|tmw)\b/i, () => ({ start: addDaysIso(today, 2) })],
    [/\b(today|tonight)\b/i, () => ({ start: today })],
    [/\b(tomorrow|tmrw|tmw)\b/i, () => ({ start: addDaysIso(today, 1) })],
    // Mon-Wed, next Monday to Friday
    [new RegExp(`\\b(?:(this|next)\\s+)?${WD}${TO}(?:(?:this|next)\\s+)?${WD}\\b`, 'i'), (m) => {
      const start = nextWeekday(WEEKDAYS[m[2].toLowerCase()], today, m[1])
      const span = (WEEKDAYS[m[3].toLowerCase()] - dowIso(start) + 7) % 7
      return { start, end: addDaysIso(start, span) }
    }],
    // Friday, next Friday, on Friday
    [new RegExp(`\\b(?:(this|next|on)\\s+)?${WD}\\b`, 'i'), (m) => ({ start: nextWeekday(WEEKDAYS[m[2].toLowerCase()], today, m[1]) })],
    [/\bnext week\b/i, () => ({ start: addDaysIso(startOfWeekIso(today), 8) })],
    [/\bin (\d{1,2}) (day|week)s?\b/i, (m) => ({ start: addDaysIso(today, Number(m[1]) * (m[2].toLowerCase() === 'week' ? 7 : 1)) })],
    // the 12th
    [/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i, (m) => {
      const d = Number(m[1])
      const here = makeIso(yearOf(today), monthOf(today), d)
      if (here && d >= dayOf(today)) return { start: here }
      const nm = monthOf(today) === 12 ? 1 : monthOf(today) + 1
      return { start: makeIso(yearOf(today) + (nm === 1 ? 1 : 0), nm, d) }
    }],
  ]
  for (const [re, read] of tries) {
    const m = re.exec(s)
    if (!m) continue
    const got = read(m)
    if (!got?.start) continue
    const end = got.end && got.end >= got.start ? got.end : got.start
    return { start: got.start, end, index: m.index, length: m[0].length, range: end !== got.start }
  }
  return null
}

function to24(h: number, min: number, mer: string | undefined): string | null {
  if (min > 59) return null
  if (mer) {
    if (h < 1 || h > 12) return null
    const pm = mer.toLowerCase().startsWith('p')
    const hh = pm ? (h % 12) + 12 : h % 12
    return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  if (h > 23) return null
  // No am or pm typed: jobsite hours. 7 through 11 is morning, 12 through 6 is afternoon.
  const hh = h >= 13 ? h : h === 12 ? 12 : h >= 7 ? h : h + 12
  return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

interface TimeHit { start: string; end: string | null; index: number; length: number }

function findTime(s: string): TimeHit | null {
  const MER = '(?:\\s?(am|pm)|(a|p))(?![a-z])'
  // 7-3:30pm, 7am to 3pm, 8-10am
  const range = new RegExp(`(?:\\bat\\s+|@\\s*)?\\b(\\d{1,2})(?::(\\d{2}))?(?:${MER})?${TO}(\\d{1,2})(?::(\\d{2}))?${MER}`, 'i').exec(s)
  if (range) {
    const endMer = range[7] ?? range[8]
    const end = to24(Number(range[5]), Number(range[6] ?? 0), endMer)
    const startMerTyped = range[3] ?? range[4]
    let start = startMerTyped ? to24(Number(range[1]), Number(range[2] ?? 0), startMerTyped) : null
    if (!startMerTyped && end) {
      // "8-10am" is 8 AM, "7-3pm" is 7 AM: pick whichever puts the start before the end.
      const same = to24(Number(range[1]), Number(range[2] ?? 0), endMer)
      const flip = to24(Number(range[1]), Number(range[2] ?? 0), endMer.toLowerCase().startsWith('p') ? 'am' : 'pm')
      start = same && same < end ? same : flip && flip < end ? flip : same
    }
    if (start && end && start < end) return { start, end, index: range.index, length: range[0].length }
  }
  const word = /\b(noon|midnight)\b/i.exec(s)
  if (word) return { start: word[1].toLowerCase() === 'noon' ? '12:00' : '00:00', end: null, index: word.index, length: word[0].length }
  const single = new RegExp(`(?:\\bat\\s+|@\\s*)?\\b(\\d{1,2})(?::(\\d{2}))?${MER}`, 'i').exec(s)
  if (single) {
    const t = to24(Number(single[1]), Number(single[2] ?? 0), single[3] ?? single[4])
    if (t) return { start: t, end: null, index: single.index, length: single[0].length }
  }
  const at = /(?:\bat\s+|@\s*)(\d{1,2})(?::(\d{2}))?(?![\d/:])/i.exec(s)
  if (at && Number(at[1]) >= 1 && Number(at[1]) <= 12) {
    const t = to24(Number(at[1]), Number(at[2] ?? 0), undefined)
    if (t) return { start: t, end: null, index: at.index, length: at[0].length }
  }
  const clock = /\b(\d{1,2}):(\d{2})\b/.exec(s)
  if (clock) {
    const t = to24(Number(clock[1]), Number(clock[2]), undefined)
    if (t) return { start: t, end: null, index: clock.index, length: clock[0].length }
  }
  return null
}

const cut = (s: string, index: number, length: number) => `${s.slice(0, index)} ${SEP} ${s.slice(index + length)}`
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lowercase, no apostrophes, numbers without leading zeros: "Sam's" and "sams" and "0611" and "611" meet. */
export function normToken(t: string): string {
  const x = t.toLowerCase().replace(/['\u2019]/g, '')
  return /^\d+$/.test(x) ? String(Number(x)) : x
}

function tokensOf(text: string): { norm: string; start: number; end: number; frag: number }[] {
  const out: { norm: string; start: number; end: number; frag: number }[] = []
  const re = /[A-Za-z0-9]+(?:['\u2019][A-Za-z]+)?|\uE000/g
  let frag = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[0] === SEP) { frag++; continue }
    out.push({ norm: normToken(m[0]), start: m.index, end: m.index + m[0].length, frag })
  }
  return out
}

/** The words that identify a job: its name without the notes in brackets, plus its job number. */
export function projectTokens(p: QaProject): string[] {
  const name = p.name.replace(/\([^)]*\)?/g, ' ')
  const toks = tokensOf(`${name} ${p.jobNumber ?? ''}`).map((t) => t.norm)
  return [...new Set(toks.filter((t) => /^\d+$/.test(t) ? t.length >= 2 : t.length >= 2))]
}

/** Edit distance with swaps, capped: only tells 0, 1, or "more". */
function nearMiss(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const diff: number[] = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i)
    if (diff.length === 1) return true
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < short.length && short[i] === long[i]) i++
  return short.slice(i) === long.slice(i + 1)
}

function matchProjects(text: string, projects: QaProject[]): { picks: QaProject[]; strip: [number, number] | null } {
  const input = tokensOf(text)
  if (!input.length || !projects.length) return { picks: [], strip: null }
  const all = projects.map((p) => ({ p, toks: projectTokens(p) }))
  const df = new Map<string, number>()
  for (const { toks } of all) for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1)

  const scored = all.map(({ p, toks }) => {
    const set = new Set(toks)
    const hits = new Map<number, number>()   // input token index -> weight
    input.forEach((tok, i) => {
      const numeric = /^\d+$/.test(tok.norm)
      let w = 0
      if (set.has(tok.norm)) {
        w = GENERIC.has(tok.norm) ? 0.05 : (1 / (df.get(tok.norm) ?? 1)) * (numeric && tok.norm.length >= 3 ? 2 : 1)
      } else if (!numeric && tok.norm.length >= 4) {
        const pre = toks.find((t) => !GENERIC.has(t) && !/^\d+$/.test(t) && t.startsWith(tok.norm))
        if (pre) w = 0.8 / (df.get(pre) ?? 1)
        else if (tok.norm.length >= 7) {
          const near = toks.find((t) => t.length >= 7 && !/^\d+$/.test(t) && nearMiss(t, tok.norm))
          if (near) w = 0.7 / (df.get(near) ?? 1)
        }
      }
      if (w > 0) hits.set(i, w)
    })
    // The same word typed twice only counts once.
    const seen = new Set<string>()
    let score = 0
    for (const [i, w] of hits) { if (!seen.has(input[i].norm)) { seen.add(input[i].norm); score += w } }
    return { p, hits, score }
  }).filter((x) => x.score >= MATCH_THRESHOLD).sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))

  if (!scored.length) return { picks: [], strip: null }
  const top = scored[0]
  const picks = scored.filter((x) => x.score >= top.score - 1e-9).slice(0, 6).map((x) => x.p)

  // Take the job's words out of the title: the run of matched words around
  // the strongest one. A matched word somewhere else in the line stays put.
  let anchor = -1
  for (const [i, w] of top.hits) if (anchor < 0 || w > (top.hits.get(anchor) ?? 0)) anchor = i
  let lo = anchor
  let hi = anchor
  while (lo - 1 >= 0 && top.hits.has(lo - 1) && input[lo - 1].frag === input[anchor].frag) lo--
  while (hi + 1 < input.length && top.hits.has(hi + 1) && input[hi + 1].frag === input[anchor].frag) hi++
  return { picks, strip: [input[lo].start, input[hi].end] }
}

function tidyTitle(s: string): string {
  const parts = s.split(SEP).map((frag) => {
    let words = frag.replace(/[\s,;:]+/g, ' ').trim().split(' ').filter(Boolean)
    const junk = (w: string) => FILLER.has(w.toLowerCase()) || /^[-\u2013@&.#|/]+$/.test(w)
    while (words.length && junk(words[0])) words = words.slice(1)
    while (words.length && junk(words[words.length - 1])) words = words.slice(0, -1)
    return words.join(' ').replace(/^[-\u2013.\s]+|[-\u2013.\s]+$/g, '')
  }).filter(Boolean)
  const t = parts.join(' ').replace(/\s+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

export function parseQuickAdd(text: string, today: string, projects: QaProject[], supers: QaSuper[] = []): QaParse {
  let s = ` ${text.replace(/\s+/g, ' ').trim()} `
  const out: QaParse = {
    startDate: null, endDate: null, fromDate: null, startTime: null, endTime: null,
    projects: [], superId: null, superText: '', title: '', move: false,
  }

  const moveRe = /\b(move|moved|moving|push|pushed|pushing|bump|bumped|bumping|reschedule|rescheduled|slide|slid)\b/i
  const mv = moveRe.exec(s)
  if (mv) { out.move = true; s = cut(s, mv.index, mv[0].length) }

  const date = findDate(s, today)
  if (date) {
    const lead = /\bfrom\s*$/i.test(s.slice(0, date.index))
    if (date.range && out.move && lead) {
      out.fromDate = date.start
      out.startDate = date.end
      out.endDate = date.end
    } else {
      out.startDate = date.start
      out.endDate = date.end
    }
    s = cut(s, date.index, date.length)
  }

  const time = findTime(s)
  if (time) {
    out.startTime = time.start
    out.endTime = time.end
    s = cut(s, time.index, time.length)
  }

  // The super: a team name typed anywhere. Longest name first so "Van Horn"
  // is not read as "Van".
  for (const sup of [...supers].sort((a, b) => b.name.length - a.name.length)) {
    const name = sup.name.trim()
    if (name.length < 2) continue
    const m = new RegExp(`\\b(?:team\\s+)?${escapeRe(name)}(?:['\u2019]s)?(?:\\s+team)?(?![a-z0-9])`, 'i').exec(s)
    if (!m) continue
    out.superId = sup.id
    out.superText = m[0].trim()
    s = cut(s, m.index, m[0].length)
    break
  }

  const match = matchProjects(s, projects)
  out.projects = match.picks
  if (match.strip) s = cut(s, match.strip[0], match.strip[1] - match.strip[0])

  out.title = tidyTitle(s)
  // A team named after the work ("Startup"): when its name is all that is
  // left, it is the title as well as the label.
  if (!out.title && out.superText && !out.move) out.title = out.superText[0].toUpperCase() + out.superText.slice(1)
  return out
}

/* ── Deciding what the line does ─────────────────────────────────────────── */

export interface QaPoolItem {
  kind: 'phase' | 'event'
  id: string
  projectId: string | null
  title: string
  start: string
  end: string
  /** Finished phases are the last thing a typed line should move. */
  done?: boolean
}

export type QaDecision =
  | { type: 'need-date' }
  | { type: 'need-title' }
  | { type: 'need-project' }
  | { type: 'add'; as: 'phase' | 'event'; nothingToMove: boolean }
  | { type: 'same'; target: QaPoolItem }
  | { type: 'move'; target: QaPoolItem; start: string; end: string }

const titleWords = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w && !FILLER.has(w))
export const normTitle = (t: string) => titleWords(t).join(' ')

/**
 * Add, or move something that is already there. With a move word the closest
 * match on that job is moved. Without one, only an item with the very same
 * name on the very same job counts, so "Oct 12 Gulf Breeze startup" moves
 * Gulf Breeze's Startup phase instead of making a second one.
 */
export function decideQuickAdd(parse: QaParse, pool: QaPoolItem[], chosenProjectId?: string | null): QaDecision {
  if (!parse.startDate || !parse.endDate) return { type: 'need-date' }
  if (chosenProjectId === undefined && parse.projects.length > 1) return { type: 'need-project' }
  const projectId = chosenProjectId !== undefined ? chosenProjectId : parse.projects[0]?.id ?? null

  const mine = pool.filter((i) => i.projectId === projectId && (projectId !== null || i.kind === 'event'))
  // With a move word and nothing else typed, a team name may be the phase
  // name: "move Gulf Breeze startup to Friday".
  const typed = parse.title || (parse.move ? parse.superText : '')
  const want = normTitle(typed)
  const wantWords = new Set(titleWords(typed))
  const rank = (a: QaPoolItem, b: QaPoolItem) =>
    Number(!!a.done) - Number(!!b.done)
    || Math.abs(diffDaysIso(a.start, parse.fromDate ?? parse.startDate!)) - Math.abs(diffDaysIso(b.start, parse.fromDate ?? parse.startDate!))

  let target: QaPoolItem | null = null
  const exact = want ? mine.filter((i) => normTitle(i.title) === want).sort(rank) : []
  if (exact.length) target = exact[0]
  else if (parse.move) {
    if (wantWords.size) {
      const scored = mine.map((i) => {
        const words = titleWords(i.title)
        const shared = words.filter((w) => wantWords.has(w) || [...wantWords].some((x) => x.length >= 4 && w.startsWith(x))).length
        return { i, score: shared / Math.max(words.length, wantWords.size) }
      }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || rank(a.i, b.i))
      target = scored[0]?.i ?? null
    }
    if (target) { /* matched by name */ } else if (parse.fromDate) {
      target = mine.filter((i) => i.start <= parse.fromDate! && i.end >= parse.fromDate!).sort(rank)[0] ?? null
    } else if (projectId) {
      const open = mine.filter((i) => !i.done)
      if (open.length === 1) target = open[0]
    }
  }

  if (target) {
    const length = Math.max(0, diffDaysIso(target.start, target.end))
    let start = parse.startDate
    let end = parse.endDate !== parse.startDate ? parse.endDate : addDaysIso(start, length)
    // "move startup Oct 3 to Oct 5" with no "from": if it sits on Oct 3 now,
    // that was where it is, not a new three day span.
    if (parse.move && !parse.fromDate && parse.endDate !== parse.startDate && target.start === parse.startDate) {
      start = parse.endDate
      end = addDaysIso(start, length)
    }
    if (start === target.start && end === target.end) return { type: 'same', target }
    return { type: 'move', target, start, end }
  }

  if (!parse.title) return { type: 'need-title' }
  return { type: 'add', as: projectId && !parse.startTime ? 'phase' : 'event', nothingToMove: parse.move }
}
