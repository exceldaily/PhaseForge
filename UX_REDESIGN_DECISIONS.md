# UX Redesign Decisions

Stabilization sprint (`fable/phaseforge-stabilization`). Principle: fix reliability first,
reduce clutter second, rebuild nothing that works.

## 1. Navigation: grouped, collapsible sidebar

**Problem:** 19 flat items after operations modules landed — no hierarchy, competing labels.

**Decision:** intentional groups, matching how people think about the work:

- *(top level)* Dashboard · My Work
- **Work** — Projects · Calls · Boards · Gantt · Tickets (legacy, plan/flag-gated)
- **Directory** — Customers · Staff · Vendors · Resources
- **Insights** — Analytics · Reports
- **Financial** — Invoices · Billing
- **Library** — Files · Guide
- **Admin** — Organization · Settings

Mechanics: gated items drop out of their group; empty groups disappear; group collapse
persists per user (localStorage); the group containing the active page always stays open;
icon-only (collapsed sidebar) mode replaces headers with dividers. No duplicate paths to
any feature.

**Deliberately kept:** Tickets (legacy Kalos dispatch) and both Analytics/Reports — removal
is a data/product decision, not a UX one; both are demoted inside groups and flagged as
merge/retire candidates in PRODUCT_STABILIZATION_AUDIT.md.

## 2. Dashboard: Command Band, not a rewrite

**Problem:** the dashboard had good project sections but never answered "what's mine" or
"what changed" and had no fast create path.

**Decision:** an additive top band with exactly three cells — Attention Required (overdue
calls, unread call updates, my overdue tasks; collapses to a quiet all-clear line when
empty), My Work (task/punch/call counts, tap-through), Quick Actions (new project, new call
— deep-links straight into the create form, my work, upload file). The proven sections
below (At Risk, Tasks Due This Week, Team Capacity, Milestones, Activity) were left intact.
A full dashboard rewrite was rejected: high regression risk, low incremental value.

## 3. Destructive actions: one dialog pattern

`window.confirm` + `alert()` are replaced by a shared `ConfirmDialog` (used by Files and
project attachments): explains permanence, shows the failure reason inline, blocks
double-clicks while running. All future destructive actions should use it.

## 4. Card & label discipline

Standard adopted (already met by operations cards): max 3 primary indicators per card/row —
status pill, priority, one alert state (e.g. NEW UPDATE / SLA overdue). Identity line +
assignee + age are text, not badges. Everything else lives in the detail drawer.

Color semantics (consistent everywhere): red = urgent/overdue/blocked · amber = waiting/
attention · blue/indigo = active/informational · green = complete/approved · gray = neutral.
Never color alone — every badge has text.

**Deferred with spec:** legacy project/board cards still show up to 5 badges. Trimming them
touches boards, gantt tooltips, and reports simultaneously; scheduled for the next sprint
using this same ≤3 rule (keep status, priority, overdue; move stage/team/link badges into
the detail panel).

## 5. Detail record pattern

Calls set the reference pattern: right-side drawer, inline-editable core fields, categorized
activity/notes, progressive disclosure of secondary fields. Customers use a hub page
(they're a navigation root, not a queue item). Next sprint: bring project detail panel and
punch item modal onto the drawer section order (Overview → Activity → Files → Related →
People).

## 6. Filters

The FilterBar (search + typed filter defs + URL state + active count + clear + mobile
drawer) is the single pattern; no page-local filter rows. Saved-views UI remains the top
filter follow-up (schema already live).

## 7. What we intentionally did NOT do

- No visual theme change, no gradients/glass/animation work.
- No rewrite of working legacy pages (boards, gantt, punch, analytics).
- No new modules, no schema changes (zero migrations this sprint).
- No global search (biggest known gap — see audit; next sprint, needs a pg trigram or
  per-table union query design, not a quick hack).
