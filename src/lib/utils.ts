import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function validateHexColor(color: string | null | undefined): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color
  return '#6366f1'
}

/**
 * Normalize a user-entered URL for safe linking. Only http(s) is allowed
 * (blocks javascript:/data: etc.); a bare domain gets https:// prefixed.
 * Returns null if it can't be made into a safe absolute URL.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(t)) return `https://${t}`
  return null
}
