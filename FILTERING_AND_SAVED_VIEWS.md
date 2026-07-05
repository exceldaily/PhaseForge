# Filtering & Saved Views

## One system, every list page

All operations list pages share the same pieces instead of page-local filter code:

- **`FilterBar`** (`src/components/operations/FilterBar.tsx`) — search box, select /
  multi-select / date-range controls, active-filter count badge, Clear all, and a mobile
  filter drawer. Pages pass an array of `FilterDef`s; nothing else.
- **`useUrlFilters()`** — filters live in the URL query string (`?status=open,assigned&
  customer=<id>`). That gives persistence across navigation, shareable links, and
  back/forward for free. Multi-select values are comma-joined (`splitMulti` helper).
- **Filtering** happens client-side over the server-fetched org dataset (v1; capped
  at 500 rows for calls/files). The `FilterDef` contract is deliberately independent of
  where filtering executes, so pages can move to server-side `.eq()/.in()` queries as
  datasets grow without touching the UI.

## Coverage

| Page | Filters |
|---|---|
| Customers | search, status (multi), division, type, has-active-calls |
| Locations | search, customer, division, state, has-active-calls |
| Assets | search, customer, asset type, status (multi), warranty active/expired |
| Staff | search, ops role (multi), division, employment status, certs expiring ≤60d |
| Vendors | search, trade, status, insurance/license expiring ≤30d, has-active-calls |
| Calls | search, status (multi), priority (multi), division, customer, staff, vendor, SLA state, aging (3/7/14d), new updates, invoice-ready, include-closed, created date range |
| Files | search, file kind, linked record type, customer, uploader, upload date range |
| Invoices | search, status (multi), customer, overdue, due date range |
| Reports | headline stats deep-link into pre-filtered call/invoice URLs |

## Saved views

- Table `saved_views (company_id, user_id, page_key, name, filters jsonb, is_default)`.
  `user_id NULL` = shared org view (manager+ can create); otherwise personal.
- Because filter state **is** the URL query, a saved view is just a stored query-string
  object — apply = `setFilters(view.filters)`.
- Table + RLS are live; the picker UI is the next increment (see FABLE_HANDOFF.md →
  What remains). Recommended UX: dropdown in `FilterBar` with "Save current view…",
  seeded suggestions like My Open Calls / Emergency / Waiting on Parts / Older than 7 days /
  Invoice Ready / Warranty Expiring Soon.

## Tags

`org_tags` (per-org name+color) and `record_tags` (polymorphic link to any record type) are
migrated with RLS and indexes. Tag chips/pickers on record pages are a follow-up increment;
the `FilterBar` `multiselect` type already supports a tags facet once wired.
