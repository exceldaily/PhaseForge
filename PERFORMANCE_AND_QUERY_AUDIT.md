# Performance & Query Audit

Scope: current data sizes (531 phases, 50 projects, ~60 operations rows) mean nothing is slow
*today*; this audit records what will bite first at real scale and what protections already
exist. No blind indexes were added this sprint.

## Already in place (verified)

- Every operations table indexes `company_id`, all FKs, and the common filter/sort columns
  (status, priority, dates, assignments) — added in the original migrations, including
  composite `(company_id, status)`-style indexes and the partial index on invoice-ready calls.
- List queries are org-scoped single fetches with joins (no N+1 loops in server components);
  calls page fetches relations in one `select` with embedded resources.
- Calls/files fetches are capped (500 rows) and dashboards use count-style rollups.
- `next_org_number` is a single atomic upsert (no read-modify-write races).

## Known future bottlenecks (ranked, with the fix ready)

1. **Client-side filtering on Calls/Files** — fine to ~500 rows, then move `FilterDef`s to
   server-side `.eq()/.in()` queries (the FilterBar contract was designed so pages can switch
   without UI changes). Trigger: any org exceeding the cap.
2. **RLS `auth.uid()`/helper-function re-evaluation per row** (Supabase "auth_rls_initplan"
   pattern) — at 10k+ rows per table, wrap policy calls as `(SELECT get_my_company_id())` to
   collapse to an InitPlan. Mechanical rewrite across policies; do it once with a staging
   EXPLAIN pass rather than piecemeal.
3. **`call_notes` visibility subquery** (`call_id IN (SELECT id FROM calls)`) — correct but
   worth an EXPLAIN at scale; replace with an EXISTS join if slow.
4. **Dashboard fan-out** — the page runs ~6 parallel queries plus the Command Band's 4; all
   indexed, all org-scoped. If TTFB grows, cache the module row lookup per request.
5. **Legacy `projects.select('*, phases(*)')`** on the dashboard pulls every phase of every
   project — the heaviest existing query. At >200 projects, select only the phase columns the
   dashboard uses.

## How to re-check

Supabase Dashboard → Advisors → Performance (or MCP `get_advisors type=performance`), plus
Database → Query Performance for live pg_stat_statements once real usage exists.
