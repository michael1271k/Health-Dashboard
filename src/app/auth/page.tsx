'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LogIn, Zap } from 'lucide-react'
import { HelixMark } from '@/components/HelixMark'

/**
 * Sign-in. NO app-lock: the app is not gated behind Face ID on launch. Instead
 * the form uses the standard iOS iCloud Keychain flow — `autocomplete`
 * username/current-password + a real <form> so iOS offers "Save Password?" on
 * first manual login and Face-ID-gated AutoFill on a fresh install.
 *
 * Quick Login: a personal-device fast path. It reads dev credentials from the
 * environment (`NEXT_PUBLIC_DEV_EMAIL` / `NEXT_PUBLIC_DEV_PASSWORD`) and only
 * renders when BOTH are set — so no credential is ever hardcoded in source and
 * the button never appears in a build that wasn't given them.
 */
const QUICK_EMAIL = process.env.NEXT_PUBLIC_DEV_EMAIL
const QUICK_PASSWORD = process.env.NEXT_PUBLIC_DEV_PASSWORD

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState(QUICK_EMAIL ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [quickLoading, setQuickLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<string | null>(null)

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const ok = await signIn(email, password)
    if (!ok) setLoading(false)
  }

  async function handleQuickLogin() {
    if (!QUICK_EMAIL || !QUICK_PASSWORD) return
    setQuickLoading(true)
    setError(null)
    const ok = await signIn(QUICK_EMAIL, QUICK_PASSWORD)
    if (!ok) setQuickLoading(false)
  }

  async function handleForgot() {
    setError(null)
    setResetMsg(null)
    const mail = email.trim()
    if (!mail) { setError('Enter your email above, then tap “Forgot password?”'); return }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    })
    if (resetError) { setError(resetError.message); return }
    setResetMsg('Check your email for a reset link.')
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
          {QUICK_EMAIL && QUICK_PASSWORD && (
            <>
              <button
                type="button"
                onClick={handleQuickLogin}
                disabled={quickLoading || loading}
                className="w-full min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                           text-white transition-transform active:scale-[0.98] disabled:opacity-60
                           shadow-[0_8px_28px_rgba(224,112,60,0.35)]"
                style={{ background: 'linear-gradient(135deg, #E0703C 0%, #B4522A 100%)' }}
              >
                <Zap className="w-4 h-4" aria-hidden="true" fill="currentColor" />
                {quickLoading ? 'Entering…' : 'Quick Login'}
              </button>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.08]" />
                <span className="text-[10px] uppercase tracking-widest text-muted/70">or sign in</span>
                <div className="h-px flex-1 bg-white/[0.08]" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Password
                </label>
                <button type="button" onClick={handleForgot}
                  className="text-[11px] font-medium text-muted hover:text-[#E0703C] transition-colors">
                  Forgot password?
                </button>
              </div>
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
              <p className="text-danger text-sm" role="alert">
                {error}
              </p>
            )}
            {resetMsg && (
              <p className="text-success text-sm" role="status">
                {resetMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || quickLoading}
              className="w-full min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                         border border-white/[0.14] bg-white/[0.05] text-text hover:bg-white/[0.08]
                         transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Standalone-PWA reassurance: this container keeps its own session. */}
          <p className="text-[11px] text-muted/80 text-center leading-relaxed">
            You stay signed in on this device — sign in once and HELIX remembers you here.
          </p>
        </div>
      </div>
    </main>
  )
}
