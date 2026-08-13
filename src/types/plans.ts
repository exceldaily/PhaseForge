// Construction Plans / Drawings types. Sheet = persistent drawing identity;
// Revision = a version of that sheet (exactly one CURRENT per sheet).

export type PlanSetType =
  | 'permit' | 'bid' | 'construction' | 'as_built' | 'addendum' | 'shop' | 'other'

export interface PlanSet {
  id: string
  company_id: string
  project_id: string
  name: string
  set_type: PlanSetType
  issue_date: string | null
  created_by: string | null
  created_at: string
}

export interface PlanSheet {
  id: string
  company_id: string
  project_id: string
  set_id: string | null
  sheet_number: string
  title: string
  discipline: string
  drawing_type: string | null
  building: string | null
  floor: string | null
  area: string | null
  tags: string[]
  sort_order: number
  is_archived: boolean
  current_revision_id: string | null
  created_at: string
}

export type RevisionStatus = 'current' | 'superseded'

export interface PlanRevision {
  id: string
  company_id: string
  sheet_id: string
  revision_label: string
  revision_date: string | null
  status: RevisionStatus
  pdf_path: string
  thumb_path: string | null
  page_width: number | null
  page_height: number | null
  file_size: number | null
  extracted_text: string | null
  source_file_name: string | null
  source_page_number: number | null
  scale_calibration: { pointsPerUnit: number; unit: 'ft' | 'm' } | null
  uploaded_by: string | null
  created_at: string
}

/** Sheet joined with its current revision + per-user flags — the working unit
 *  of the Plans home screen and viewer navigation. */
export interface SheetWithRevision extends PlanSheet {
  current: PlanRevision | null
  revision_count: number
  is_favorite: boolean
  last_viewed_at: string | null
  open_pin_count: number
}

// ─── Markups ────────────────────────────────────────────────────────────────
// All coordinates are normalized 0..1 against the un-rotated PDF page so the
// layer scales with any zoom and survives re-renders.

export type MarkupTool =
  | 'arrow' | 'line' | 'rect' | 'ellipse' | 'cloud' | 'freehand'
  | 'highlight' | 'text' | 'measure'

export interface MarkupElement {
  id: string
  type: MarkupTool
  points: { x: number; y: number }[]   // 2 points for shapes, N for freehand/cloud
  color: string
  strokeWidth: number                   // normalized (fraction of page width)
  text?: string                         // for 'text'
  fontSize?: number                     // normalized
  opacity?: number                      // highlight uses ~0.35
}

export type MarkupScope = 'personal' | 'project'

export interface PlanMarkup {
  id: string
  company_id: string
  revision_id: string
  scope: MarkupScope
  user_id: string
  elements: MarkupElement[]
  updated_at: string
}

// ─── Pins / located comments ────────────────────────────────────────────────

export interface PlanPin {
  id: string
  company_id: string
  sheet_id: string
  revision_id: string | null
  x: number
  y: number
  note: string
  status: 'open' | 'resolved'
  assigned_to: string | null
  due_date: string | null
  linked_type: string | null
  linked_id: string | null
  created_by: string | null
  created_at: string
  resolved_by: string | null
  resolved_at: string | null
  author_name?: string | null
  assignee_name?: string | null
}

export interface PlanPinComment {
  id: string
  company_id: string
  pin_id: string
  author_id: string | null
  body: string
  photo_path: string | null
  created_at: string
  author_name?: string | null
}

export interface PlanActivityEntry {
  id: string
  company_id: string
  project_id: string
  actor_id: string | null
  action: string
  detail: Record<string, unknown>
  created_at: string
  actor_name?: string | null
}

/** Persisted viewer position so returning to a sheet restores the view. */
export interface PlanViewState {
  zoom: number        // scale relative to fit-page
  cx: number          // normalized center 0..1
  cy: number
  rotation: 0 | 90 | 180 | 270
}

/** One detected page during import, correctable in the review step. */
export interface DetectedSheet {
  pageNumber: number
  sheetNumber: string
  title: string
  discipline: string
  revisionLabel: string
  revisionDate: string | null
  include: boolean
  confident: boolean
  pageWidth: number
  pageHeight: number
  extractedText: string
  /** Existing sheet this page will become a new revision of (matched by number). */
  matchesSheetId: string | null
}
