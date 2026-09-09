import 'server-only'

// Address to coordinates through OpenStreetMap's Nominatim. No key, no
// billing, one request a second, and a real User-Agent, which is their
// usage policy. Callers that loop must space requests out (see pace()).

const UA = 'PhaseForge/1.0 (customersupport@phase-forge.com)'

export interface GeocodeHit { lat: number; lng: number; label: string }

export async function geocodeAddress(query: string): Promise<GeocodeHit | null> {
  const q = query.trim()
  if (!q) return null
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return null
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    const hit = rows[0]
    if (!hit) return null
    const lat = Number(hit.lat), lng = Number(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, label: hit.display_name }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/** Nominatim wants at most one request a second. */
export const pace = () => new Promise<void>((r) => setTimeout(r, 1100))
