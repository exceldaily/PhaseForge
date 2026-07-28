// Which Postgres schema PostgREST queries target. On the dedicated Supabase
// project this is 'public'; on the shared OrbitStack project PhaseForge lives
// in the 'phaseforge' schema. Driven by env so the same code runs against
// either backend - cutover is an env flip, not a code change.
export const DB_SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'
