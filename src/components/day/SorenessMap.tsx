'use client'

import { DOMS_MUSCLES, type DomsMuscle } from '@/lib/hooks/useRecovery'
import { MUTED } from '@/lib/theme/palette'
import { SEVERITY_COLOR } from '@/components/day/severity'

/**
 * The 2D soreness map — two hand-authored silhouettes, one `<path>` per tracked
 * muscle, tinted by that muscle's severity.
 *
 * WHY NOT A LIBRARY
 * `react-body-highlighter` and friends ship their own muscle vocabulary (which
 * would have to be mapped onto DOMS_MUSCLES in both directions), weigh ~40 kB,
 * and are unmaintained. The whole asset here is a few hundred bytes of path
 * data with no runtime.
 *
 * WHY NOT `BodyHeatmap` (HelixViz.tsx)
 * Its `REGIONS` are six coarse blobs — one `Legs`, one `Arms`. Quads vs
 * Hamstrings vs Calves is precisely the distinction DOMS exists to make, so
 * reusing it would erase the data it is meant to show.
 *
 * ACCESSIBILITY
 * Every region is a real `<button>` wrapping its path with an `aria-label` and
 * `aria-pressed`, so the map is operable by keyboard and readable by a screen
 * reader. The text list in `DomsTracker` remains as the equivalent non-visual
 * path — the map is a better view of the same data, never the only one.
 */

/** The broad areas a tap opens. One popup lists every muscle in the group. */
export type SorenessGroup = 'torso' | 'back' | 'arms' | 'legs'

export const GROUP_MUSCLES: Record<SorenessGroup, readonly DomsMuscle[]> = {
  torso: ['Chest', 'Abs'],
  back: ['Back'],
  arms: ['Shoulders', 'Arms'],
  legs: ['Glutes', 'Quads', 'Hamstrings', 'Calves'],
}

export const GROUP_LABEL: Record<SorenessGroup, string> = {
  torso: 'Chest & Core',
  back: 'Back',
  arms: 'Shoulders & Arms',
  legs: 'Legs',
}

/** Which popup a muscle belongs to. Total: every DOMS muscle has exactly one. */
export function groupOf(muscle: DomsMuscle): SorenessGroup {
  for (const g of Object.keys(GROUP_MUSCLES) as SorenessGroup[]) {
    if (GROUP_MUSCLES[g].includes(muscle)) return g
  }
  // Unreachable while GROUP_MUSCLES covers DOMS_MUSCLES — asserted by a test.
  return 'torso'
}

export interface Region {
  muscle: DomsMuscle
  side: 'front' | 'back'
  /** Path data on the shared 120 × 260 viewBox. */
  d: string
}

/**
 * Silhouette geometry. Shared skeleton: head at cy 22, shoulders at y 48,
 * waist at y 130, knees at y 190, ankles at y 240 — so front and back line up
 * when the view flips.
 */
export const REGIONS: readonly Region[] = [
  // ── FRONT ──
  { muscle: 'Shoulders', side: 'front', d: 'M38,44 C28,45 21,52 20,64 L33,69 C34,58 39,53 45,51 Z' },
  { muscle: 'Shoulders', side: 'front', d: 'M82,44 C92,45 99,52 100,64 L87,69 C86,58 81,53 75,51 Z' },
  { muscle: 'Chest', side: 'front', d: 'M45,50 L75,50 C82,52 84,60 83,72 C76,80 66,83 60,83 C54,83 44,80 37,72 C36,60 38,52 45,50 Z' },
  { muscle: 'Abs', side: 'front', d: 'M42,86 L78,86 C79,102 77,118 72,132 L48,132 C43,118 41,102 42,86 Z' },
  { muscle: 'Arms', side: 'front', d: 'M22,68 C18,82 17,101 19,121 C20,133 23,141 27,147 L35,144 C31,134 29,121 30,107 C31,92 33,80 34,72 Z' },
  { muscle: 'Arms', side: 'front', d: 'M98,68 C102,82 103,101 101,121 C100,133 97,141 93,147 L85,144 C89,134 91,121 90,107 C89,92 87,80 86,72 Z' },
  { muscle: 'Quads', side: 'front', d: 'M43,133 C38,149 37,169 40,189 L53,189 C55,171 56,151 58,135 Z' },
  { muscle: 'Quads', side: 'front', d: 'M77,133 C82,149 83,169 80,189 L67,189 C65,171 64,151 62,135 Z' },
  { muscle: 'Calves', side: 'front', d: 'M41,193 C40,209 41,227 43,240 L53,240 C54,224 54,207 53,193 Z' },
  { muscle: 'Calves', side: 'front', d: 'M79,193 C80,209 79,227 77,240 L67,240 C66,224 66,207 67,193 Z' },

  // ── BACK ──
  { muscle: 'Shoulders', side: 'back', d: 'M38,44 C28,45 21,52 20,64 L33,69 C34,58 39,53 45,51 Z' },
  { muscle: 'Shoulders', side: 'back', d: 'M82,44 C92,45 99,52 100,64 L87,69 C86,58 81,53 75,51 Z' },
  { muscle: 'Back', side: 'back', d: 'M45,50 L75,50 C83,53 86,64 84,81 C80,97 72,105 60,107 C48,105 40,97 36,81 C34,64 37,53 45,50 Z' },
  { muscle: 'Arms', side: 'back', d: 'M22,68 C18,82 17,101 19,121 C20,133 23,141 27,147 L35,144 C31,134 29,121 30,107 C31,92 33,80 34,72 Z' },
  { muscle: 'Arms', side: 'back', d: 'M98,68 C102,82 103,101 101,121 C100,133 97,141 93,147 L85,144 C89,134 91,121 90,107 C89,92 87,80 86,72 Z' },
  { muscle: 'Glutes', side: 'back', d: 'M43,109 C37,117 36,131 41,141 C48,146 55,145 59,140 L59,109 Z' },
  { muscle: 'Glutes', side: 'back', d: 'M77,109 C83,117 84,131 79,141 C72,146 65,145 61,140 L61,109 Z' },
  { muscle: 'Hamstrings', side: 'back', d: 'M41,145 C38,161 38,177 41,190 L54,190 C55,175 56,159 58,145 Z' },
  { muscle: 'Hamstrings', side: 'back', d: 'M79,145 C82,161 82,177 79,190 L66,190 C65,175 64,159 62,145 Z' },
  { muscle: 'Calves', side: 'back', d: 'M42,194 C40,209 41,226 44,237 L54,237 C55,223 55,207 54,194 Z' },
  { muscle: 'Calves', side: 'back', d: 'M78,194 C80,209 79,226 76,237 L66,237 C65,223 65,207 66,194 Z' },
] as const

/** Every muscle drawn on a given view. Order follows DOMS_MUSCLES. */
export function musclesOnSide(side: 'front' | 'back'): DomsMuscle[] {
  const present = new Set(REGIONS.filter((r) => r.side === side).map((r) => r.muscle))
  return DOMS_MUSCLES.filter((m) => present.has(m))
}

export function SorenessMap({ side, doms, onPick, className = '' }: {
  side: 'front' | 'back'
  /** muscle → severity 0–3. Missing means unrated, drawn as the empty fill. */
  doms: Partial<Record<DomsMuscle, number>> | undefined
  /** Fired with the tapped region's group so the host can open its picker. */
  onPick: (group: SorenessGroup) => void
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 120 260"
      className={`w-full h-full ${className}`}
      role="group"
      aria-label={`Soreness map, ${side} view`}
    >
      {/* Head + neck — anatomy, not data. Never interactive. */}
      <g aria-hidden="true" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" strokeWidth="0.75">
        <circle cx="60" cy="22" r="14" />
        <path d="M53,35 L67,35 L67,45 L53,45 Z" />
        {/* Feet, so the figure doesn't end at the ankle. */}
        <path d="M43,240 L53,240 L54,251 L42,251 Z" />
        <path d="M77,240 L67,240 L66,251 L78,251 Z" />
      </g>

      {REGIONS.filter((r) => r.side === side).map((r, i) => {
        const severity = doms?.[r.muscle] ?? 0
        const c = SEVERITY_COLOR[severity] ?? MUTED
        return (
          <path
            key={`${r.muscle}-${i}`}
            d={r.d}
            role="button"
            tabIndex={0}
            aria-label={`${r.muscle} — ${severity > 0 ? `soreness ${severity} of 3` : 'not sore'}. Rate ${GROUP_LABEL[groupOf(r.muscle)]}.`}
            aria-pressed={severity > 0}
            onClick={() => onPick(groupOf(r.muscle))}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              onPick(groupOf(r.muscle))
            }}
            className="cursor-pointer outline-none focus-visible:stroke-[1.6]"
            style={{
              // Unrated regions read as the body, not as "level 0 soreness" —
              // MUTED at full strength would paint a healthy figure grey.
              fill: severity > 0 ? `${c}59` : 'rgba(255,255,255,0.05)',
              stroke: severity > 0 ? c : 'rgba(255,255,255,0.12)',
              strokeWidth: severity > 0 ? 1.1 : 0.75,
              transition: 'fill 220ms ease, stroke 220ms ease',
            }}
          />
        )
      })}
    </svg>
  )
}
