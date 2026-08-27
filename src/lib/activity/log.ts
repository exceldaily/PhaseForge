// The one write path into the universal activity timeline.
//
// Every server action that changes something meaningful calls logActivity —
// nothing else inserts into activity_logs directly (the legacy inline insert
// in updateProject was migrated here). One writer means one vocabulary and
// no duplicate events from triggers, handlers, and jobs all recording the
// same change.
//
// Events are written fire-and-forget: a failed log line must never fail the
// user's actual edit.
//
// Payload convention (kept from the original project history):
//   { field: { from, to }, ... }  for field changes
//   anything else action-specific goes under payload as plain keys
// The renderer (ActivityTimeline) turns these into sentences; keep values
// human-scale (dates as yyyy-MM-dd, names not ids) wherever possible.

export type ActivityEntityType =
  | 'project' | 'phase' | 'change_order' | 'punch_item'
  | 'plan_sheet' | 'file' | 'baseline' | 'link' | 'dependency'

export type ActivityAction =
  // project (existing vocabulary, unchanged)
  | 'project_created' | 'project_updated'
  // phases / schedule
  | 'phase_created' | 'phase_updated' | 'phase_deleted'
  | 'phase_moved' | 'phase_resized' | 'phase_progress' | 'phase_status'
  // baseline
  | 'baseline_set' | 'baseline_replaced'
  // dependencies
  | 'dependency_added' | 'dependency_removed'
  // punch
  | 'punch_created' | 'punch_completed' | 'punch_reopened' | 'punch_deleted'
  // relationships
  | 'link_created' | 'link_removed'
  // files
  | 'file_uploaded' | 'file_deleted'

export interface ActivityEvent {
  companyId: string
  projectId?: string | null
  phaseId?: string | null
  actorId: string
  action: ActivityAction
  /** What kind of record this event is about, for per-item history views. */
  entityType?: ActivityEntityType
  entityId?: string | null
  /** Human name of the record at the time ("Electrical Rough-In"). */
  entityLabel?: string | null
  /** Field diffs and/or action-specific details. */
  payload?: Record<string, unknown>
  /** User-supplied why, e.g. "Material delay" on a schedule move. */
  reason?: string | null
}

interface InsertCapable {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>
  }
}

export async function logActivity(supabase: InsertCapable, event: ActivityEvent): Promise<void> {
  try {
    await supabase.from('activity_logs').insert({
      company_id: event.companyId,
      project_id: event.projectId ?? null,
      phase_id: event.phaseId ?? null,
      actor_id: event.actorId,
      action: event.action,
      payload: event.payload ?? {},
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      entity_label: event.entityLabel ?? null,
      reason: event.reason ?? null,
    })
  } catch {
    // Deliberate: history is best-effort, the user's edit already succeeded.
  }
}

/** The reasons offered when a schedule move is big enough to ask about. */
export const SCHEDULE_CHANGE_REASONS = [
  'Material delay',
  'Customer delay',
  'Inspection',
  'Labor availability',
  'Weather',
  'Design change',
  'Predecessor delay',
  'Vendor',
  'Site conditions',
  'Other',
] as const

/**
 * Moves at or past this many days prompt for a reason. Small nudges save
 * silently — asking on every one-day correction would train people to
 * pick the first option without reading it.
 */
export const REASON_PROMPT_THRESHOLD_DAYS = 3
