'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Loader2, TriangleAlert } from 'lucide-react'
import { LaunchSurface } from '@/components/launch/LaunchSurface'

/**
 * Delete your account — the web half of App Store guideline 5.1.1(v).
 *
 * ── WHY A PAGE AND NOT ONLY A SETTINGS ROW ──────────────────────────────────
 * The native Settings row is what the guideline strictly requires. This page is
 * what makes the requirement survive contact with reality: an account can be
 * created on the web, and a reviewer, or a person whose phone is gone, has to be
 * able to close it without installing anything. It is also the URL the support
 * page can point at, which is what the App Store listing's "account deletion"
 * link field wants.
 *
 * ── SIGN IN FIRST, ALWAYS ───────────────────────────────────────────────────
 * The RPC keys entirely off `auth.uid()`, so an anonymous caller deletes
 * nothing — but a page that let you press the button while signed out would
 * report a confusing failure instead of asking the obvious question. A signed-out
 * visitor is sent to `/auth` and comes back here.
 *
 * ── AND WHY THE SIGN-OUT IS NOT OPTIONAL ────────────────────────────────────
 * `delete_my_account()` removes the `auth.users` row, but the access token
 * already in this tab stays cryptographically valid until it expires. A client
 * that kept it would go on making authorised requests as a user that no longer
 * exists. The sign-out below is what ends that, and it runs before the redirect
 * so the next page load cannot read a stale session out of localStorage.
 */
export default function DeleteAccountPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [confirm, setConfirm] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setEmail(data.user?.email ?? null)
      setChecking(false)
    })
    return () => { cancelled = true }
  }, [])

  /* Typing the word is the whole safeguard. A checkbox or a second button is
     something a person can click twice by reflex; a word has to be read. */
  const armed = confirm.trim().toUpperCase() === 'DELETE' && !working

  async function handleDelete() {
    if (!armed) return
    setWorking(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('delete_my_account')
    if (rpcError) {
      // Deliberately still signed in: the account exists, and a user with no
      // session and no data on a still-live account has no way to retry.
      setError(rpcError.message)
      setWorking(false)
      return
    }

    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  if (checking) {
    return (
      <LaunchSurface>
        <div className="flex items-center justify-center gap-2 text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Checking your session…
        </div>
      </LaunchSurface>
    )
  }

  if (!email) {
    return (
      <LaunchSurface>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 space-y-3 text-center">
          <h1 className="text-text font-bold">Sign in to delete your account</h1>
          <p className="text-muted text-sm leading-relaxed">
            We can only delete the account you are signed in to.
          </p>
          <button
            type="button"
            onClick={() => router.push('/auth')}
            className="text-sm underline text-muted hover:text-text"
          >
            Go to sign in
          </button>
        </div>
      </LaunchSurface>
    )
  }

  return (
    <LaunchSurface>
      <div className="rounded-2xl border border-danger/30 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] space-y-4">
        <div className="flex items-center gap-2">
          <TriangleAlert className="w-5 h-5 text-danger" aria-hidden="true" />
          <h1 className="text-text font-bold">Delete your Onyx account</h1>
        </div>

        <p className="text-muted text-sm leading-relaxed">
          This permanently deletes <span className="text-text">{email}</span> and everything
          in it — every workout, set, night, meal, weigh-in and reading — from Onyx&apos;s
          servers and from every device signed in to it. It cannot be undone, and there is
          no backup we can restore from.
        </p>

        <label className="block space-y-2">
          <span className="text-muted text-sm">
            Type <span className="text-text font-mono">DELETE</span> to confirm.
          </span>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Type DELETE to confirm"
            /* No text-size utility — `globals.css` sets the unlayered 16px floor
               that stops iOS zooming the page on focus. See no-input-zoom.test.ts. */
            className="w-full min-h-[52px] rounded-xl px-4 text-text placeholder:text-muted/70
                       border border-white/[0.08] bg-white/[0.03]
                       focus:outline-none focus:border-danger/40 focus:bg-white/[0.05]"
          />
        </label>

        <button
          type="button"
          onClick={handleDelete}
          disabled={!armed}
          className="w-full min-h-[52px] rounded-xl font-bold text-sm flex items-center justify-center gap-2
                     text-white bg-danger transition-transform active:scale-[0.98]
                     disabled:opacity-40 disabled:active:scale-100"
        >
          {working && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {working ? 'Deleting…' : 'Delete my account'}
        </button>

        {error && (
          <p className="text-danger text-sm text-center leading-relaxed" role="alert">
            Could not delete the account: {error}. Your account and data are untouched.
          </p>
        )}

        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full text-sm text-muted hover:text-text underline underline-offset-4"
        >
          Never mind, take me back
        </button>
      </div>
    </LaunchSurface>
  )
}
