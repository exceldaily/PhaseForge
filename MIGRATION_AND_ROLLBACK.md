# Migration & Rollback

## Before applying anything: back up

This project applies migrations manually in the Supabase SQL editor (existing convention).
Take a backup first:

1. **Dashboard**: Supabase → Database → Backups → confirm a recent daily backup exists
   (Pro plan) or trigger one.
2. **CLI export** (recommended, works on any plan):
   ```bash
   npx supabase login
   npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup_pre_operations.sql
   npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backup_pre_operations_data.sql
   ```
3. Keep both files outside the repo (they may contain customer data — do not commit).

## Apply order (all additive; safe to run on a live DB)

Run each file's contents in the Supabase SQL editor, in this order:

1. `supabase/migrations/20260705_operations_foundation.sql`
2. `supabase/migrations/20260705_operations_crm.sql`
3. `supabase/migrations/20260705_operations_workforce.sql`
4. `supabase/migrations/20260705_operations_calls.sql`
5. `supabase/migrations/20260705_operations_files_invoices.sql`
6. *(dev/staging only)* `scripts/seed_demo_orgs.sql`

Every statement is `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` /
`ON CONFLICT DO NOTHING`, so re-running a file is harmless. No existing table, column, row,
or policy is dropped or altered destructively. Legacy data is preserved in place — existing
companies are the legacy organizations and get module rows automatically.

## Per-migration rollback

Rollbacks only drop objects the migration created. **Data in the new tables is lost on
rollback — take a dump first if any real data exists.**

### 5 → files/invoices
```sql
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_invoice_fk;
DROP INDEX IF EXISTS idx_calls_invoice;
DROP TABLE IF EXISTS public.invoice_items, public.invoices, public.org_files CASCADE;
DROP POLICY IF EXISTS "org_files_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "org_files_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "org_files_storage_delete" ON storage.objects;
-- Optional (removes uploaded files!): DELETE FROM storage.buckets WHERE id = 'org-files';
ALTER TABLE public.projects DROP COLUMN IF EXISTS customer_id,
  DROP COLUMN IF EXISTS location_id, DROP COLUMN IF EXISTS division_id;
```

### 4 → calls
```sql
DROP TRIGGER IF EXISTS trg_touch_call_on_note ON public.call_notes;
DROP FUNCTION IF EXISTS public.touch_call_on_note();
DROP TABLE IF EXISTS public.note_templates, public.call_reads, public.call_notes, public.calls CASCADE;
```

### 3 → workforce
```sql
DROP TABLE IF EXISTS public.vendor_contacts, public.vendors,
  public.staff_certifications, public.staff_details CASCADE;
```

### 2 → crm
```sql
DROP TABLE IF EXISTS public.assets, public.locations,
  public.customer_contacts, public.customers CASCADE;
```

### 1 → foundation
```sql
DROP TRIGGER IF EXISTS trg_seed_org_modules ON public.companies;
DROP FUNCTION IF EXISTS public.seed_org_modules();
DROP FUNCTION IF EXISTS public.next_org_number(text);
DROP TABLE IF EXISTS public.org_counters, public.org_call_settings, public.ops_activity,
  public.saved_views, public.record_tags, public.org_tags, public.divisions,
  public.organization_modules CASCADE;
DROP FUNCTION IF EXISTS public.org_has_module(text);
DROP FUNCTION IF EXISTS public.ops_is_manager();
DROP FUNCTION IF EXISTS public.ops_is_admin();
DROP FUNCTION IF EXISTS public.get_my_ops_role();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS ops_role;
```

Full rollback = run 5 → 4 → 3 → 2 → 1 in that order. Legacy PhaseForge is untouched at
every step because nothing legacy was modified (the only legacy-table changes are the three
nullable `projects` columns and nullable `profiles.ops_role`, both dropped above).

## Git rollback

See FABLE_HANDOFF.md → Git commands (branch revert, per-milestone revert, safe merge).
