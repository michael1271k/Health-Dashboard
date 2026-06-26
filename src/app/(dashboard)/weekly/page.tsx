'use client'

import { useState } from 'react'

export default function WeeklyPage() {
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generateReport() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/weekly-report', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`)
      }
      const data = await res.json() as { contentMd?: string; reportId?: string }
      setReport(data.contentMd ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">Weekly Summaries</h1>
          <p className="text-muted-vital text-sm mt-0.5">
            AI-powered weight management &amp; performance report
          </p>
        </div>
        <button
          onClick={generateReport}
          disabled={generating}
          className="btn-primary"
        >
          {generating ? 'Generating…' : 'Generate this week\'s report'}
        </button>
      </div>

      {error && (
        <div className="vital-card border-danger/40">
          <p className="text-danger text-sm">{error}</p>
        </div>
      )}

      {report && (
        <article className="vital-card prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-text leading-relaxed">
          {report}
        </article>
      )}

      {!report && !generating && !error && (
        <div className="vital-card text-center py-12">
          <p className="text-muted-vital text-sm">
            Click &quot;Generate this week&apos;s report&quot; to create an AI analysis of the last 7 days.
          </p>
        </div>
      )}
    </div>
  )
}
