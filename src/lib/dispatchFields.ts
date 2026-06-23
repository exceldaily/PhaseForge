import { DispatchBoard, DispatchCardFieldConfig } from '@/types/app'

export type { DispatchCardFieldConfig }

export const DEFAULT_DISPATCH_CARD_FIELDS: DispatchCardFieldConfig[] = [
  { key: 'store',             label: 'Store',                type: 'text',     visible: true },
  { key: 'urgency',           label: 'Urgency',              type: 'select',   visible: true,  required: true },
  { key: 'date_started',      label: 'Date Started',         type: 'date',     visible: true },
  { key: 'sc_number',         label: 'SC #',                 type: 'text',     visible: true,
    link_template: 'https://app.servicechannel.com/sc/workorder/view/{value}' },
  { key: 'kalos_job_number',  label: 'Kalos Job #',          type: 'text',     visible: true },
  { key: 'eta_scheduled',     label: 'ETA / Scheduled',      type: 'datetime', visible: true },
  { key: 'rack_circuit_case', label: 'Rack / Circuit / Case',type: 'text',     visible: true },
  { key: 'assigned_to',       label: 'Assigned To',          type: 'select',   visible: true },
  { key: 'vendor_id',         label: 'Vendor',               type: 'select',   visible: true },
  { key: 'vendor_email',      label: 'Vendor Email',         type: 'email',    visible: false },
  { key: 'part_ordered',      label: 'Part Ordered',         type: 'checkbox', visible: true },
  { key: 'who_ordered',       label: 'Who Ordered',          type: 'text',     visible: true },
  { key: 'needs_review',      label: 'Needs Review',         type: 'checkbox', visible: false },
  { key: 'description',       label: 'Description',          type: 'textarea', visible: true,  fullWidth: true },
  { key: 'notes',             label: 'Notes',                type: 'textarea', visible: true,  fullWidth: true },
]

// Merges an incoming (possibly partial/serialized) field list against the defaults,
// so boards always have a complete, well-typed field config.
export function normalizeDispatchCardFields(
  incoming: Partial<DispatchCardFieldConfig>[]
): DispatchCardFieldConfig[] {
  const defaultMap = new Map(DEFAULT_DISPATCH_CARD_FIELDS.map(f => [f.key, f]))
  const seen = new Set<string>()
  const result: DispatchCardFieldConfig[] = []

  for (const item of incoming) {
    if (!item.key) continue
    const base = defaultMap.get(item.key) ?? DEFAULT_DISPATCH_CARD_FIELDS[0]
    seen.add(item.key)
    result.push({
      ...base,
      ...item,
      key: item.key,
      label: item.label?.trim() || base.label,
      type: item.type ?? base.type,
      visible: item.visible ?? base.visible,
      link_template: item.link_template !== undefined ? item.link_template : (base.link_template ?? null),
    })
  }

  // Append any default fields missing from incoming (forward-compat for new fields)
  for (const def of DEFAULT_DISPATCH_CARD_FIELDS) {
    if (!seen.has(def.key)) result.push({ ...def })
  }

  return result
}

// Returns the visible field configs for a board, respecting board-level overrides.
export function getVisibleDispatchCardFields(board: DispatchBoard): DispatchCardFieldConfig[] {
  const fields = board.card_fields?.length
    ? normalizeDispatchCardFields(board.card_fields)
    : DEFAULT_DISPATCH_CARD_FIELDS
  return fields.filter(f => f.visible)
}

// Returns the display label for a field, using board-level overrides when available.
export function getDispatchFieldLabel(board: DispatchBoard, key: string): string {
  const boardField = board.card_fields?.find(f => f.key === key)
  if (boardField?.label) return boardField.label
  return DEFAULT_DISPATCH_CARD_FIELDS.find(f => f.key === key)?.label ?? key
}

// Returns an external link href for a field value, using board-level link_template when set.
export function makeDispatchFieldHref(board: DispatchBoard, key: string, value: string | null): string | null {
  if (!value) return null
  const boardField = board.card_fields?.find(f => f.key === key)
  const template = boardField?.link_template
    ?? DEFAULT_DISPATCH_CARD_FIELDS.find(f => f.key === key)?.link_template
    ?? null
  if (!template) return null
  return template.replace('{value}', encodeURIComponent(value))
}
