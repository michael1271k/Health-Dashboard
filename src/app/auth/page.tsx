'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Fingerprint } from 'lucide-react'
import { LaunchSurface } from '@/components/launch/LaunchSurface'
import { EMBER } from '@/lib/theme/palette'

/**
 * Sign-in. Single-user app: ONE button. There is no email/password form and no
 * password-recovery flow — "Continue as Michael" signs in with the credentials
 * baked into the build and Supabase persists the session in localStorage (+ the
 * native Preferences mirror), so it is only ever needed once per install.
 *
 * CREDENTIAL SOURCE — this was the "invalid login credentials" bug. `.env.local`
 * and `.env.example` both document NEXT_PUBLIC_DEV_EMAIL / NEXT_PUBLIC_DEV_PASSWORD,
 * but this page used to read NEXT_PUBLIC_BYPASS_* — a name that exists nowhere in
 * the env files. Locally that resolved to '' (button fell through to the manual
 * form); on Netlify it picked up a stale BYPASS_* pair left over from before the
 * Supabase password was rotated, hence the 400. Both names are read now, DEV_*
 * first, so whichever pair is set in the environment is the one used.
 *
 * NOTE: the password ships in the client bundle (NEXT_PUBLIC_*), so it is readable
 * by anyone with the deploy URL — treat the URL as sensitive.
 *
 * Both literals must be written out in full: Next.js only inlines
 * `process.env.NEXT_PUBLIC_X` as a static member expression, never a computed one.
 */
const AUTO_EMAIL =
  process.env.NEXT_PUBLIC_DEV_EMAIL || process.env.NEXT_PUBLIC_BYPASS_EMAIL || ''
const AUTO_PASSWORD =
  process.env.NEXT_PUBLIC_DEV_PASSWORD || process.env.NEXT_PUBLIC_BYPASS_PASSWORD || ''
const HAS_AUTO = Boolean(AUTO_EMAIL && AUTO_PASSWORD)

export default function AuthPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleContinue() {
    if (!HAS_AUTO) {
      setError('No credentials in this build — set NEXT_PUBLIC_DEV_EMAIL and NEXT_PUBLIC_DEV_PASSWORD, then redeploy.')
      return
    }
    setLoading(true)
    setError(null)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: AUTO_EMAIL,
      password: AUTO_PASSWORD,
    })
    if (authError) {
      // The one failure that is always a config problem, not a code one: the
      // Supabase password was rotated but the env var still holds the old value.
      setError(/invalid login credentials/i.test(authError.message)
        ? 'Supabase rejected the baked-in password — update NEXT_PUBLIC_DEV_PASSWORD to the current one and redeploy.'
        : authError.message)
      setLoading(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <LaunchSurface>
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] space-y-5">
        <button
          type="button"
          onClick={handleContinue}
          disabled={loading}
          className="w-full min-h-[52px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                     text-white transition-transform active:scale-[0.98] disabled:opacity-60
                     shadow-[0_10px_30px_rgba(224,112,60,0.35)]"
          style={{ background: `linear-gradient(135deg, ${EMBER} 0%, #C8542A 100%)` }}
        >
          <Fingerprint className="w-4 h-4" aria-hidden="true" />
          {loading ? 'Signing in…' : 'Continue as Michael'}
        </button>

        {error && (
          <p className="text-danger text-sm text-center leading-relaxed" role="alert">{error}</p>
        )}

        {/* Standalone-PWA reassurance: this container keeps its own session. */}
        <p className="text-[11px] text-muted/80 text-center leading-relaxed">
          You stay signed in on this device — one tap and HELIX remembers you here.
        </p>
      </div>
    </LaunchSurface>
  )
}
