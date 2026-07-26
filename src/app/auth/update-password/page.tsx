'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { KeyRound, Check, ShieldAlert } from 'lucide-react'
import { HelixMark } from '@/components/HelixMark'

/**
 * Update Password — the destination for the Supabase recovery email.
 *
 * The recovery link lands here with `#access_token=…&type=recovery` in the URL.
 * `detectSessionInUrl` (set on the client) parses that hash and establishes a
 * short-lived recovery session, so `supabase.auth.updateUser({ password })` is
 * authorized. We surface an expired/invalid-link error if the hash carries one.
 *
 * NOTE: the app's deploy URL + `/auth/update-password` must be in Supabase →
 * Authentication → URL Configuration → Redirect URLs for the link to resolve.
 */
export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Surface an expired/used link (Supabase puts it in the URL hash), and confirm
  // a recovery session is present before we let the user submit.
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (hash.includes('error')) {
      const params = new URLSearchParams(hash.slice(1))
      setError(params.get('error_description')?.replace(/\+/g, ' ') ?? 'This recovery link is invalid or has expired.')
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true) })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setLoading(false); return }
    setDone(true)
    setTimeout(() => { router.push('/'); router.refresh() }, 1400)
  }

  const inputClass =
    'w-full rounded-xl border border-white/[0.10] bg-white/[0.03] px-4 py-3 text-text text-sm ' +
    'placeholder:text-muted/60 focus:outline-none focus:border-[#E0703C]/60 focus:ring-2 focus:ring-[#E0703C]/25 ' +
    'transition-[border-color,box-shadow] duration-200'

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-[#0C0D11]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[120vw] h-[60vh] rounded-full blur-[120px] opacity-[0.18]"
          style={{ background: 'radial-gradient(circle, #3D7ABC 0%, transparent 65%)' }} />
        <div className="absolute -bottom-1/3 left-1/2 -translate-x-1/2 w-[110vw] h-[55vh] rounded-full blur-[120px] opacity-[0.22]"
          style={{ background: 'radial-gradient(circle, #E0703C 0%, transparent 65%)' }} />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div aria-hidden className="absolute inset-0 blur-2xl opacity-60"
              style={{ background: 'radial-gradient(circle, rgba(224,112,60,0.5), transparent 70%)' }} />
            <HelixMark className="relative w-16 h-16" />
          </div>
          <h1 className="font-heading text-2xl font-black tracking-[0.08em] text-text">New Password</h1>
          <p className="text-xs text-muted mt-1.5 tracking-wide">Set a new password for your account.</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(62,158,122,0.15)', color: '#3E9E7A' }}>
                <Check className="w-6 h-6" aria-hidden="true" />
              </span>
              <p className="text-text font-semibold">Password updated</p>
              <p className="text-xs text-muted">Signing you in…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="text-xs font-semibold uppercase tracking-wide text-muted">New password</label>
                <input id="new-password" name="new-password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                  autoComplete="new-password" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="text-xs font-semibold uppercase tracking-wide text-muted">Confirm password</label>
                <input id="confirm-password" name="confirm-password" type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required
                  autoComplete="new-password" className={inputClass} />
              </div>

              {error && (
                <p className="text-danger text-sm flex items-start gap-1.5" role="alert">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> <span>{error}</span>
                </p>
              )}
              {!ready && !error && (
                <p className="text-[11px] text-muted/80">Open this page from your recovery email to continue.</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                           text-white transition-transform active:scale-[0.98] disabled:opacity-60
                           shadow-[0_8px_28px_rgba(224,112,60,0.35)]"
                style={{ background: 'linear-gradient(135deg, #E0703C 0%, #B4522A 100%)' }}>
                <KeyRound className="w-4 h-4" aria-hidden="true" />
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
