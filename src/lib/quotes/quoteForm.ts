// Quote-form intake — pure functions, no I/O. Parses the techs' materials RFQ
// form (Google Form submission text, as it appears in the notification email
// or exported PDF) and builds the per-vendor inquiry email. Tolerant of line
// wrapping: everything is matched against a whitespace-collapsed copy.
// Ported from InboxFlow (engine/quote-form.ts) — keep parsers in sync.

export type QuoteFormData = {
  poNumber: string | null
  orderType: string | null
  trade: string | null
  techName: string | null
  jobNumber: string | null
  storeNumber: string | null
  requestType: string | null
  itemsText: string
}

/** Known labels in form order — values are captured lazily up to the next label. */
const LABELS: { key: keyof QuoteFormData | 'skip'; re: string }[] = [
  { key: 'poNumber', re: 'PO NUMBER(?: \\(Hidden\\))?' },
  { key: 'orderType', re: 'Order Type' },
  { key: 'trade', re: 'What Trade will this order be for\\?' },
  { key: 'techName', re: 'Your Name' },
  { key: 'skip', re: 'Do You Have A Job Number For This Request\\?' },
  { key: 'jobNumber', re: 'If Yes, What Is the Job Number\\?' },
  { key: 'skip', re: 'Do You Have A Store Number For This Request\\?' },
  { key: 'storeNumber', re: 'If Yes, What Is The Store Number\\?' },
  { key: 'requestType', re: 'How Do We Need To Process This Order(?: For You)?' },
  { key: 'itemsText', re: 'Add Any Additional Items[\\s\\S]*?Process This Order' },
  { key: 'skip', re: 'Upload Any Files[^?]*?Request' },
]

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function parseQuoteForm(text: string): QuoteFormData | null {
  const flat = collapse(text)
  if (flat.length < 40) return null

  const anyLabel = LABELS.map((l) => `(?:${l.re})`).join('|')
  const out: QuoteFormData = {
    poNumber: null, orderType: null, trade: null, techName: null,
    jobNumber: null, storeNumber: null, requestType: null, itemsText: '',
  }
  let matched = 0
  for (const label of LABELS) {
    const m = flat.match(new RegExp(`${label.re}\\s*(.*?)\\s*(?=${anyLabel}|$)`, 'i'))
    if (!m) continue
    matched++
    if (label.key === 'skip') continue
    let value = m[1].trim()
    // PDF page markers land after the free-text block ("… images below 1").
    if (label.key === 'itemsText') value = value.replace(/\s+\d{1,2}$/, '').trim()
    if (!value) continue
    if (label.key === 'itemsText') out.itemsText = value
    else out[label.key] = value
  }

  // A real form submission matches several labels; random text does not.
  if (matched < 4) return null
  return out
}

/**
 * Tolerant fallback for forms that are NOT the exact Google Form the strict
 * parser targets — a different template, a vendor's own RFQ sheet, or a form
 * whose wording changed. Looks for loose "PO 12345" / "Job #: 4471" style
 * labels anywhere in the text and keeps the whole document as the items text
 * so nothing is lost. Never returns null for real text: a quote the user
 * corrects beats an upload the app refuses outright.
 */
export function parseQuoteFormLoose(text: string): QuoteFormData {
  const flat = collapse(text)
  // Whitespace is collapsed, so a free-text capture like Trade runs straight
  // into the NEXT field's label ("Refrigeration Technician: …"). Cut the value
  // at the first label-looking word.
  const NEXT_LABEL = /\b(?:tech(?:nician)?|requested\s*by|submitted\s*by|your\s*name|store|job|p\.?\s?o\.?|order\s*type|item|items|notes?|date|qty|quantity|description|address|phone|email)\b/i
  const stopAtLabel = (v: string): string => {
    const m = v.match(NEXT_LABEL)
    return (m && m.index !== undefined ? v.slice(0, m.index) : v)
      .replace(/[\s:;,\-]+$/, '')
      .trim()
  }
  const grab = (re: RegExp, freeText = false): string | null => {
    const m = flat.match(re)
    let v = m?.[1]?.trim()
    if (v && freeText) v = stopAtLabel(v)
    return v && v.length > 0 && v.length <= 60 ? v : null
  }
  return {
    poNumber: grab(/\bP\.?\s?O\.?\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9][\w\-/]{1,24})\b/i),
    orderType: grab(/\bOrder\s*Type\s*[:\-]?\s*([A-Za-z][\w &/-]{2,38})/i, true),
    trade: grab(/\bTrade\s*(?:Type)?\s*[:\-]?\s*([A-Za-z][A-Za-z &/-]{2,30})/i, true),
    techName: grab(/\b(?:Tech(?:nician)?|Requested\s*By|Your\s*Name|Submitted\s*By)\s*[:\-]?\s*([A-Za-z][A-Za-z.'\- ]{2,40})/i, true),
    jobNumber: grab(/\bJob\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9][\w\-/]{1,24})\b/i),
    storeNumber: grab(/\bStore\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9][\w\-/]{1,24})\b/i),
    requestType: null,
    itemsText: flat,
  }
}

export function quoteSubject(form: QuoteFormData): string {
  // Only the tracking (job) number goes in the subject — it is a bare reference
  // code. The store/location, PO and trade stay internal (never shown to
  // vendors). Falls back to the PO number if there is no job #.
  const tracking = form.jobNumber || form.poNumber
  return tracking ? `Quote request #${tracking}` : 'Quote request'
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * The inquiry email sent to each vendor. Greeting is personalized per vendor;
 * everything else is shared and editable before sending. Returns both a plain
 * text alternative and an HTML version — the HTML carries the sender's own
 * Gmail signature (verbatim) when one is supplied.
 */
export function buildVendorQuoteEmail(input: {
  form: QuoteFormData
  vendorName: string
  userName: string
  bodyOverride?: string | null
  signatureHtml?: string | null
}): { subject: string; text: string; html: string } {
  const { form } = input
  const firstName = input.vendorName.trim().split(/\s+/)[0] || 'there'
  const greeting = `Hi ${firstName},`
  // The vendor email is just the parts and the ask — the job number, store /
  // location, PO and trade are internal and deliberately left out.
  const core = input.bodyOverride
    ? [input.bodyOverride.trim()]
    : [
        'Could you quote the following for us?',
        '',
        form.itemsText || '[describe the parts needed]',
        '',
        "Please include pricing, availability, and lead time. Reply to this email and we'll get a PO turned around quickly.",
      ]
  const sig = input.signatureHtml?.trim() || null

  const text = [greeting, '', ...core, '', 'Thanks,', input.userName].join('\n')

  const bodyHtml = [greeting, '', ...core].map((line) => escapeHtml(line).replace(/\n/g, '<br>')).join('<br>\n')
  const signOffHtml = sig ? `Thanks,<br>\n${sig}` : `Thanks,<br>\n${escapeHtml(input.userName)}`
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">\n` +
    `${bodyHtml}<br><br>\n${signOffHtml}\n</div>`

  return { subject: quoteSubject(form), text, html }
}
