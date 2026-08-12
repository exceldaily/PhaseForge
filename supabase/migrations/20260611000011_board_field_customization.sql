SET search_path TO phaseforge, extensions;

-- Add field customization to boards
ALTER TABLE boards
ADD COLUMN visible_fields jsonb DEFAULT '[
  "client_name",
  "job_location",
  "project_manager",
  "superintendent",
  "subcontractors",
  "priority",
  "permit_status"
]'::jsonb,
ADD COLUMN custom_stages jsonb DEFAULT '[
  "queue",
  "mobilization",
  "construction_initiated",
  "pct_30",
  "pct_60",
  "pct_90",
  "final_punchlist",
  "closeout",
  "closed"
]'::jsonb;

-- Create index for faster queries
CREATE INDEX idx_boards_visible_fields ON boards USING GIN (visible_fields);
CREATE INDEX idx_boards_custom_stages ON boards USING GIN (custom_stages);
