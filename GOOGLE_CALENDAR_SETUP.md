# Google Calendar Integration — Setup & Status

## How a NEW COMPANY turns this on (the easy path)

All the Google Cloud work below was **one-time developer registration for PhaseForge
itself** — no customer ever repeats it. A company admin self-serves in ~3 minutes:

1. Settings → **Scheduling & Calendar** — a guided 4-step checklist walks them through it
2. **Connect Google** → sign in with the company Google account → approve
3. **Pick calendar** → choose their shared schedule calendar (their personal/primary
   calendar is flagged "not recommended"; nothing is written until a calendar is chosen)
4. Add superintendents + SCH labels (each step has an inline "Add one" button)

Then every phase gets a "Sync this phase to Google Calendar" button in the Gantt editor.
Connections are per-organization (RLS-isolated), so each customer's calendar, tokens, and
mappings are completely separate.

**Prerequisites for the button to work in production (one-time, PhaseForge-side):**
- The 3 `GOOGLE_*` env vars set in Vercel (see below)
- OAuth app published to production in Google Cloud Console (Audience → Publish app);
  until Google verification is completed, users see a "Google hasn't verified this app"
  interstitial — they click Continue and everything works. To remove that screen, submit
  for verification (Verification Center) — needs the privacy-policy/terms URLs on
  phase-forge.com and a demo video; typically ~1–2 weeks.

## What is BUILT and LIVE (foundation sprint, branch `fable/scheduling-foundation`)

- **Database (applied to production Supabase):** `superintendents`, `schedule_labels` (SCH,
  with mappings to calendar/color/attendee/superintendent), `gcal_connections` (per-org,
  encrypted tokens), `gcal_event_links` (phase↔event with revisions/etags), and
  `gcal_pending_changes` (inbound review queue). Projects gained `job_number`,
  `store_site_id`, `superintendent_id`, structured address fields (`formatted_address`,
  `place_id`, `maps_url`, lat/lng), `quick_links` jsonb, `schedule_label_ids`. Phases gained
  `sync_enabled`, `superintendent_id`, `schedule_label_ids`. All org-scoped RLS.
- **OAuth flow:** `/api/google/oauth/start` (admin-only) → Google consent →
  `/api/google/oauth/callback` stores AES-256-GCM-encrypted tokens per org. Reconnect and
  disconnect supported. Tokens are never selected into any page payload.
- **Settings UI:** Settings → Scheduling & Calendar — connect/reconnect/disconnect, account
  + sync status, calendar picker (writer-access calendars only), routing mode
  (shared / superintendent), Superintendent directory CRUD (with default SCH labels and
  optional own calendar), SCH label CRUD (chip color, Google colorId, attendee, calendar
  routing, linked superintendent).
- **Sync engine core (pure + unit-tested, 12 tests):** event title
  `[JobNumber] Project – Phase`, full description builder, all-day date handling with
  exclusive end dates, private `extendedProperties` identity metadata (never title-matching),
  the only-touch-our-events guard, and the superintendent SCH-label swap logic (removes only
  the prior sup's labels, preserves the rest, never duplicates).
- **Google REST client (server-only):** list calendars, insert/patch/delete events, and
  `moveEvent` (duplicate-free migration between calendars for superintendent reassignment).

## What YOU must do in Google Cloud Console (I cannot do this part)

1. console.cloud.google.com → create/select a project (e.g. "PhaseForge").
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen** → External → app name "PhaseForge", your email; add scopes
   `calendar.readonly` and `calendar.events`; add yourself as a test user (Testing mode is
   fine for now).
4. **Credentials → Create credentials → OAuth client ID** → Web application:
   - Authorized redirect URIs — add BOTH:
     - `http://localhost:3000/api/google/oauth/callback`
     - `https://www.phase-forge.com/api/google/oauth/callback`
5. Copy the Client ID and Client Secret.

## Environment variables (local `.env.local` AND Vercel → Settings → Environment Variables)

```
GOOGLE_CLIENT_ID=<from step 5>
GOOGLE_CLIENT_SECRET=<from step 5>
GOOGLE_TOKEN_ENC_KEY=<32 random bytes, base64 — generate with:
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
```

Redeploy (or restart dev) after setting them.

## Connecting your PhaseForge Test calendar

1. In Google Calendar, create a calendar named **"PhaseForge Test"**.
2. PhaseForge → Settings → Scheduling & Calendar → **Connect Google Calendar** → sign in
   with your personal account → approve.
3. Click **Choose calendar** → pick **PhaseForge Test** (the picker flags your primary
   calendar as not recommended for testing; nothing is written anywhere until a calendar is
   chosen, and only the chosen calendar is ever written to).
4. Routing mode: leave on **Shared schedule calendar**.

## Switching to the company account later — no code changes

Admin clicks **Disconnect**, then **Connect** with the company Google account and picks the
company calendar. Existing event links keep their metadata; a migration preview/cleanup
screen for old test events is part of the next sprint (until then, test events can be left
alone or deleted manually — PhaseForge never adopts or touches unrelated events).

## Honest status — what is NOT done yet (next sprint)

The prompt's end-to-end bar (“real Calendar sync path works end-to-end”) **cannot be met
until the Google Cloud credentials above exist**, so this sprint delivered everything up to
that wall, fully real and tested, and stopped short of claiming sync works. Remaining:

1. **Push sync actions** — "Sync phase to calendar" button + auto-push on phase date/title
   change, using the (tested) payload builder + `gcal_event_links` (create/patch/delete,
   deletion prompts). The engine and schema exist; the wiring into phase actions does not.
2. **Pull sync ("Sync Now")** — fetch linked events, apply date changes to phases, re-run
   dependency recalculation, queue non-date changes into `gcal_pending_changes`, and the
   review/conflict UI on top of that table.
3. **Project form fields** — job number / store ID / superintendent / SCH / quick links /
   address inputs on the project create+edit forms, and card display of job number +
   superintendent + SCH chips + sync indicator. (Columns are live; forms don't expose them
   yet.)
4. Google Places autocomplete (needs `GOOGLE_MAPS_API_KEY`; manual address + generated maps
   link is the built-in fallback per spec).
5. Seed data for ALDI-style demo projects (script, run-on-demand only — not auto-applied to
   your production org).
6. Org-level card-configuration UI beyond the existing board field configurator.

Recommended order once your credentials are in: connect test calendar → I wire push sync →
verify a real event appears → pull sync + review queue → project form fields → cards.
