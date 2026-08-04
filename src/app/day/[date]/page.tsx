'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Dumbbell, Moon, Flame, ChevronRight, ChevronLeft } from 'lucide-react'
import { CompletenessArc } from '@/components/day/CompletenessArc'
import { BodyPanel } from '@/components/day/BodyPanel'
import { SleepDebtGauge } from '@/components/day/SleepDebtGauge'
import { SwapDayControl, RestTodayButton } from '@/components/day/SwapDayControl'
import { RestSuggestion } from '@/components/day/RestSuggestion'
import { DomsTracker } from '@/components/day/RecoveryTrackers'
import { CardioLogger } from '@/components/day/CardioLogger'
import { WaterHelix } from '@/components/day/WaterHelix'
import { useDayVault, dayCompleteness, type DayVaultData } from '@/lib/hooks/useDayVault'
import type { SnapPagerHandle } from '@/components/ui/SnapPager'
import { useUserGoals, useDaySleep } from '@/lib/hooks/useDashboard'
import { SleepStages } from '@/components/dashboard/SleepStages'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { useDoubleTap } from '@/lib/utils/doubleTap'
import { MacroOverrideSheet } from '@/components/nutrition/MacroOverrideSheet'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { ERA_META, eraForDate, scheduleDayFor, activeProgram } from '@/lib/programs'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { logicalTodayISO } from '@/lib/utils/day'
import { Zone, ZoneRow, StatStrip } from '@/components/ui/Zone'
import { SnapPager } from '@/components/ui/SnapPager'
import { EMBER, EMBER_DEEP, SAPPHIRE, STEEL, GOLD, OXIDE, EMERALD, MUTED } from '@/lib/theme/palette'

// Local aliases over the real palette. These were six hardcoded hexes whose
// NAMES disagreed with their values — `TEAL` held ember orange, `EMBER` held
// gold — so a colour changed in palette.ts never reached this page.
const VIOLET = EMBER_DEEP
const ICE = SAPPHIRE
const TEAL = EMBER
const CYAN = STEEL
const AMBER = GOLD
const ROSE = OXIDE

function scoreColor(score: number | null | undefined): string {
  if (score == null) return MUTED
  if (score >= 80) return TEAL
  if (score >= 60) return CYAN
  if (score >= 40) return AMBER
  return ROSE
}

/**
 * A macro ring (adherence = intake / goal-ish hint).
 *
 * 88px in a `pt-4 pb-1` block used to cost ~200px of page for three two-digit
 * numbers. At 56px the ring is still the dominant thing in its row and the row
 * is a third of the height.
 */
function MicroRing({ value, goalHint, color, label, size = 56 }: {
  value: number | null | undefined; goalHint: number; color: string; label: string; size?: number
}) {
  const stroke = Math.max(5, Math.round(size / 11))
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = value != null ? Math.min(1, value / goalHint) : 0
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size, filter: `drop-shadow(0 0 8px ${color}40)` }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)' }} />}
        </svg>
        <span className="absolute inset-0 flex items-center justify-center helix-num text-fluid-sm font-bold text-text">
          {value != null ? Math.round(value) : '—'}
        </span>
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color }}>{label}</span>
    </div>
  )
}

/** Hevy-style colored metadata chip with an emoji glyph. */
function MetaChip({ emoji, value, label, color }: { emoji: string; value: string; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 border" style={{ borderColor: `${color}40`, background: `${color}14` }}>
      <span aria-hidden="true">{emoji}</span>
      <span className="helix-num font-bold text-fluid-sm tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-muted">{label}</span>
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-heading text-fluid-base font-bold text-text px-1 pt-2">{children}</h2>
}

/** Program-day label from day_key (→ "Upper B", robust on swaps), else split. */
function sessionLabel(dayKey: string | null | undefined, split: string): string {
  const program = activeProgram()
  return (dayKey && program.days.find((d) => d.key === dayKey)?.label) ?? (split[0]?.toUpperCase() + split.slice(1))
}

/**
 * Unified per-session block: header + Hevy-style metadata. Tapping anywhere on
 * the block navigates straight to the full session deep-dive — no intermediate
 * expand step.
 */
function SessionBlock({ session: s, unit }: {
  session: DayVaultData['sessions'][number]
  unit: string
}) {
  const router = useRouter()
  const name = sessionLabel(s.dayKey, s.split)
  return (
    <button type="button"
      onClick={() => router.push(`/session/${s.id}`)}
      className="helix-card holo-sheen w-full text-left space-y-3 active:opacity-80"
      style={{ borderColor: `${CYAN}30`, boxShadow: `0 0 24px ${CYAN}18` }}
      aria-label={`Open full analysis for ${name}`}>
      <div className="w-full flex items-center gap-2">
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${CYAN}1a`, color: CYAN }}>
          <Dumbbell className="w-4 h-4" aria-hidden="true" />
        </span>
        <h3 className="font-heading font-bold text-fluid-base text-text flex-1 min-w-0 truncate">{name}</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0 flex items-center gap-0.5" style={{ color: CYAN }}>
          Inspect <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      </div>
      {/* Hevy-style metadata */}
      <div className="flex flex-wrap gap-2">
        <MetaChip emoji="🏋️" value={fmtVolume(displayWeight(s.volumeKg))} label={unit} color={TEAL} />
        <MetaChip emoji="🔁" value={`${s.setCount ?? '—'}`} label="sets" color={CYAN} />
        <MetaChip emoji="⏱️" value={s.durationMin != null ? `${s.durationMin}` : '—'} label="min" color={VIOLET} />
        <MetaChip emoji="❤️" value={s.avgBpm != null ? `${s.avgBpm}` : '—'} label="bpm" color={ROSE} />
        <MetaChip emoji="🔥" value={s.calories != null ? `${s.calories}` : '—'} label="kcal" color={EMBER} />
      </div>
    </button>
  )
}

/**
 * The Daily Nexus — one logical day:
 *   1 · Vitals & Nutrition   readiness, fuel, sleep/recovery, vitals, scale
 *   2 · Session Debrief      unified workout + progression (collapsible)
 */
export default function DailyNexusPage() {
  const { date: raw } = useParams<{ date: string }>()
  const router = useRouter()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw ?? '') ? raw : ''
  const { data, isLoading } = useDayVault(date)
  const { data: goals } = useUserGoals()
  const { data: daySleep } = useDaySleep(date)
  const [fuelEdit, setFuelEdit] = useState(false)
  const tapFuel = useDoubleTap(() => setFuelEdit(true))
  const pager = useRef<SnapPagerHandle>(null)

  // Deep-link from the dashboard Body card (double-tap → …?section=inbody).
  // The InBody entry now lives INSIDE the pager's Body page, so the link swipes
  // the pager there, scrolls it into view, and BodyPanel opens the editor.
  const searchParams = useSearchParams()
  const focusInbody = searchParams.get('section') === 'inbody'
  const [inbodyHandled, setInbodyHandled] = useState(false)
  const pagerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusInbody || inbodyHandled) return
    const t = setTimeout(() => {
      pager.current?.goTo('body')
      pagerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    return () => clearTimeout(t)
  }, [focusInbody, inbodyHandled])

  if (!date) return <p className="text-muted p-6">Invalid date.</p>

  const era = eraForDate(date)
  const eraMeta = ERA_META[era]
  const schedule = scheduleDayFor(date) // swap-aware
  const sessions = data?.sessions ?? []
  const trained = sessions.length > 0
  const restDay = !trained && schedule === 'rest'
  const { parts } = dayCompleteness(data)
  const unit = weightUnit()
  const log = data?.log
  const n = data?.nutrition
  const score = data?.score?.score ?? null
  const battery = data?.score?.battery_pct ?? null

  const pretty = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const shiftDate = (d: string, delta: number) => {
    const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + delta); return x.toISOString().slice(0, 10)
  }
  const prevDate = shiftDate(date, -1)
  const nextDate = shiftDate(date, +1)
  const nextIsFuture = nextDate > logicalTodayISO() // no navigating past today

  return (
    <div className="space-y-3">
      {/* ── Back + title + day nav ── */}
      <header className="flex items-center gap-2">
        <button onClick={() => router.back()} className="btn-glass shrink-0 min-h-[44px]" aria-label="Back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-fluid-base font-bold text-text truncate">Daily Nexus</h1>
          <span className="text-fluid-xs text-muted">{pretty}</span>
        </div>
        {/* Previous / Next day — discrete native-feeling chevrons */}
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => router.push(`/day/${prevDate}`)}
            className="btn-glass min-h-[44px] min-w-[40px] justify-center" aria-label="Previous day">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => router.push(`/day/${nextDate}`)} disabled={nextIsFuture}
            className="btn-glass min-h-[44px] min-w-[40px] justify-center disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next day">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
          style={{ color: eraMeta.color, background: `${eraMeta.color}1a`, border: `1px solid ${eraMeta.color}40` }}>
          {eraMeta.short}
        </span>
      </header>

      {/* ══ SECTION 1 · Vitals & Nutrition ══
          Three zones and a pager, in place of seven stacked glass cards. Every
          widget survives; what was removed is ~400px of repeated padding and
          ~280px of per-card headings. See components/ui/Zone.tsx. */}

      {/* ── TODAY · readiness, battery, what's scheduled ── */}
      <Zone label="Today" accent={scoreColor(score)}>
        <ZoneRow divide={false} className="flex items-center gap-3">
          <div className="relative shrink-0 flex items-center justify-center" style={{ width: 52, height: 52 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90" aria-hidden="true">
              <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4" />
              {score != null && <circle cx="26" cy="26" r="22" fill="none" stroke={scoreColor(score)} strokeWidth="4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 22} strokeDashoffset={2 * Math.PI * 22 * (1 - score / 100)}
                style={{ filter: `drop-shadow(0 0 5px ${scoreColor(score)}88)` }} />}
            </svg>
            <span className="absolute helix-num text-fluid-sm font-bold" style={{ color: scoreColor(score) }}>{score ?? '—'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-muted truncate">{schedule === 'rest' ? 'Zone-2 / Rest' : schedule.label}</span>
              {n?.phase && <span className="text-[10px] font-bold uppercase" style={{ color: phaseDisplay(n.phase, date).color }}>{phaseDisplay(n.phase, date).label}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted shrink-0">Battery</span>
              <span className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${battery ?? 0}%`, background: ICE, boxShadow: `0 0 8px ${ICE}66` }} />
              </span>
              <span className="helix-num text-[11px] font-bold shrink-0" style={{ color: ICE }}>{battery != null ? `${battery}%` : '—'}</span>
            </div>
          </div>
          <CompletenessArc parts={parts} size={38} />
        </ZoneRow>
      </Zone>

      {/* ── FUEL & FLUIDS · macros and hydration share one container ── */}
      <Zone label="Fuel &amp; Fluids" accent={MACRO_COLORS.calories}>
        <ZoneRow divide={false} className="cursor-pointer" onClick={tapFuel} title="Double-tap to edit macros">
          <div className="flex items-center gap-3">
            <span className="flex items-baseline gap-1 shrink-0">
              <Flame className="w-3.5 h-3.5 self-center" style={{ color: MACRO_COLORS.calories }} aria-hidden="true" />
              <span className="helix-num text-fluid-lg font-black leading-none" style={{ color: MACRO_COLORS.calories }}>
                {n ? Math.round(n.calories).toLocaleString() : '—'}
              </span>
              <span className="text-[10px] text-muted font-bold">kcal</span>
            </span>
            {n ? (
              <div className="flex items-center gap-3 ml-auto">
                <MicroRing value={n.carbs_g} goalHint={200} color={MACRO_COLORS.carbs} label="C" />
                <MicroRing value={n.fat_g} goalHint={60} color={MACRO_COLORS.fat} label="F" />
                <MicroRing value={n.protein_g} goalHint={180} color={MACRO_COLORS.protein} label="P" />
              </div>
            ) : <span className="text-[11px] text-muted ml-auto">Double-tap to add</span>}
          </div>
        </ZoneRow>
        {/* Water — the at-a-glance readout AND the way to the full helix.
            This bar and WaterHelix print the identical number and neither takes
            input (hydration arrives from HealthKit dietary water), so one of
            them was pure duplication. Making the bar navigate turns the
            duplication into a route: the glance stays here, the visual stays in
            the pager, and there is exactly one place to go for more. */}
        <ZoneRow
          asButton
          className="flex items-center gap-2 w-full text-left min-h-[36px] active:opacity-70 transition-opacity"
          onClick={() => pager.current?.goTo('water')}
          title="Open the hydration helix"
        >
          <span className="text-[10px] text-muted shrink-0">Water</span>
          <span className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <span className="block h-full rounded-full"
              style={{
                width: `${Math.min(100, ((log?.water_ml ?? 0) / (goals?.water_goal_ml ?? 3000)) * 100)}%`,
                background: ICE, boxShadow: `0 0 8px ${ICE}66`,
              }} />
          </span>
          <span className="helix-num text-[11px] font-bold shrink-0" style={{ color: ICE }}>
            {((log?.water_ml ?? 0) / 1000).toFixed(1)} / {((goals?.water_goal_ml ?? 3000) / 1000).toFixed(1)} L
          </span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted" aria-hidden="true" />
        </ZoneRow>
      </Zone>

      <MacroOverrideSheet
        open={fuelEdit}
        onClose={() => setFuelEdit(false)}
        date={date}
        initial={{ calories: n?.calories ?? 0, protein_g: n?.protein_g ?? 0, carbs_g: n?.carbs_g ?? 0, fat_g: n?.fat_g ?? 0 }}
      />

      {/* ── VITALS · one scrollable line, not a 3×2 grid of bordered boxes ── */}
      <Zone label="Vitals" accent={CYAN}>
        <ZoneRow divide={false}>
          <StatStrip stats={[
            // Weight intentionally NOT here — it owns the Body/InBody card.
            { label: 'Steps', value: log?.steps != null ? Math.round(log.steps).toLocaleString() : null, color: STEEL },
            { label: 'Active', value: log?.active_energy != null ? `${Math.round(log.active_energy)}` : null, color: OXIDE },
            { label: 'Stand', value: log?.stand_hours != null ? `${log.stand_hours}` : null, unit: 'h', color: EMERALD },
            // VO₂max removed — HealthKit never populated it (always 0).
            { label: 'Resp', value: log?.respiratory_rate != null ? log.respiratory_rate.toFixed(1) : null, unit: '/min', color: ICE },
            { label: 'SpO₂', value: log?.blood_oxygen != null ? `${Math.round(log.blood_oxygen)}` : null, unit: '%', color: EMERALD },
            { label: 'HRV', value: log?.hrv_ms != null ? `${Math.round(log.hrv_ms)}` : null, color: ICE },
          ]} />
        </ZoneRow>
      </Zone>

      {/* ── The three tall visuals, paged rather than stacked ──
          Sleep ribbon (~320px) + hydration helix (~180px) + body figure (~280px)
          is 780px of a ~2,000px page, and each is something you look at on
          purpose rather than scan past. Sharing one slot gives every one of them
          MORE room than it had at a third of the cost. */}
      <div ref={pagerRef}>
        <SnapPager ref={pager} pages={[
          {
            key: 'sleep',
            label: 'Sleep',
            content: (
              <section className="helix-card space-y-3" style={{ borderColor: `${VIOLET}26` }}>
                <h3 className="font-heading font-semibold text-fluid-sm text-text flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5" style={{ color: VIOLET }} /> Sleep &amp; Recovery
                </h3>
                <SleepStages sleep={daySleep ?? null} log={log ?? null} goalHours={goals?.sleep_goal_hours ?? null} />
                <SleepDebtGauge compact />
              </section>
            ),
          },
          {
            key: 'water',
            label: 'Hydration',
            content: <WaterHelix ml={log?.water_ml ?? null} goalMl={goals?.water_goal_ml ?? 3000} />,
          },
          {
            // Silhouette + headline numbers + the entry form, one domain. The
            // standalone InBody card below the pager is gone — it was the same
            // subject ~400px from the page that visualises it.
            key: 'body',
            label: 'Body',
            content: (
              <BodyPanel
                date={date}
                log={log ?? null}
                openEditor={focusInbody && !inbodyHandled}
                onEditorClosed={() => setInbodyHandled(true)}
              />
            ),
          },
        ]} />
      </div>

      {/* Recovery inputs — soreness 24–72h post-session (compact 2-column) */}
      <DomsTracker date={date} />

      {/* Cardio (walk/run) — separate ledger; never double-counts Active Energy */}
      <CardioLogger date={date} hkActiveEnergy={log?.active_energy ?? null} />

      {/* ══ SECTION 2 · Session Debrief ══ (workout + progression, unified) */}
      {trained ? (
        <>
          <SectionTitle>Session Debrief</SectionTitle>
          {sessions.map((s) => <SessionBlock key={s.id} session={s} unit={unit} />)}
        </>
      ) : restDay ? (
        /* Rest day → a compact premium badge, NOT a big empty workout block */
        <section className="helix-card holo-sheen flex items-center gap-3 py-4"
          style={{ borderColor: `${VIOLET}30`, boxShadow: `0 0 24px ${VIOLET}1f` }}>
          <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `${VIOLET}1c`, color: VIOLET, boxShadow: `0 0 18px ${VIOLET}55` }}>
            <Moon className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-fluid-base" style={{ color: VIOLET }}>Rest · Zone-2 Recovery</p>
            <p className="text-fluid-xs text-muted">Adaptation happens now — no lifting scheduled.</p>
          </div>
          <SwapDayControl date={date} />
        </section>
      ) : (
        /* A training day with no session yet → the log CTA + swap */
        <>
          <SectionTitle>The Workout</SectionTitle>
          <section className="helix-card space-y-3" style={{ borderColor: `${CYAN}26` }}>
            {/* Only for the day you're actually living — a low battery three
                weeks ago is history, not a decision. */}
            {date === logicalTodayISO() && schedule !== 'rest' && (
              <RestSuggestion date={date} dayLabel={schedule.label} />
            )}
            <p className="text-fluid-sm text-text font-medium">
              No session logged for {schedule !== 'rest' ? schedule.label : 'today'} yet.
            </p>
            {schedule !== 'rest' && schedule.dayKey && (
              <Link href={`/session?template=${schedule.dayKey}&date=${date}`}
                className="btn-primary w-full justify-center min-h-[44px]" style={{ background: CYAN, boxShadow: `0 0 18px ${CYAN}55` }}>
                <Dumbbell className="w-4 h-4" aria-hidden="true" /> Log {schedule.label}
              </Link>
            )}
            <RestTodayButton date={date} label="Rest day" />
            <SwapDayControl date={date} />
          </section>
        </>
      )}

      {isLoading && <div className="helix-card h-20 animate-pulse" aria-hidden="true" />}
    </div>
  )
}
