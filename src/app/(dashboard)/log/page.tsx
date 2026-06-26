'use client'

import { useState } from 'react'
import { ActiveSession } from '@/components/logger/ActiveSession'
import { useRecentSessions } from '@/lib/hooks/useLogger'
import { PPL_SPLITS } from '@/lib/types/workout'
import type { SplitDay } from '@/lib/types/workout'
import { Check } from 'lucide-react'

export default function LogPage() {
  const [showHistory, setShowHistory] = useState(false)
  const { data: recentSessions, isLoading: historyLoading } = useRecentSessions()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-text">Workout Log</h1>
          <p className="text-muted-vital text-sm mt-0.5">PPL · Hebrew notes · Auto PR detection</p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((p) => !p)}
          className="btn-ghost text-sm"
          aria-pressed={showHistory}
        >
          {showHistory ? 'New Session' : 'History'}
        </button>
      </div>

      {showHistory ? (
        <div className="space-y-3">
          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-surface rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !recentSessions?.length ? (
            <div className="vital-card text-center py-8 text-muted-vital text-sm">
              No sessions yet. Log your first workout!
            </div>
          ) : (
            recentSessions.map((s) => {
              const split = PPL_SPLITS[s.split_day as SplitDay]
              return (
                <div key={s.id} className="vital-card flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-bold"
                        style={{ color: split?.color }}
                      >
                        {split?.label ?? s.split_day}
                      </span>
                      <span className="text-xs text-muted-vital">
                        {new Date(s.started_at).toLocaleDateString('en-IL', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                      </span>
                    </div>
                    {s.notes && (
                      <p className="text-xs text-muted-vital mt-0.5 line-clamp-1" dir="auto">
                        {s.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {s.total_volume_kg && (
                      <div className="vital-number text-sm font-semibold text-text">
                        {Math.round(s.total_volume_kg)}
                        <span className="text-xs text-muted-vital ml-0.5">kg</span>
                      </div>
                    )}
                    {s.notion_page_id && (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <Check className="w-3 h-3" aria-hidden="true" />
                        Logged to Notion
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
        <ActiveSession />
      )}
    </div>
  )
}
