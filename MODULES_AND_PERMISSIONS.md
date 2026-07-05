# Modules & Permissions

## Modules

Keys: `customers` · `staff` · `vendors` · `calls` · `projects` · `files` · `invoices` · `reports`

- Stored per org in `organization_modules (company_id, module_key, enabled, settings jsonb)`.
- **Defaults**: existing and new organizations get `projects`, `reports`, `files` enabled;
  everything else off until an owner/admin enables it (Settings → Modules).
- New companies are auto-seeded by the `trg_seed_org_modules` trigger.
- Enforcement is layered: RLS (`org_has_module`) → server route guard (`requireModule`) →
  server actions → sidebar visibility. Disabled modules are dead ends even via direct URL.

## Operations roles (`profiles.ops_role`)

Legacy `profiles.role` is untouched and still drives all pre-existing features. The new column
was backfilled: owner→owner, admin→admin, manager→project_manager, member→staff, viewer→read_only.

| Role | Intent |
|---|---|
| `owner` | Everything, including modules and roles |
| `admin` | Everything except org ownership |
| `dispatcher` | Runs the Calls board; manages customers/locations/assets/vendors; reads invoices |
| `project_manager` | Projects + operations records; reads invoices; no org settings |
| `billing` | Invoices full control; reads customers/calls; no staff management |
| `staff` | Technician: sees only calls assigned to (or created by) them; can update those |
| `read_only` | Browse-only where module role lists allow |

Role ↔ module gating lives in `src/lib/operations/modules.ts` (`roles` per module) and is
mirrored in RLS. Example enforced outcomes:

- Dispatcher manages Calls but cannot write invoices (RLS INSERT/UPDATE denies).
- Billing sees Invoices but the Staff page redirects (module role list) and staff RLS still
  protects data.
- Staff/technician gets a Calls page filtered to their work by RLS itself, not just UI.
- An org with Calls enabled and Projects disabled: Projects links vanish; `/app/customers`
  still works; legacy project pages remain (projects module is enabled by default for
  backward compatibility — disable it to test gating).

## Changing access

- **Modules**: Settings → Modules (owner/admin), instant effect on nav + routes + RLS.
- **Roles**: Staff page → click a member → Operations role dropdown (owner/admin; you cannot
  demote yourself).
- **Adding a module later**: add the key to `OPERATIONS_MODULES`, seed rows
  (`INSERT … ON CONFLICT DO NOTHING`), gate its tables with `org_has_module('<key>')`, call
  `requireModule('<key>')` in its pages.
