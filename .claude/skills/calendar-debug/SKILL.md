---
name: calendar-debug
description: Diagnose PhaseForge Google Calendar sync issues (events not appearing, wrong dates, sync errors, OAuth failures). Use when the user reports calendar sync problems.
---

# Debug Google Calendar sync

## Architecture (read ARCHITECTURE.md § Google Calendar sync)
Push+pull engine in `src/lib/scheduling/syncCore.ts`; per-org connection in
`gcal_connections`; links in `gcal_event_links`; inbound review in `gcal_pending_changes`.

## Checklist, in order

1. **Env**: `GOOGLE_CLIENT_ID/SECRET/TOKEN_ENC_KEY` set? (local `.env.local`; Vercel prod).
   Missing → settings page shows "not configured" (that's the tell).
2. **Connection row** (Supabase MCP, project `iugqydkkounnlkbploox`):
   `SELECT company_id, account_email, target_calendar_id, is_active, last_error FROM gcal_connections;`
   - `last_error` populated → usually token revoked → user clicks Reconnect.
   - No `target_calendar_id` → nothing can sync; pick calendar in Settings → Scheduling.
3. **Links**: `SELECT status, last_error, last_pushed_at FROM gcal_event_links WHERE phase_id='…';`
   - `event_deleted` → someone deleted it in Google; re-sync recreates.
4. **Run the sync manually** and read its JSON summary:
   `curl "http://localhost:3000/api/cron/calendar-sync"` (add `?secret=$CRON_SECRET` on prod).
   Slow/timeout → check nothing regressed the staleness filter (only phases with
   `updated_at > last_pushed_at` should push; caps 50/org).
5. **OAuth redirect_uri_mismatch**: registered URIs live in Google Cloud console →
   project `phaseforge` (under exceldaily7@gmail.com, authuser=1) → Clients → PhaseForge Web.
   Must include localhost:3000, https://www.phase-forge.com AND https://phase-forge.com callbacks.
6. **"Unverified app" screen**: expected until Google verification completes — Advanced →
   Continue. Not a bug.

## Rules
- NEVER touch calendar events without our `extendedProperties.private.pf_owner=phaseforge`
  metadata (`isPhaseForgeEvent` guard — keep it in any new code path).
- Two orgs are connected: test org `c0511e4d…` → "PhaseForge Test" calendar;
  Kalos org `472355c2…` → "Refrigeration Projects" (REAL — don't create test data there).
- Pure logic goes in `calendarEvent.ts` with unit tests (`npx vitest run`).
