import { PunchStatus } from '@/types/app'

// ── Status presentation ─────────────────────────────────────────────────────
// Ordered for the board columns (Open → In Progress → Needs Review → Completed).
export const PUNCH_STATUS_ORDER: PunchStatus[] = ['open', 'in_progress', 'needs_review', 'completed']

export const PUNCH_STATUS_LABELS: Record<PunchStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  needs_review: 'Needs Review',
  completed: 'Completed',
}

// Tailwind chip classes (badge style), matching PRIORITY_COLORS in constants.ts.
export const PUNCH_STATUS_CHIP: Record<PunchStatus, string> = {
  open: 'bg-rose-100 text-rose-700',
  in_progress: 'bg-amber-100 text-amber-700',
  needs_review: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
}

// Solid dot/accent colors for status (hex, like PHASE_STATUS_COLORS).
export const PUNCH_STATUS_COLOR: Record<PunchStatus, string> = {
  open: '#f43f5e',
  in_progress: '#f59e0b',
  needs_review: '#8b5cf6',
  completed: '#10b981',
}

// ── Client-side image compression ────────────────────────────────────────────
// Downscale to maxEdge and re-encode as JPEG before upload. Falls back to the
// original file if anything goes wrong (e.g. unsupported type, decode failure).
export async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.8
): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob) return file

    // Don't bother if compression made it bigger.
    if (blob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
