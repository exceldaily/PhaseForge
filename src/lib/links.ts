// Shared vocabulary for the universal relationship system.
//
// Lives outside linkActions.ts because that file is "use server": such files
// may only export async functions, and exporting this constants object from
// there blew up module evaluation at runtime on the project detail page
// ('A "use server" file can only export async functions, found object').

export type LinkEntityType =
  | 'project' | 'phase' | 'change_order' | 'punch_item' | 'plan_sheet' | 'quote_pricing'

export type LinkType =
  | 'related_to' | 'caused_by' | 'impacts' | 'generated_from' | 'blocked_by'
  | 'resolves' | 'schedule_impact' | 'cost_impact' | 'follow_up_to'

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  related_to: 'Related to',
  caused_by: 'Caused by',
  impacts: 'Impacts',
  generated_from: 'Generated from',
  blocked_by: 'Blocked by',
  resolves: 'Resolves',
  schedule_impact: 'Schedule impact',
  cost_impact: 'Cost impact',
  follow_up_to: 'Follow-up to',
}

export interface LinkedItem {
  linkId: string
  linkType: LinkType
  /** Whether this entity is the target (outbound) or source (inbound). */
  direction: 'out' | 'in'
  entityType: LinkEntityType
  entityId: string
  label: string
  sublabel: string | null
  href: string
}

export interface LinkCandidate {
  entityType: LinkEntityType
  entityId: string
  label: string
  sublabel: string | null
}
