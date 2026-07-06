---
name: deploy
description: Verify, merge to main, push, and confirm the PhaseForge production deployment on phase-forge.com. Use when the user says deploy, ship, or push to production.
---

# Deploy PhaseForge to production

1. **Verify first** (never deploy red):
   - `npx tsc --noEmit` → must be clean
   - `npx vitest run` → all pass
   - `npm run build` → compiles
2. **Merge + push** (deploys via Vercel Git integration):
   - Current feature branch pattern: `fable/<topic>`; merge with
     `git checkout main && git merge --no-ff <branch> -m "..." && git push origin main && git checkout <branch>`
   - Never force-push; never commit `.env*`.
3. **Confirm the deployment**: Vercel MCP `list_deployments`
   (projectId `prj_cvNJZVZ1oM04mPRkKU7j2XmUneaK`, teamId `team_gvdr8buzmfGzhDpUEJKiiqA6`)
   → newest deployment `state: READY` and its `githubCommitSha` matches the pushed commit.
4. **Smoke test prod**: `curl -s -o /dev/null -w "%{http_code}" https://www.phase-forge.com/login`
   → 200; plus a check specific to what shipped.
5. If a migration was part of the change, it must ALREADY be applied to Supabase
   (project `iugqydkkounnlkbploox`) before pushing code that depends on it.
6. Report: commit hash, what shipped, what was verified, anything still pending
   (env vars, manual steps).
