<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Keep the in-app Guide current (required)

`src/app/app/guide/GuideClient.tsx` is the product manual users see at /app/guide.
Whenever a change set adds, removes, or alters a **user-facing** feature (new page,
new control, changed behavior, new plan limit, renamed concept), update the matching
`SECTIONS` entry in the same commit — add a section if the feature is new territory.
If the change shifts the product's big picture, also review the steps in
`src/components/onboarding/WelcomeTour.tsx`. Pure refactors, fixes with no visible
behavior change, and styling tweaks don't need a Guide update.
