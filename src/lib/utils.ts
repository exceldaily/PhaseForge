import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function validateHexColor(color: string | null | undefined): string {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color
  return '#6366f1'
}
