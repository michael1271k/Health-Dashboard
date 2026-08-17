'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Dumbbell, Moon, Flame, ChevronRight } from 'lucide-react'
import { CompletenessArc } from '@/components/day/CompletenessArc'
import { BodyPanel } from '@/components/day/BodyPanel'
import { SleepDebtGauge } from '@/components/day/SleepDebtGauge'
import { SwapDayControl, RestTodayButton } from '@/components/day/SwapDayControl'
import { RestSuggestion } from '@/components/day/RestSuggestion'
import { DomsTracker } from '@/components/day/RecoveryTrackers'
import { CardioLogger } from '@/components/day/CardioLogger'
import { WaterHelix } from '@/components/day/WaterHelix'
import { WaterOverrideSheet } from '@/components/day/WaterOverrideSheet'
import { useDayVault, dayCompleteness, type DayVaultData } from '@/lib/hooks/useDayVault'
import { useUserGoals, useDaySleep } from '@/lib/hooks/useDashboard'
import { useNutritionGoals } from '@/lib/hooks/useNutritionGoals'
import { useBioSeries } from '@/lib/hooks/useBioStrips'
import { SleepStages } from '@/components/dashboard/SleepStages'
import { InBodyForm } from '@/components/day/InBody'
import { Bar } from '@/components/nutrition/MacroCards'
import { MACRO_COLORS } from '@/lib/nutrition/colors'
import { useDoubleTap } from '@/lib/utils/doubleTap'
import { MacroOverrideSheet } from '@/components/nutrition/MacroOverrideSheet'
import { ExceptionDayBanner } from '@/components/nutrition/ExceptionDayBanner'
import { phaseDisplay } from '@/lib/nutrition/phase'
import { tdeeKcal, tefKcal, tdeeBreakdown } from '@/lib/nutrition/energy'
import { ERA_META, eraForDate, scheduleDayFor, activeProgram } from '@/lib/programs'
import { displayWeight, weightUnit, fmtVolume } from '@/lib/utils/units'
import { logicalTodayISO } from '@/lib/utils/day'
import { useScheduleVersion } from '@/lib/hooks/useScheduleVersion'
import { Zone, ZoneRow, StatStrip } from '@/components/ui/Zone'
import { Sheet } from '@/components/ui/Sheet'
import { SleepBand, BodyBand } from '@/components/day/SummaryBands'

/**
 * Which drawer is open. One value, so two can never be.
 *
 * `inbody` REPLACES `body` rather than stacking on it — a form is a push, not
 * a second drawer over the first — and closing it returns to `body`.
 */
type DaySheet = 'sleep' | 'body' | 'inbody' | 'water' | 'water-edit' | 'macros' | 'nutrition' | null
import { AppBar } from '@/components/nav/AppBar'
import { parseDaySection } from '@/lib/day/sections'
import { BackLink, NavChevron } from '@/components/nav/NavChevron'
import { EMBER, EMBER_DEEP, SAPPHIRE, STEEL, GOLD, OXIDE, EMERALD, MUTED, SAND, BODY } from '@/lib/theme/palette'

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
 * One macro: letter, bar, and the two numbers.
 *
 * The bar itself comes from `MacroCards` so the two surfaces cannot disagree
 * about what "over goal" looks like. What is added here is the pair of figures
 * — a bar with no number is a mood, and this row is where you check whether you
 * have room for dinner.
 */
function MacroLine({ label, value, goal, color }: {
  label: string
  value: number | null | undefined
  /** Absent when the plan sets no target for this macro — the bar stays empty
   *  rather than grading the day against an invented number. */
  goal?: number | null
  color: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold w-2 shrink-0" style={{ color }}>{label}</span>
      <span className="flex-1 min-w-0"><Bar value={value ?? null} goal={goal ?? null} color={color} height={5} /></span>
      <span className="helix-num text-[10px] tabular-nums shrink-0 text-text/90">
        {value != null ? Math.round(value) : '—'}
        {goal != null && goal > 0 && <span className="text-muted">/{Math.round(goal)}</span>}
      </span>
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
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 w-full text-left space-y-3 active:opacity-80"
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
  // The plan+phase macro targets — one resolver, shared with /nutrition.
  const macroGoals = useNutritionGoals()
  const { data: daySleep } = useDaySleep(date)
  // Already fetched for the dashboard strip and never shown on this page —
  // one night in isolation cannot tell you if it was a bad night or a bad week.
  const { data: bioSeries } = useBioSeries()
  // scheduleDayFor (below the early return) reads a module-level cache React
  // can't observe. Subscribing here is what makes a swap from another device
  // repaint this page instead of waiting for an unrelated re-render.
  useScheduleVersion()
  /**
   * ONE drawer at a time, named by what is in it.
   *
   * This replaces a pager ref, a separate `fuelEdit` boolean, an
   * `inbodyHandled` latch, a 120ms setTimeout racing a query, and a
   * scrollIntoView. Every detail on this page is now the same kind of object
   * arriving the same way, and "which one is open" is a single value.
   */
  const [sheet, setSheet] = useState<DaySheet>(null)
  const tapFuel = useDoubleTap(() => setSheet('macros'))

  // Deep-link from the dashboard Body card (double-tap → …?section=inbody) and
  // from every widget face that names a day: Sleep → `?section=sleep`, Water →
  // `?section=water`, Body/composition → `?section=inbody`.
  //
  // It used to compare against the single literal 'inbody', so the other six
  // drawers were unreachable by link even though the machinery to open them was
  // identical — which is why a widget tap could only ever land on the day and
  // leave you to find the thing you tapped.
  //
  // Opening a drawer needs no timing: there is no pager to swipe and nothing to
  // scroll to, so the link just names the drawer.
  const searchParams = useSearchParams()
  const section = parseDaySection(searchParams.get('section'))
  useEffect(() => { if (section) setSheet(section) }, [section])

  if (!date) return <p className="text-muted p-6">Invalid date.</p>

  const era = eraForDate(date)
  const eraMeta = ERA_META[era]
  const schedule = scheduleDayFor(date) // swap-aware (subscribed via useScheduleVersion above)
  const sessions = data?.sessions ?? []
  const trained = sessions.length > 0
  const restDay = !trained && schedule === 'rest'
  const { parts } = dayCompleteness(data)
  const unit = weightUnit()
  const log = data?.log
  const n = data?.nutrition
  const score = data?.score?.score ?? null
  const battery = data?.score?.battery_pct ?? null
  // BMR + active + TEF. Null unless all three exist — see nutrition/energy.ts.
  const tdee = tdeeKcal(log?.bmr, log?.active_energy, n?.calories)
  // The day's nutrition context. Both read straight off the vault select, which
  // gained these two columns for exactly this — the page could not see either
  // flag before, which is the whole reason tagging a past day was impossible.
  const dayException = log?.nutrition_exception ?? null
  const dayEstimated = log?.nutrition_estimated ?? false

  const pretty = new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const shiftDate = (d: string, delta: number) => {
    const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + delta); return x.toISOString().slice(0, 10)
  }
  const prevDate = shiftDate(date, -1)
  const nextDate = shiftDate(date, +1)
  const nextIsFuture = nextDate > logicalTodayISO() // no navigating past today

  return (
    <div data-fullbleed className="min-h-dvh">
      {/* The way out is pinned — a page this long that you have to scroll back
          up to escape is a trap. The era colour bleeds along the top edge, so
          one piece of chrome says which block of training this day belongs to. */}
      <AppBar accent={eraMeta.color}>
          <BackLink onClick={() => router.back()} />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-fluid-sm font-bold text-text truncate leading-tight">{pretty}</h1>
            <span className="text-[10px] text-muted">
              {schedule === 'rest' ? 'Rest' : schedule.label}
              {n?.phase ? ` · ${phaseDisplay(n.phase, date).label}` : ''}
            </span>
          </div>
          {/* Previous / Next day — discrete native-feeling chevrons */}
          <div className="flex items-center gap-0.5 shrink-0">
            <NavChevron direction="prev" label="Previous day" onClick={() => router.push(`/day/${prevDate}`)} />
            <NavChevron direction="next" label="Next day" disabled={nextIsFuture}
              onClick={() => router.push(`/day/${nextDate}`)} />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
            style={{ color: eraMeta.color, background: `${eraMeta.color}1a`, border: `1px solid ${eraMeta.color}40` }}>
            {eraMeta.short}
          </span>
      </AppBar>

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
          {/* The day's identity and phase moved to the sticky bar, where they
              stay visible for the whole scroll instead of once at the top. */}
          <div className="flex-1 min-w-0">
            <span className="text-[10px] uppercase tracking-wide text-muted">Readiness</span>
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
              /* ── BARS, NOT RINGS ──
                 Three 56px rings cost the width of the row to show three
                 two-digit numbers, and a ring cannot show OVERSHOOT: 220 g of
                 carbs against a 195 g goal drew the same full circle as 195.
                 `MacroCards`' bar already solves that — it rescales to
                 max(value, goal), ticks where the goal sits and continues past
                 it in oxide — and reusing it means the day page and the
                 nutrition page finally draw the same fact the same way. */
              <div className="ml-auto grid gap-1 flex-1 max-w-[210px]">
                <MacroLine label="C" value={n.carbs_g} goal={macroGoals.carbs} color={MACRO_COLORS.carbs} />
                <MacroLine label="F" value={n.fat_g} goal={macroGoals.fat} color={MACRO_COLORS.fat} />
                <MacroLine label="P" value={n.protein_g} goal={macroGoals.protein} color={MACRO_COLORS.protein} />
              </div>
            ) : <span className="text-[11px] text-muted ml-auto">Double-tap to add</span>}
          </div>
        </ZoneRow>
        {/* Energy balance — intake against the day's REAL cost.
            TDEE = BMR + active + TEF. The thermic effect of food used to be
            missing everywhere, which understated the deficit by ~200 kcal every
            single day — a bias that never averages out because it always leans
            the same way. The breakdown is printed rather than hidden behind a
            tooltip precisely so the TEF term is visible as expenditure.
            Renders only when all three components exist; a missing one would
            otherwise be silently read as zero. */}
        {tdee != null && n != null && (
          <ZoneRow className="flex items-center gap-2">
            <span className="text-[10px] text-muted shrink-0">Balance</span>
            <span className="helix-num text-[11px] font-bold shrink-0"
              style={{ color: n.calories - tdee < 0 ? EMERALD : OXIDE }}>
              {n.calories - tdee < 0 ? '−' : '+'}{Math.abs(Math.round(n.calories - tdee)).toLocaleString()} kcal
            </span>
            <span className="text-[10px] text-muted ml-auto truncate text-right">
              TDEE {Math.round(tdee).toLocaleString()} · {tdeeBreakdown(log?.bmr ?? 0, log?.active_energy ?? 0, tefKcal(n.calories) ?? 0)}
            </span>
          </ZoneRow>
        )}
        {/* The day's nutrition context — the reason it was allowed to miss its
            target, and whether the numbers are a guess.

            A ROW OF ITS OWN, not a second job for the Fuel row's double-tap.
            That gesture already means "edit the macros", and a control that
            means two things depending on how hard you press is not a control.

            This is the surface the flag never had: the writer and the hook were
            always date-generic, but the only place that rendered them passed
            today, so `daily_logs` held zero flagged days for the entire life of
            the feature. You learn a day was an exception in the evening — often
            the next morning — and by then today's page is gone. */}
        <ZoneRow
          asButton
          className="flex items-center gap-2 w-full text-left min-h-[36px] active:opacity-70 transition-opacity"
          onClick={() => setSheet('nutrition')}
          title="Exception day and estimated intake"
        >
          <span className="text-[10px] text-muted shrink-0">Context</span>
          {dayException || dayEstimated ? (
            <span className="text-[11px] font-semibold truncate">
              {dayException && <span style={{ color: SAND }}>Exception · {dayException}</span>}
              {dayException && dayEstimated && <span className="text-muted"> · </span>}
              {dayEstimated && <span style={{ color: STEEL }}>Estimated</span>}
            </span>
          ) : (
            <span className="text-[11px] text-muted">Ordinary day</span>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted ml-auto shrink-0" aria-hidden="true" />
        </ZoneRow>

        {/* Water — the at-a-glance readout AND the way to the full helix.
            This bar and WaterHelix print the identical number, so one of them
            was pure duplication. Making the bar navigate turns the duplication
            into a route: the glance stays here, the visual stays in the pager,
            and there is exactly one place to go for more.

            The bar's SINGLE tap keeps opening the sheet. Correcting the day is a
            double-tap on the helix inside it — adding a second gesture here
            would mean delaying this tap ~300ms to disambiguate, i.e. making the
            common action slower to reach the rare one. */}
        <ZoneRow
          asButton
          className="flex items-center gap-2 w-full text-left min-h-[36px] active:opacity-70 transition-opacity"
          onClick={() => setSheet('water')}
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

      {/* Portalled, so its position in the band stack doesn't matter. */}
      <MacroOverrideSheet
        open={sheet === 'macros'}
        onClose={() => setSheet(null)}
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

      {/* ── SLEEP · a glance, with the detail one tap away ── */}
      <Zone label="Sleep" accent={VIOLET}>
        <SleepBand
          sleep={daySleep ?? null}
          sleepMinutes={log?.sleep_minutes ?? null}
          goalHours={goals?.sleep_goal_hours ?? null}
          onOpen={() => setSheet('sleep')}
        />
      </Zone>

      {/* ── BODY · same shape whether or not you weighed in today ── */}
      <Zone label="Body" accent={BODY.weight}>
        <BodyBand log={log ?? null} onOpen={() => setSheet('body')} />
      </Zone>

      {/* Cardio ABOVE soreness, because it is a thing you LOG and soreness is a
          thing you report. The logging surfaces belong together and near the
          top of the ones you scroll to; DOMS is a 24–72h retrospective and is
          the last thing you touch on the day it applies to. */}
      <CardioLogger date={date} hkActiveEnergy={log?.active_energy ?? null} />

      {/* Recovery inputs — soreness 24–72h post-session, on the body map */}
      <Zone label="Soreness" accent={EMBER}>
        <DomsTracker date={date} />
      </Zone>

      {/* ══ The drawers ══
          One at a time, by construction — `sheet` is a single value. Each is
          the same Sheet the whole app uses: swipe to dismiss, thrown away with
          a flick, catchable mid-flight. */}
      <Sheet open={sheet === 'sleep'} onClose={() => setSheet(null)} title="Sleep" accent={VIOLET}>
        <SleepStages
          sleep={daySleep ?? null}
          log={log ?? null}
          goalHours={goals?.sleep_goal_hours ?? null}
          nightly={(bioSeries ?? []).slice(-7).map((b) => ({ date: b.date, minutes: b.sleepMin }))}
          variant="full"
        />
        <div className="mt-3"><SleepDebtGauge /></div>
      </Sheet>

      {/* The retroactive tagging surface. `ExceptionDayBanner` takes `date` as a
          plain prop and always did — nothing here is a special past-day variant
          of it. The nutrition page renders the identical component with today's
          date. */}
      <Sheet open={sheet === 'nutrition'} onClose={() => setSheet(null)} title="Nutrition context" accent={SAND}>
        <ExceptionDayBanner date={date} stored={dayException} estimated={dayEstimated} />
      </Sheet>

      <Sheet open={sheet === 'water'} onClose={() => setSheet(null)} title="Hydration" accent={ICE}>
        <div className="flex justify-center py-2">
          <WaterHelix ml={log?.water_ml ?? null} goalMl={goals?.water_goal_ml ?? 3000}
            onOverride={() => setSheet('water-edit')} />
        </div>
      </Sheet>

      {/* Replaces the Hydration sheet rather than stacking on it — a form is a
          push, not a second drawer — and closing returns to where you were,
          the same rule the InBody form follows. */}
      <WaterOverrideSheet
        open={sheet === 'water-edit'}
        onClose={() => setSheet('water')}
        date={date}
        currentMl={log?.water_ml ?? null}
        goalMl={goals?.water_goal_ml ?? 3000}
      />

      <Sheet open={sheet === 'body'} onClose={() => setSheet(null)} title="Body composition" accent={BODY.weight}>
        <BodyPanel date={date} log={log ?? null} onEdit={() => setSheet('inbody')} />
      </Sheet>

      {/* Replaces the Body drawer rather than stacking on it — a form is a push,
          not a second drawer — and closing returns to where you were. */}
      <Sheet open={sheet === 'inbody'} onClose={() => setSheet('body')} title="InBody &amp; Scale Metrics" accent={BODY.weight}>
        <p className="text-[11px] text-muted mb-3">
          Enter weight and a percentage — the masses derive and save themselves.
        </p>
        <InBodyForm date={date} log={log ?? null} onSaved={() => setSheet('body')} />
      </Sheet>

      {/* ══ SECTION 2 · Session Debrief ══ (workout + progression, unified)
          The last band is the only one that keeps card chrome inside it: a
          session block is a TARGET, and a tappable thing needs an edge. */}
      <div className="mx-auto w-full max-w-[68ch] px-3 py-3 space-y-3">
      {trained ? (
        <>
          <SectionTitle>Session Debrief</SectionTitle>
          {sessions.map((s) => <SessionBlock key={s.id} session={s} unit={unit} />)}
        </>
      ) : restDay ? (
        /* Rest day → a compact premium badge, NOT a big empty workout block */
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 flex items-center gap-3 py-4"
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
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 space-y-3" style={{ borderColor: `${CYAN}26` }}>
            {/* Only for the day you're actually living — a low battery three
                weeks ago is history, not a decision. */}
            {date === logicalTodayISO() && schedule !== 'rest' && (
              <RestSuggestion date={date} dayLabel={schedule.label} />
            )}
            <p className="text-fluid-sm text-text font-medium">
              No session logged for {schedule !== 'rest' ? schedule.label : 'today'} yet.
            </p>
            {/* ── ONE ROW OF ACTIONS ──
                Three full-width stacked buttons — Log, Rest day, Swap — read as
                three decisions of equal weight, and pushed the rest of the day
                below the fold on a phone. Logging is the primary action and
                keeps its size; rescheduling is the alternative and sits beside
                it, which is also what it IS: the same decision made the other
                way. */}
            <div className="flex items-start gap-2">
              {schedule !== 'rest' && schedule.dayKey && (
                <Link href={`/session?template=${schedule.dayKey}&date=${date}`}
                  className="btn-primary flex-1 justify-center min-h-[44px]" style={{ background: CYAN, boxShadow: `0 0 18px ${CYAN}55` }}>
                  <Dumbbell className="w-4 h-4" aria-hidden="true" /> Log {schedule.label}
                </Link>
              )}
              {/* Swap sits BESIDE the log button because it is the same decision
                  made the other way, and it keeps its own width: the control
                  expands into a consequence panel when armed, and a flex child
                  that grows would squash that panel's text into a column. */}
              <SwapDayControl date={date} className="shrink-0" />
            </div>
            <RestTodayButton date={date} label="Rest day" />
          </section>
        </>
      )}

      {isLoading && <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 h-20 animate-pulse" aria-hidden="true" />}
      </div>
    </div>
  )
}
