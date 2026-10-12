import 'server-only'

// Road drive times from the public OSRM demo router. Free, no key, and
// honest about being a demo: when it is slow or down we fall back to the
// straight-line estimate in geo.ts rather than blocking the page.

export interface LatLng { lat: number; lng: number }

/**
 * Minutes and miles from each source to the single destination, in source
 * order. null for the whole call when the router did not answer, null per
 * entry when it could not route that pair.
 */
export async function driveTimesTo(sources: LatLng[], dest: LatLng): Promise<({ minutes: number; miles: number } | null)[] | null> {
  if (!sources.length) return []
  const coords = [...sources, dest].map((p) => `${p.lng},${p.lat}`).join(';')
  const srcIdx = sources.map((_, i) => i).join(';')
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=${srcIdx}&destinations=${sources.length}&annotations=duration,distance`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'PhaseForge/1.0' } })
    if (!res.ok) return null
    const body = (await res.json()) as { code?: string; durations?: (number | null)[][]; distances?: (number | null)[][] }
    if (body.code !== 'Ok' || !body.durations) return null
    return sources.map((_, i) => {
      const sec = body.durations?.[i]?.[0]
      const m = body.distances?.[i]?.[0]
      if (sec === null || sec === undefined) return null
      return { minutes: Math.round(sec / 60), miles: m === null || m === undefined ? NaN : Math.round(m / 1609.344) }
    })
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * Road minutes and miles for one origin and one destination. OSRM_BASE_URL
 * points this at a self-hosted router (the public demo is fine for a cached,
 * low-volume audit but is not a service to lean on). Retries twice on a
 * network or server error; null means the router could not answer.
 */
export async function driveRoute(a: LatLng, b: LatLng): Promise<{ minutes: number; miles: number | null } | null> {
  const base = (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '')
  const url = `${base}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 800 * attempt))
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10000)
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'PhaseForge/1.0' } })
      if (res.status === 400 || res.status === 404) return null // not routable; retrying will not help
      if (!res.ok) continue
      const body = (await res.json()) as { code?: string; routes?: { duration: number; distance: number }[] }
      const r = body.routes?.[0]
      if (body.code !== 'Ok' || !r) return null
      return { minutes: Math.round(r.duration / 60), miles: Math.round((r.distance / 1609.344) * 10) / 10 }
    } catch {
      continue
    } finally {
      clearTimeout(t)
    }
  }
  return null
}
