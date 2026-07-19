'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LogIn, ScanFace } from 'lucide-react'
import { HelixMark } from '@/components/HelixMark'
import {
  isBiometricAvailable, isBiometricEnabled, enableBiometricLogin, tryBiometricLogin,
} from '@/lib/native/biometric'

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Face ID: show the quick-unlock button when enabled; offer to enable it after
  // a fresh password login on a device that supports it.
  const [bioReady, setBioReady] = useState(false)
  const [bioEnabled, setBioEnabled] = useState(false)
  const [offerBio, setOfferBio] = useState(false)

  useEffect(() => {
    void isBiometricAvailable().then(setBioReady)
    setBioEnabled(isBiometricEnabled())
  }, [])

  function goHome() {
    router.push('/')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else if (bioReady && !isBiometricEnabled()) {
      // Offer Face ID before leaving the screen.
      setLoading(false)
      setOfferBio(true)
    } else {
      goHome()
    }
  }

  async function unlockWithFaceID() {
    setError(null)
    const ok = await tryBiometricLogin()
    if (ok) goHome()
    else setError('Face ID sign-in failed — use your password.')
  }

  async function acceptBio() {
    await enableBiometricLogin()
    goHome()
  }

  const inputClass =
    'w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-text text-sm ' +
    'placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/60 ' +
    'transition-[border-color] duration-200'

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="helix-card max-w-sm w-full space-y-6">
        <div className="flex items-center gap-2.5">
          <HelixMark className="w-6 h-6 text-primary" />
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-wide">HELIX</h1>
            <p className="text-xs text-muted leading-none">Engineer Your Ascent.</p>
          </div>
        </div>

        {offerBio ? (
          <div className="space-y-4 text-center">
            <ScanFace className="w-10 h-10 text-primary mx-auto" aria-hidden="true" />
            <div>
              <h2 className="font-heading font-bold text-lg text-text">Enable Face ID?</h2>
              <p className="text-sm text-muted mt-1">Skip the password next time — unlock HELIX with a glance.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={acceptBio} className="btn-primary w-full justify-center min-h-[48px]">
                <ScanFace className="w-4 h-4" aria-hidden="true" /> Enable Face ID
              </button>
              <button onClick={goHome} className="btn-glass w-full justify-center min-h-[48px]">
                Not now
              </button>
            </div>
          </div>
        ) : (
          <>
            {bioReady && bioEnabled && (
              <button onClick={unlockWithFaceID} className="btn-primary w-full justify-center min-h-[48px]">
                <ScanFace className="w-4 h-4" aria-hidden="true" /> Sign in with Face ID
              </button>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-text">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="username"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-text">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>

              {error && (
                <p className="text-danger text-sm" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center min-h-[44px]">
                <LogIn className="w-4 h-4" aria-hidden="true" />
                {loading ? 'Signing in…' : 'Sign in'}
              </button>

              {/* Standalone-PWA reassurance: this container keeps its own session. */}
              <p className="text-[11px] text-muted text-center leading-relaxed">
                You stay signed in on this device — sign in once and HELIX remembers you here.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
