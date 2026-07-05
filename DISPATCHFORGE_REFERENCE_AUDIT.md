# DispatchForge Reference Audit

Read-only UX/workflow audit of the DispatchForge app (`Desktop/dispatchforge`) used as the
quality bar for the PhaseForge Operations **Calls** module. No DispatchForge code, data,
deployment, Supabase project, or Kalos-specific business rules are copied into PhaseForge.

## Navigation

DispatchForge is a single-org command center with:

- **Command Center** (`/`) — prioritized call queue, the main working surface
- **Kanban** — calls grouped in status lanes
- **Pipeline** — proposal/quote pipeline view
- **Schedule** — timeline grouped by `scheduled_date` (booked visit date, distinct from ETA)
- **My Work** — calls filtered to the logged-in tech's vendor identity (`app_user.vendor_id`)
- **Stores** — per-site pulse tiles + site detail with call history
- **Admin / Settings** — users, customers, priority scales, Gmail connection

## Call row / card layout (strongest pattern — mirror this)

`call-row.tsx`:

- **Left urgency bar**: 4px vertical color strip (red/orange/slate by urgency) — instant scanability.
- **Line 1 — badge stack**: NEW badge (if unacknowledged) → store number (mono font) → store name →
  priority/urgency badge → status badge → part-status badge → proposal-status badge → primary-queue
  chip → secondary condition chips.
- **Line 2 — identifiers**: external work-order number (link if tracking URL exists), internal job
  number (link), truncated description.
- **Line 3 — operational facts**: assigned tech/vendor (red "Unassigned" if none), ETA (orange "None"
  if missing), expiration warning, NTE dollar cap, `Nd open` age, last-updated time, latest note in italics.
- **Manager note callout**: sky-blue banner inside the card when a supervisor pinned a note.
- **Right rail**: next-action badge + numeric priority score.

Whole-row alert states (background + border tint):

- **Sky border** — `needs_acknowledgment` (new/unreviewed call, e.g. auto-imported)
- **Orange tint** — ETA/SLA expires within 24h
- **Red tint** — ETA/SLA expires within 2h or expired

## Call detail panel

Inline editable panel (not a separate page): every field is a select/input that saves immediately
with an **optimistic overlay** keyed on `updated_at` (instant UI, reconciles when server data lands).
Contains: status, urgency/priority level (customer-specific scale), next action override,
part status, proposal status, vendor multi-assign, ETA + scheduled date, NTE, description,
manager note, **categorized notes timeline** (7 categories: internal, customer, vendor, parts,
scheduling, proposal, completion), activity log, acknowledge button, guarded delete.

## Priority engine (generalize the concept, not the Kalos tiers)

`priority-engine.ts` computes a score per call: base tier by status (urgent-open highest →
completed lowest), boosted by "scheduled today/tomorrow", missing ETA, missing vendor, aging,
days since update. Produces human-readable `priority_reasons`. Also derives a **recommended next
action** from status + assignment + parts + proposal state, with manual override winning.

PhaseForge takeaway: rule-based (no AI) aging/SLA indicators and a "needs attention" sort are
what make the queue feel alive. Implement as computed client/server helpers, not stored state.

## Filtering

Sticky top filter bar: customer → store (cascading), status, multi-select urgency, vendor,
tech-name text search, part status, proposal status, min-days-open, date range, "Clear" button
that only appears when dirty. Filters are plain state + a pure `applyFilters` function.

## Other patterns worth mirroring

- **Unacknowledged-call flow**: auto-imported calls get `needs_acknowledgment = true`, highlighted
  until a dispatcher acknowledges — basis for PhaseForge's yellow "new update" alert.
- **Store pulse**: per-location rollup (active/urgent/parts counts, oldest active call, warning level).
- **Customer-specific priority scales**: each customer maps its own P-codes to internal severity buckets.
- **Multiple vendors per call** via a join table, with a "primary" convention.
- **Realtime refresh** component that refetches on Supabase realtime events.
- **Global search** across calls/stores.
- Note categories on every note; latest note surfaced on the row.

## Kalos-specific — do NOT copy

- ServiceChannel intake (Gmail polling, parsers, tracking URLs, NTE semantics from SC emails)
- Kalos job numbers / job URL backfills
- ALDI store numbering, refrigeration fields (`rack_circuit_case`), Kalos customer records
- Kalos priority-scale seed data, mock data set, any credentials or Gmail connections
- Kalos-specific status vocabulary hardcoding (recall/rack conventions)

## What PhaseForge Operations generalizes

| DispatchForge (Kalos) | PhaseForge Operations |
|---|---|
| Store | Location (belongs to Customer) |
| Customer priority scale | Org-configurable priority names |
| Hardcoded statuses | Org-configurable status labels over sensible defaults |
| vendor/tech single concept | Staff (internal) + Vendors (external), both assignable |
| `needs_acknowledgment` | `has_unread_update` + yellow highlight on new notes |
| ServiceChannel fields | Optional inert `external_*` extension fields |
| One org | Full multi-tenant with RLS + module entitlements |
