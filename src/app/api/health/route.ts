import { NextResponse } from "next/server";

/**
 * Health endpoint for OrbitStack monitoring.
 *
 * OrbitStack (the ops command center) probes this on a schedule and records
 * the result. The response shape is OrbitStack's health contract:
 * { name, status, environment, version, timestamp }.
 *
 * SECURITY: public endpoint. Never expose secrets, connection strings,
 * environment values or stack traces here. Everything below is constant or
 * already public.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VERSION = "1.0.0";

export function GET() {
  // VERCEL_ENV is "production" | "preview" | "development"; all are valid
  // values in the contract. Local dev has none, hence "local".
  const environment = process.env.VERCEL_ENV ?? "local";

  return NextResponse.json(
    {
      name: "PhaseForge",
      status: "ok",
      environment,
      version: VERSION,
      timestamp: new Date().toISOString(),
    },
    { status: 200, headers: { "cache-control": "no-store, max-age=0" } },
  );
}
