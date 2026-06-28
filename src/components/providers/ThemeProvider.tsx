'use client'

import { useEffect } from 'react'
import { useUserGoals } from '@/lib/hooks/useDashboard'

/**
 * Reads the user's context mode and toggles `data-theme="travel"` on <html> so
 * globals.css can repaint the accent palette to a tropical vibe (Thailand mode).
 */
export function ThemeProvider() {
  const { data: goals } = useUserGoals()
  useEffect(() => {
    const el = document.documentElement
    if (goals?.context_mode === 'travel') el.setAttribute('data-theme', 'travel')
    else el.removeAttribute('data-theme')
  }, [goals?.context_mode])
  return null
}
