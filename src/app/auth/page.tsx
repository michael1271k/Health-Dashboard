'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Activity, LogIn, UserPlus } from 'lucide-react'

type Mode = 'signin' | 'signup'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'signin') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(authError.message)
      } else {
        router.push('/')
        router.refresh()
      }
    } else {
      const { error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) {
        setError(authError.message)
      } else {
        setSuccess('Account created — you can now sign in.')
        setMode('signin')
        setPassword('')
      }
    }

    setLoading(false)
  }

  const inputClass =
    'w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-text text-sm ' +
    'placeholder:text-muted-vital focus:outline-none focus:ring-2 focus:ring-primary/60 ' +
    'transition-[border-color] duration-200'

  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="vital-card max-w-sm w-full space-y-6">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-2xl font-bold">MERIDIAN</h1>
        </div>

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
              autoComplete="email"
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
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className={inputClass}
            />
          </div>

          {error && (
            <p className="text-danger text-sm" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="text-primary text-sm" role="status">
              {success}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {mode === 'signin'
              ? <><LogIn className="w-4 h-4" aria-hidden="true" />{loading ? 'Signing in…' : 'Sign in'}</>
              : <><UserPlus className="w-4 h-4" aria-hidden="true" />{loading ? 'Creating account…' : 'Create account'}</>
            }
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setSuccess(null) }}
          className="btn-ghost w-full justify-center text-sm"
        >
          {mode === 'signin' ? 'No account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  )
}
