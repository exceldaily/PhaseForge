// Colours used by the Startup schedule: one per shift note, plus the row
// highlight palette. Pure data and pure functions so the on-screen grid, the
// print sheet, and the copy-for-email HTML can never drift apart.

/** Shift-note text colours offered when adding or editing a shift. */
export const SHIFT_COLORS: { hex: string; label: string }[] = [
  { hex: '#15803d', label: 'Green' },
  { hex: '#6d28d9', label: 'Purple' },
  { hex: '#c0392b', label: 'Red' },
  { hex: '#b45309', label: 'Amber' },
  { hex: '#1d4ed8', label: 'Blue' },
  { hex: '#0f766e', label: 'Teal' },
  { hex: '#be185d', label: 'Pink' },
  { hex: '#334155', label: 'Slate' },
]

/**
 * Row highlight colours. Deliberately pale: a highlighted row still has to
 * read as black text on paper and in a pasted email, so these are tints, not
 * saturated fills.
 */
export const ROW_HIGHLIGHTS: { hex: string; label: string }[] = [
  { hex: '#fef08a', label: 'Yellow' },
  { hex: '#bbf7d0', label: 'Green' },
  { hex: '#bfdbfe', label: 'Blue' },
  { hex: '#fecaca', label: 'Red' },
  { hex: '#e9d5ff', label: 'Purple' },
  { hex: '#fed7aa', label: 'Orange' },
]

/**
 * The colour a shift note is drawn in.
 *
 * A department's saved map wins. Anything not in it falls back to the keyword
 * rules the app shipped with, so a department that never picks a colour looks
 * exactly as it always has, and a note named "Night shift" is still purple
 * without anyone configuring it.
 */
export function shiftColor(shift: string, colors?: Record<string, string> | null): string {
  const saved = colors?.[shift]
  if (saved) return saved
  const s = shift.toLowerCase()
  if (s.includes('travel')) return '#c0392b'
  if (s.includes('night')) return '#6d28d9'
  if (s.includes('as need')) return '#b45309'
  return '#15803d'
}

/** Guards stored values: only ever emit a colour we recognise as a hex. */
export function safeHex(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
}
