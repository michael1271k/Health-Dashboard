'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

/** True inside the native iOS/Android shell (false on the web). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export type PlatformKind = 'native' | 'web'

/**
 * Platform + input awareness for layout branching. `kind` distinguishes the
 * native shell from the desktop web build; `coarse` is true for touch input
 * (phones/tablets) so pointer-tuned affordances can adapt. SSR-safe defaults.
 */
export function usePlatform(): { kind: PlatformKind; coarse: boolean } {
  const [state, setState] = useState<{ kind: PlatformKind; coarse: boolean }>({ kind: 'web', coarse: false })
  useEffect(() => {
    setState({
      kind: Capacitor.isNativePlatform() ? 'native' : 'web',
      coarse: typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    })
  }, [])
  return state
}
