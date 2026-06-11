export interface BoardTemplate {
  name: string
  description: string
  visibleFields: string[]
  customStages: string[]
}

export const BOARD_TEMPLATES: Record<string, BoardTemplate> = {
  construction: {
    name: 'Construction',
    description: 'For construction and renovation projects',
    visibleFields: [
      'client_name',
      'job_location',
      'project_manager',
      'superintendent',
      'subcontractors',
      'priority',
      'permit_status',
    ],
    customStages: [
      'queue',
      'mobilization',
      'construction_initiated',
      'pct_30',
      'pct_60',
      'pct_90',
      'final_punchlist',
      'closeout',
      'closed',
    ],
  },
  software: {
    name: 'Software Development',
    description: 'For software and app projects',
    visibleFields: ['project_manager', 'priority'],
    customStages: [
      'backlog',
      'in_progress',
      'in_review',
      'testing',
      'deployed',
      'archived',
    ],
  },
  general: {
    name: 'General Tasks',
    description: 'Simple project tracking',
    visibleFields: ['priority'],
    customStages: ['not_started', 'in_progress', 'completed'],
  },
}

export const ALL_FIELD_OPTIONS = [
  { id: 'client_name', label: 'Client / Customer' },
  { id: 'job_location', label: 'Job Location' },
  { id: 'project_manager', label: 'Project Manager' },
  { id: 'superintendent', label: 'Superintendent' },
  { id: 'subcontractors', label: 'Subcontractors' },
  { id: 'priority', label: 'Priority' },
  { id: 'permit_status', label: 'Permit Status' },
]
