'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LogIn, Fingerprint } from 'lucide-react'
import { HelixMark } from '@/components/HelixMark'

/**
 * Sign-in. Single-user app: the primary path is a one-tap "Continue as Michael"
 * button that signs in with baked-in credentials (NEXT_PUBLIC_BYPASS_*), so there
 * is no password to type on a fresh install. Supabase persists the session in
 * localStorage (+ native Preferences mirror), so the button is only needed once
 * per install — restarts stay signed in.
 *
 * There is NO unauthenticated server route that mints a session; this is a normal
 * Supabase-validated password login, just pre-filled. The manual email/password
 * form is kept (collapsed) as a fallback + to preserve iOS Keychain AutoFill.
 *
 * NOTE: the bypass password ships in the client bundle (NEXT_PUBLIC_*), so it is
 * readable by anyone with the deploy URL — treat the URL as sensitive and use a
 * strong, unique password.
 */
const BYPASS_EMAIL = process.env.NEXT_PUBLIC_BYPASS_EMAIL ?? ''
const BYPASS_PASSWORD = process.env.NEXT_PUBLIC_BYPASS_PASSWORD ?? ''
const HAS_BYPASS = Boolean(BYPASS_EMAIL && BYPASS_PASSWORD)

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [manual, setManual] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function goHome() {
    router.push('/')
    router.refresh()
  }

  async function signIn(mail: string, pass: string) {
    const { error: authError } = await supabase.auth.signInWithPassword({ email: mail, password: pass })
    if (authError) {
      setError(authError.message)
      return false
    }
    goHome()
    return true
  }

  async function handleContinue() {
    // No baked credentials in this build → fall back to the manual form.
    if (!HAS_BYPASS) {
      setManual(true)
      setError(null)
      requestAnimationFrame(() => document.getElementById('email')?.focus())
      return
    }
    setLoading(true)
    setError(null)
    const ok = await signIn(BYPASS_EMAIL, BYPASS_PASSWORD)
    if (!ok) setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const ok = await signIn(email, password)
    if (!ok) setLoading(false)
  }

  const inputClass =
    'w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-text text-sm ' +
    'placeholder:text-muted/60 focus:outline-none focus:border-[#E0703C]/60 focus:ring-2 focus:ring-[#E0703C]/25 ' +
    'transition-[border-color,box-shadow] duration-200'

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-[#0C0D11]">
      {/* Ambient jewel glow — ember from below, sapphire from above. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] rounded-full blur-[120px] opacity-[0.18]"
          style={{ background: 'radial-gradient(circle, #3D7ABC 0%, transparent 65%)' }} />
        <div className="absolute -bottom-1/3 left-1/2 -translate-x-1/2 w-[110vw] h-[55vh] rounded-full blur-[120px] opacity-[0.22]"
          style={{ background: 'radial-gradient(circle, #E0703C 0%, transparent 65%)' }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand lockup */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div aria-hidden className="absolute inset-0 blur-2xl opacity-60"
              style={{ background: 'radial-gradient(circle, rgba(224,112,60,0.5), transparent 70%)' }} />
            <HelixMark className="relative w-16 h-16" />
          </div>
          <h1 className="font-heading text-4xl font-black tracking-[0.12em] text-text">HELIX</h1>
          <p className="text-xs text-muted mt-1.5 tracking-wide">Engineer Your Ascent.</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] space-y-5">
          {/* Primary: one-tap sign-in. */}
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className="w-full min-h-[52px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                       text-white transition-transform active:scale-[0.98] disabled:opacity-60
                       shadow-[0_10px_30px_rgba(224,112,60,0.35)]"
            style={{ background: 'linear-gradient(135deg, #E0703C 0%, #C8542A 100%)' }}
          >
            <Fingerprint className="w-4 h-4" aria-hidden="true" />
            {loading ? 'Signing in…' : 'Continue as Michael'}
          </button>

          {error && !manual && (
            <p className="text-danger text-sm text-center" role="alert">{error}</p>
          )}

          {/* Manual fallback — collapsed by default; preserves iOS Keychain AutoFill. */}
          {!manual ? (
            <button type="button" onClick={() => setManual(true)}
              className="w-full text-[11px] font-medium text-muted hover:text-[#E0703C] transition-colors">
              Sign in manually
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
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
                <p className="text-danger text-sm" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                           border border-white/[0.14] bg-white/[0.05] text-text hover:bg-white/[0.08]
                           transition-colors active:scale-[0.98] disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {/* Standalone-PWA reassurance: this container keeps its own session. */}
          <p className="text-[11px] text-muted/80 text-center leading-relaxed">
            You stay signed in on this device — one tap and HELIX remembers you here.
          </p>
        </div>
      </div>
    </main>
  )
}
