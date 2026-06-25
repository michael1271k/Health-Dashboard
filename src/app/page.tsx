import { Activity } from 'lucide-react'

export default function HomePage() {
  return (
    <main className="min-h-screen bg-bg flex flex-col items-center justify-center p-6">
      <div className="vital-card max-w-sm w-full text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Activity className="w-8 h-8 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-4xl font-bold tracking-tight">
            VITAL
          </h1>
        </div>
        <p className="text-muted text-sm">
          Health & Fitness Intelligence Dashboard
        </p>
        <div className="flex gap-2 justify-center">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse-slow" />
          <div className="w-2 h-2 rounded-full bg-energy animate-pulse-slow" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 rounded-full bg-info animate-pulse-slow" style={{ animationDelay: '0.4s' }} />
        </div>
        <p className="vital-number text-primary text-2xl font-bold">
          Initializing...
        </p>
      </div>
    </main>
  )
}
