# Payroll audit worker

Runs on your Windows computer. Reads Kalos timesheets in its own Chrome window and
sends the page text to PhaseForge, which does all the checking. Read only: it never
approves, edits, or submits anything in Kalos.

## One time setup

1. **Server key (Vercel).** Add an environment variable on the PhaseForge project:

   `PAYROLL_AUDIT_MASTER_KEY` = a long random string (32+ characters).
   Never share it. Redeploy after adding it.

2. **Switch the module on.** Settings > Modules > Payroll Audit. Only owners and
   admins can see or open it.

3. **Get the worker settings.** Payroll Audit > Settings > Local audit worker >
   Show worker key. Copy the three lines into a file named `.env` in this folder
   (use `worker.env.example` as the template). `.env` is git-ignored.

4. **Install.** From the repo root, once:

   ```
   npm install
   ```

   The worker uses the `playwright` package already in the repo. By default it drives
   an installed Google Chrome. No Chrome? Set `WORKER_BROWSER=chromium` in `.env` to
   use Playwright's bundled build, or `msedge`, or a full path to Brave.

5. **Sign in to Kalos.** Kalos may drop its sign-in when the browser closes, so the
   worker keeps its browser window open while it runs. Easiest: start the worker
   (next section) and sign in in the window it opens. If a run starts while you are
   signed out, the worker waits up to 10 minutes in that window for you to sign in.
   The separate `login` command below is optional.

   ```
   node scripts/payroll-audit-worker/worker.mjs login
   ```

   A Chrome window opens on Kalos payroll. Sign in yourself (including any MFA),
   confirm the payroll page shows, then close the window. The sign-in lives in the
   worker's own profile folder
   (`%LOCALAPPDATA%\PhaseForgeAuditWorker\chrome-profile`). It is never sent anywhere.

## Every day use

```
node scripts/payroll-audit-worker/worker.mjs run
```

Leave it running. It checks PhaseForge every 15 seconds, and when you press
**Run audit now** (or the daily schedule queues one) it opens each technician's
timesheet for the requested weeks, sends the text, and reports progress.
`worker.mjs once` does one queued run and exits. `worker.mjs jobs` reads missing job
addresses from Kalos job pages (the same link the scheduler uses) and exits; an audit
run also does this automatically at the end.

If Kalos signs the worker out, the run stops with "Kalos sign-in expired" and
administrators are notified. Run `login` again and retry.

## What it can and cannot do

- Clicks only: the department and week filters, "Show Approved" (a view filter), and
  the eye icon that opens a timesheet. Any control whose text looks like approve,
  submit, delete, save, edit and so on is refused, and write-looking network
  requests are dropped. See `lib.mjs`.
- Opens no debugging port. Talks to PhaseForge outbound over HTTPS only, signed per
  request with an HMAC key, a timestamp, and a one time nonce.
- Skips rows Kalos lists as "No Timesheet Submitted".
- Reads one timesheet at a time with a short pause between them.

## Rotating the key

Payroll Audit > Settings > Rotate key. The old key stops working immediately; paste
the new one into `.env`.

## Hosting the worker on Railway later

Not built, deliberately. The worker needs a signed-in Kalos browser session, and
getting one into a hosted container means storing a Kalos login or session
somewhere, which this design avoids. If you later decide that is acceptable, the
worker is already a plain Node program that only makes outbound calls, so it can run
in a container with a persistent volume for the profile folder. Railway is more
useful for a self-hosted OSRM router (set `OSRM_BASE_URL` on the PhaseForge project)
once audit volume outgrows the free public one.
