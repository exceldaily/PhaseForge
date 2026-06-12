'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  effectiveTheme: 'light' | 'dark'
  toggleTheme: (newTheme?: Theme) => Promise<void>
  isMounted: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system')
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light')
  const [isMounted, setIsMounted] = useState(false)

  // Initialize theme on mount
  useEffect(() => {
    const initializeTheme = async () => {
      try {
        // Try to load from localStorage first (for speed)
        const stored = localStorage.getItem('phaseforge_theme') as Theme | null
        if (stored) {
          setTheme(stored)
        } else {
          // Load from database if user is authenticated
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data } = await supabase
              .from('user_preferences')
              .select('theme')
              .eq('user_id', user.id)
              .single()
            if (data?.theme) {
              setTheme(data.theme)
              localStorage.setItem('phaseforge_theme', data.theme)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load theme preference:', err)
      }
      setIsMounted(true)
    }

    initializeTheme()
  }, [])

  // Update effective theme and DOM when theme changes
  useEffect(() => {
    const updateTheme = () => {
      let newEffectiveTheme: 'light' | 'dark' = 'light'

      if (theme === 'system') {
        // Check system preference
        if (typeof window !== 'undefined') {
          newEffectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
      } else {
        newEffectiveTheme = theme
      }

      setEffectiveTheme(newEffectiveTheme)

      // Update DOM class
      if (typeof window !== 'undefined') {
        if (newEffectiveTheme === 'dark') {
          document.documentElement.classList.add('dark')
          document.documentElement.style.colorScheme = 'dark'
        } else {
          document.documentElement.classList.remove('dark')
          document.documentElement.style.colorScheme = 'light'
        }
      }
    }

    updateTheme()

    // Listen for system theme changes
    if (theme === 'system' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', updateTheme)
      return () => mediaQuery.removeEventListener('change', updateTheme)
    }
  }, [theme])

  const toggleTheme = async (newTheme?: Theme) => {
    const themesToCycle: Theme[] = ['light', 'dark', 'system']
    const nextTheme = newTheme || themesToCycle[(themesToCycle.indexOf(theme) + 1) % themesToCycle.length]

    setTheme(nextTheme)
    localStorage.setItem('phaseforge_theme', nextTheme)

    // Persist to database if user is logged in
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('user_preferences')
          .update({ theme: nextTheme })
          .eq('user_id', user.id)
      }
    } catch (err) {
      console.warn('Failed to persist theme preference:', err)
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, toggleTheme, isMounted }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
