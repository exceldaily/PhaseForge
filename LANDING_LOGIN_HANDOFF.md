# Landing & Login Handoff

Branch: `fable/service-equipment-landing` · See LANDING_LOGIN_REDESIGN_PLAN.md for the audit.

## What changed

| Area | Change |
|---|---|
| `/` (src/app/page.tsx) | Session-aware redirect: signed-in → `/app/dashboard`, else → `/login` (the landing). Was a blind redirect that double-hopped logged-out visitors. |
| Nav | Links brightened (`#6B8099` → `#9FB4CC`, white on hover), added Workflow anchor. |
| Hero product preview | Wrapped in browser chrome (traffic dots + `app.phase-forge.com` address bar) with three staggered "live activity" chips (phase completed / punch closed / crew assigned) that slide in after the hero settles and pulse gently. |
| Mobile layout (bug fix) | Three fixed inline grids (`1fr 1fr`, `100px 1fr 220px`) now responsive Tailwind grids — capabilities rows, timeline header, and sign-in split all stack cleanly on phones. |
| New: Workflow section | Plan → Coordinate → Execute → Verify → Close Out rail (5 cards, arrows on desktop, 2-col stack on mobile), `#workflow` anchor. |
| New: Platform section | "Built as an operations platform, not a point tool" + 5 pillars (Projects, Field Coordination, Punch Lists, Documentation, Operational Visibility). No AI claims, no fake features. |
| New: Final CTA | "Build with clarity. **Deliver with control.**" + Start Building / Sign In, soft radial gold glow. |
| Reduced motion | `prefers-reduced-motion: reduce` collapses all animations/transitions page-wide (`.pf-page` scope). |

## What did NOT change

- `handleLogin`, Supabase auth calls, post-login redirect, error/loading states, forgot-password
  and signup links — byte-identical logic.
- No new dependencies, no new assets (reuses `login-bg.png` + logo lockups), no schema changes.
- No `/app/*` route touched by this work stream.

## Components/routes affected

- `src/app/page.tsx` (root redirect)
- `src/app/login/page.tsx` (all visual changes; single file)
- `LANDING_LOGIN_REDESIGN_PLAN.md`, this file

## Testing performed

- `npm run build` green (all routes, TS clean); ESLint clean on both files.
- Live smoke test against the running dev server: `/login` returns 200 and renders the
  WORKFLOW, PLATFORM, final-CTA, and browser-chrome sections.
- Remaining human QA: real phone/tablet pass (grids now stack, but eyeballs beat grep) and a
  sign-in round-trip in the browser — auth code untouched, so risk is minimal.

## Optional next improvements

- Replace `login-bg.png` with a fresh screenshot showing the new grouped sidebar + Calls page.
- Subtle mouse-parallax on the product frame (deliberately skipped — restraint first).
- A dedicated `/terms` page, then add Terms to the footer.

## Rollback

```bash
# Whole branch (landing + service features):
git checkout fable/phaseforge-stabilization

# Landing/login commit only (after checking `git log --oneline -3`):
git revert --no-edit <landing-commit-sha>
```
