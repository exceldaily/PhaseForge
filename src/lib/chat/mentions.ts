// @mentions in chat messages. Pure, tested.
//
// Three kinds: @everyone, @Trade (any trade name the company uses, multi-word
// allowed, like @General Construction), and @Person (a member's full name or
// first name, when that is unambiguous). Matching is case-insensitive and
// longest-first so "@General Construction" is not read as "@General".

export interface MentionMember { id: string; name: string }

export interface ParsedMentions {
  everyone: boolean
  trades: string[]
  users: string[]
}

export interface MentionSegment {
  text: string
  kind: 'text' | 'everyone' | 'trade' | 'user'
  id?: string
}

const norm = (s: string) => s.trim().toLowerCase()

/** Candidate handles, longest first, with what each one means. */
export function mentionCandidates(trades: string[], members: MentionMember[]): { handle: string; kind: 'trade' | 'user'; id: string }[] {
  const out: { handle: string; kind: 'trade' | 'user'; id: string }[] = []
  for (const t of trades) if (t.trim()) out.push({ handle: t.trim(), kind: 'trade', id: t.trim() })
  const firstCounts = new Map<string, number>()
  for (const m of members) {
    const first = norm(m.name).split(/\s+/)[0]
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1)
  }
  for (const m of members) {
    if (!m.name.trim()) continue
    out.push({ handle: m.name.trim(), kind: 'user', id: m.id })
    const first = m.name.trim().split(/\s+/)[0]
    if (first.length > 1 && firstCounts.get(norm(first)) === 1 && norm(first) !== norm(m.name)) out.push({ handle: first, kind: 'user', id: m.id })
  }
  return out.sort((a, b) => b.handle.length - a.handle.length)
}

/**
 * Split a message body into text and mention segments, and collect who was
 * pinged. Handles are matched at an "@" followed by the handle and then a
 * word boundary.
 */
export function parseMentions(body: string, trades: string[], members: MentionMember[]): { segments: MentionSegment[]; mentions: ParsedMentions } {
  const cands = mentionCandidates(trades, members)
  const segments: MentionSegment[] = []
  const mentions: ParsedMentions = { everyone: false, trades: [], users: [] }
  let i = 0, textStart = 0
  const pushText = (end: number) => { if (end > textStart) segments.push({ text: body.slice(textStart, end), kind: 'text' }) }

  while (i < body.length) {
    if (body[i] !== '@' || (i > 0 && /[\w@]/.test(body[i - 1]))) { i++; continue }
    const rest = body.slice(i + 1)
    let matched: { len: number; seg: MentionSegment } | null = null
    if (/^everyone\b/i.test(rest)) {
      matched = { len: 8, seg: { text: body.slice(i, i + 9), kind: 'everyone' } }
    } else {
      for (const c of cands) {
        if (rest.length < c.handle.length) continue
        if (norm(rest.slice(0, c.handle.length)) !== norm(c.handle)) continue
        const after = rest[c.handle.length]
        if (after !== undefined && /[\w]/.test(after)) continue
        matched = { len: c.handle.length, seg: { text: body.slice(i, i + 1 + c.handle.length), kind: c.kind, id: c.id } }
        break
      }
    }
    if (!matched) { i++; continue }
    pushText(i)
    segments.push(matched.seg)
    if (matched.seg.kind === 'everyone') mentions.everyone = true
    else if (matched.seg.kind === 'trade' && matched.seg.id && !mentions.trades.includes(matched.seg.id)) mentions.trades.push(matched.seg.id)
    else if (matched.seg.kind === 'user' && matched.seg.id && !mentions.users.includes(matched.seg.id)) mentions.users.push(matched.seg.id)
    i += 1 + matched.len
    textStart = i
  }
  pushText(body.length)
  return { segments, mentions }
}

/** The handle being typed at the caret, for the autocomplete popover. */
export function activeHandle(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && /[\w@]/.test(before[at - 1])) return null
  const query = before.slice(at + 1)
  if (/\n/.test(query) || query.length > 30) return null
  return { start: at, query }
}
