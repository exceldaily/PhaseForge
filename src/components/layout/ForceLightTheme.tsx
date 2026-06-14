'use client'

import { useEffect } from 'react'

/**
 * Public/auth pages (login, signup, password reset) have their own fixed
 * designs and must never inherit the app's dark theme — e.g. after a Pro user
 * signs out and is client-navigated here while `.dark` is still on <html>.
 * Renders nothing; just strips the class on mount.
 */
export function ForceLightTheme() {
  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])
  return null
}
