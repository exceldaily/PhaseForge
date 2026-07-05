# Landing & Login Redesign Plan

## Audit findings

- There is **no separate landing page**: `/` blind-redirects to `/app/dashboard` (which bounces
  logged-out users to `/login`). The login page (`src/app/login/page.tsx`, 562 lines) already
  IS a full dark-industrial landing: sticky nav, blueprint-grid hero with animated structural
  lines, product screenshot, capabilities panel list, animated Gantt demo, split sign-in
  section, footer. Brand: near-black `#080F1A`, orange/gold `#D8891C→#F2B94B`, Sora/Manrope.
- **Real defects found:**
  1. Three grids use fixed inline `gridTemplateColumns` (`1fr 1fr`, `100px 1fr 220px`) that
     never collapse — **broken layout on phones**.
  2. Nav links are `#6B8099` on near-black — too faint (fails comfortable contrast).
  3. Product preview is a flat `<img>` — no frame, no life.
  4. No workflow story, no platform section, no final conversion CTA.
  5. No `prefers-reduced-motion` handling.
  6. `/` wastes a hop for logged-out visitors.

## Approach: enhance in place, zero auth changes

The page's bones are exactly the requested direction (dark industrial, blueprint motion,
restrained gold). Rebuilding would risk auth regressions for styling's sake. So:

1. **Mobile**: convert the three fixed grids to responsive Tailwind grids (stack on mobile).
2. **Nav**: brighten link color, keep sticky blur.
3. **Product preview**: browser-chrome frame (traffic dots + address bar) around the existing
   screenshot, plus small "live" overlay chips (activity indicators) — honest, no fake UI.
4. **New sections** (all static JSX, no deps): Workflow rail (Plan → Coordinate → Execute →
   Verify → Close Out), Platform pillars (Projects / Field Coordination / Punch Lists /
   Documentation / Operational Visibility), Final CTA ("Build with clarity. Deliver with
   control." + Start Building / Sign in).
5. **Reduced motion**: global media query kills animations/transitions for users who ask.
6. **Root route**: `/` checks the session server-side → dashboard if signed in, `/login`
   (the landing) otherwise.

Untouched: `handleLogin`, Supabase client usage, redirects after sign-in, forgot-password &
signup links, all `/app/*` routes, all assets (reusing `login-bg.png`, logo lockups).
