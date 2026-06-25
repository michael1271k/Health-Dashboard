'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Activity, Mail } from 'lucide-react'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="vital-card max-w-sm w-full space-y-6">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-2xl font-bold">VITAL</h1>
        </div>

        {sent ? (
          <div className="space-y-2">
            <p className="text-text font-medium">Check your email</p>
            <p className="text-muted-vital text-sm">
              We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-text">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-text text-sm
                           placeholder:text-muted-vital
                           focus:outline-none focus:ring-2 focus:ring-primary/60
                           transition-[border-color] duration-200"
              />
            </div>

            {error && (
              <p className="text-danger text-sm" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
              <Mail className="w-4 h-4" aria-hidden="true" />
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
