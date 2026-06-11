export function slugify(value: string, fallback = 'item') {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

export function createUniqueSlug(value: string, fallback = 'item') {
  return `${slugify(value, fallback)}-${Date.now()}`
}
