---
name: new-migration
description: Add a PhaseForge database migration safely (schema change, new table, new column, RLS policy). Use when a change needs Supabase schema work.
---

# Add a database migration

Project: Supabase `iugqydkkounnlkbploox` (production — real Kalos data lives here).

1. **Additive only** by default: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
   No DROP/destructive ALTER without an explicit user decision + backup plan.
2. **Every new table**: `company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE`,
   `ENABLE ROW LEVEL SECURITY`, and policies scoping to `get_my_company_id()` —
   writes usually also require `ops_is_manager()` / `ops_is_admin()`. Copy the pattern from
   `supabase/migrations/20260707_scheduling_foundation.sql`.
3. **Write the file**: `supabase/migrations/YYYYMMDD_<topic>.sql` (keep in git).
4. **Apply live** via Supabase MCP `apply_migration` (snake_case name). If the MCP is
   unavailable, give the user the SQL for the dashboard SQL editor.
5. **Verify**: `execute_sql` a `SELECT` against the new objects; for RLS changes run
   `get_advisors(type: security)` and confirm no new WARN/ERROR.
6. **Types**: update `src/types/app.ts` (or `src/lib/operations/types.ts`) to match.
7. Note the migration in the commit message and FABLE_HANDOFF.md; rollback SQL should be
   obvious from the file (documented per MIGRATION_AND_ROLLBACK.md).
