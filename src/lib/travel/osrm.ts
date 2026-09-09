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
