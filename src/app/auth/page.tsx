'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Fingerprint, Loader2 } from 'lucide-react'
import { LaunchSurface } from '@/components/launch/LaunchSurface'
import { EMBER } from '@/lib/theme/palette'

/**
 * Sign-in. Single-user app, so this is still a one-screen, one-submit flow —
 * but the credentials now come from the person, not from the build.
 *
 * ── WHY THE BAKED-IN PASSWORD HAD TO GO ──────────────────────────────────────
 * This page used to read NEXT_PUBLIC_DEV_EMAIL / NEXT_PUBLIC_DEV_PASSWORD and
 * sign in with them behind a single "Continue as Michael" button. `NEXT_PUBLIC_*`
 * is INLINED INTO THE CLIENT BUNDLE at build time — so the account password was
 * served, in plain text, to anyone who opened the deploy URL and read the JS.
 * The browser client uses the anon key and leans on RLS for isolation, which
 * means those two strings were not a convenience, they were the account.
 *
 * A form is not a downgrade in UX here. The app already ships
 * `/.well-known/apple-app-site-association` with `webcredentials`, and the two
 * fields below carry the autocomplete tokens iOS looks for, so Password AutoFill
 * offers the saved credential as a single tap — the same one-tap sign-in, with
 * nothing secret in the bundle. Supabase then persists the session (localStorage
 * plus the native Preferences mirror), so this screen is only ever seen once per
 * install anyway.
 *
 * Nothing here reads `process.env`. That is the point; keep it that way.
 *
 * ── AND WHY IT IS NO LONGER SINGLE-USER ─────────────────────────────────────
 * Sign-up is open as of wave E6, so this screen is now two modes on one form:
 * the fields are identical and only the verb changes. A separate `/signup`
 * route would have duplicated the input styling, the 16px zoom floor and the
 * autocomplete tokens, and given the browser two pages to remember a credential
 * against.
 *
 * The `autoComplete` token is the one thing that genuinely differs, and it
 * matters: `current-password` asks the browser to FILL a saved credential,
 * `new-password` asks it to GENERATE and save one. Getting that backwards is
 * how a sign-up form ends up pre-filled with the last account's password.
 *
 * Email confirmation is ON, so a successful sign-up does NOT return a session.
 * The success state says to check the inbox and stays there; redirecting to `/`
 * would land on a signed-out shell that bounces straight back here, which reads
 * as the sign-up having failed.
 */
export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  /** Supabase's own floor is 6; 8 is stated up front rather than after a trip. */
  const MIN_PASSWORD = 8

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email || !password || loading) return

    setLoading(true)
    setError(null)

    if (mode === 'up') {
      if (password.length < MIN_PASSWORD) {
        setError(`Choose a password of at least ${MIN_PASSWORD} characters.`)
        setLoading(false)
        return
      }
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) {
        setError(/already registered/i.test(signUpError.message)
          ? 'That email already has an account. Sign in instead.'
          : signUpError.message)
        setLoading(false)
        return
      }
      // No session means the address needs confirming — the normal path.
      if (!data.session) {
        setSent(true)
        setLoading(false)
        return
      }
      router.push('/')
      router.refresh()
      return
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(/invalid login credentials/i.test(authError.message)
        ? 'That email and password did not match.'
        : authError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  const canSubmit = Boolean(email && password) && !loading

  if (sent) {
    return (
      <LaunchSurface>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] space-y-3 text-center">
          <h1 className="text-text font-bold">Check your inbox</h1>
          <p className="text-muted text-sm leading-relaxed">
            We sent a confirmation link to <span className="text-text">{email}</span>. Open it, then sign in.
          </p>
          <button
            type="button"
            onClick={() => { setSent(false); setMode('in'); setPassword('') }}
            className="text-sm underline text-muted hover:text-text"
          >
            Back to sign in
          </button>
        </div>
      </LaunchSurface>
    )
  }

  return (
    <LaunchSurface>
      {/* A real <form> with a submit button: this is what lets iOS offer to SAVE
          the credential after a successful sign-in, and to AutoFill it next
          time. A div with an onClick gets neither. */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] space-y-4"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              required
              placeholder="Email"
              aria-label="Email"
              /* No text-size utility: `globals.css` sets an unlayered 16px floor
                 on form controls, and anything under it makes iOS zoom the page
                 on focus and never zoom back. See src/tests/no-input-zoom.test.ts. */
              className="w-full min-h-[52px] rounded-xl px-4 text-text placeholder:text-muted/70
                         border border-white/[0.08] bg-white/[0.03]
                         focus:outline-none focus:border-white/20 focus:bg-white/[0.05]"
            />
          </label>

          <label className="block">
            <span className="sr-only">Password</span>
            <input
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'up' ? MIN_PASSWORD : undefined}
              placeholder={mode === 'up' ? `Password (${MIN_PASSWORD}+ characters)` : 'Password'}
              aria-label="Password"
              className="w-full min-h-[52px] rounded-xl px-4 text-text placeholder:text-muted/70
                         border border-white/[0.08] bg-white/[0.03]
                         focus:outline-none focus:border-white/20 focus:bg-white/[0.05]"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full min-h-[52px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                     text-white transition-transform active:scale-[0.98] disabled:opacity-60
                     shadow-[0_10px_30px_rgba(224,112,60,0.35)]"
          style={{ background: `linear-gradient(135deg, ${EMBER} 0%, #C8542A 100%)` }}
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <Fingerprint className="w-4 h-4" aria-hidden="true" />}
          {loading
            ? (mode === 'up' ? 'Creating…' : 'Signing in…')
            : (mode === 'up' ? 'Create account' : 'Sign in')}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null) }}
          className="w-full text-sm text-muted hover:text-text underline underline-offset-4"
        >
          {mode === 'in' ? 'Create an account' : 'I already have an account'}
        </button>

        {error && (
          <p className="text-danger text-sm text-center leading-relaxed" role="alert">{error}</p>
        )}

        {/* Standalone-PWA reassurance: this container keeps its own session. */}
        <p className="text-[11px] text-muted/80 text-center leading-relaxed">
          {mode === 'up'
            ? "We'll email you a link to confirm the address before you can sign in."
            : 'You stay signed in on this device — sign in once and HELIX remembers you here.'}
        </p>
      </form>
    </LaunchSurface>
  )
}
