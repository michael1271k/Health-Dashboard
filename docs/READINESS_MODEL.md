# Readiness v9 — the model behind the battery

**Status: shipped 2026-09-05 (Wave 10, Track E).** Implemented twice and proven equal: `src/lib/scoring/readiness.ts` + `battery.ts` on the web, `native/Packages/OnyxCore/Sources/OnyxCore/Scoring/Readiness.swift` + `Battery.swift` on the phone. The `readiness-*`, `battery*`, `sleep-quality`, `wellness-drain`, `load-drain` and `weekly-export` golden vectors (`npm run golden`) are the specification; `npm test` and `npm run swift:core` replay them. A number in this document that disagrees with a vector is a documentation bug.

The battery is a phone-like charge that wakes high and only ever drains. v9 keeps that shape (see the header of `battery.ts` for v6's arithmetic failure and v7/v8's repairs) and changes two things: **what the charge reads** for the autonomic signals, and **what the drain budget holds** in place of v8's stress term.

The signals this document defines are read by a second model that spends none of them: **[`STRESS_MODEL.md`](STRESS_MODEL.md)**, the report-only stress index (Phase 3 E3). It reuses §2's `zSignal` grammar and §3's `ACWR`/`strainZ` verbatim, adds sleep fragmentation and the day's fatigue slots, and answers a different question — how far from your own normal today sits, rather than how much charge is left. It is **not** an input here: see §6.

## 1. Inputs

| Signal | Source | Notes |
|---|---|---|
| Overnight HRV | HealthKit SDNN, mean of the samples inside the night's bed window (`sleep_sessions.start_time … end_time`); fallback: the calendar-day mean, flagged `hrvOvernight = false` on the `IngestReport` | `daily_logs.hrv_ms`. Read as **ln(HRV)** — see §2. |
| Resting HR | `daily_metrics.rest_hr` first, `daily_logs.avg_rest_heart_rate` second — the scorer's own rule for the day, applied to every day of the history | bpm |
| Session load (lifting) | `session_rpe × duration_min` — Foster's session-RPE, CR-10 × minutes | An unrated session is read at **CR-10 7** (the battery's `defaultRpe` 0.7 as a CR-10), never as a rest day; no duration → 0 |
| Session load (cardio) | `effort × duration_min` | An unrated bout carries **no** load — its intensity is genuinely unknown |
| Daily load | The sum of the day's sessions and bouts; a day with none is a **real zero** | Rest days are data, and they are what monotony is about |
| Sleep | duration vs goal, deep + REM share | as v8 |
| Wellness | latest fatigue slot (1–5), mean DOMS severity (0–3, zeros included), sleep-onset trouble, sleep ratio | §5 |

The data layer fetches **49 days** ending on the day (`READINESS.historyDays`): 42 baseline days and the 7-day rolling window. `readinessHistoryFor` (`src/lib/scoring/readinessHistory.ts`) and `AppDatabase.readinessHistory` (`OnyxData/Scoring/ReadinessHistoryBuilder.swift`) lay the rows on that calendar the same way; `readiness-history.test.ts` pins the rules.

## 2. HRV and resting-HR z-signals

Plews et al. (2013) showed that a **7-day rolling average** of ln(rMSSD) tracks training status where single-day values are too noisy to read, and Buchheit (2014) recommends comparing it against an athlete's own baseline with the **smallest worthwhile change** — 0.5 × the baseline SD (Hopkins) — as the threshold below which a change is noise.

For a series `v[0…N)` oldest → newest:

```
rolling   = mean of the last 7 readings present            (≥ 3 required)
baseline  = mean and SD (n−1) of the 42 readings before them (≥ 14 required)
swc       = 0.5 × SD
delta     = rolling − baseline mean
z         = 0                       if |delta| < swc
          = clamp(delta / SD, −2, 2) otherwise
          = null                    if either window is too thin or SD = 0
```

HRV is transformed with the natural log first (a non-positive reading is missing, never −∞), so a 10 % drop is the same event at 40 ms and at 80 ms. Resting HR is read raw. The two windows do not overlap.

The z is **SWC-gated**: inside ±SWC it is exactly 0, so the charge does not twitch on day-to-day noise. It is clamped at ±2 because the model is not asked to tell −3 from −6.

## 3. Training load — sRPE, EWMA ACWR, monotony, strain

**Session RPE (Foster 1998; Foster et al. 2001).** Load = CR-10 × minutes, in arbitrary units, for every session and bout, summed per day.

**EWMA acute:chronic workload ratio (Williams et al. 2017).** Exponentially weighted moving averages with λ = 2/(N+1):

```
λ_acute   = 2/8   (N = 7)
λ_chronic = 2/29  (N = 28)
EWMA_today = load_today × λ + (1 − λ) × EWMA_yesterday
ACWR = acute / chronic          (null when chronic = 0 or there is no history)
```

Both averages are **seeded with the mean of the first week** of the series and run from the eighth day. A series that happens to open on a leg day would otherwise start the chronic average three times too high, and with λ = 2/29 that seed is still 5 % of the answer seven weeks later.

The ratio also needs a chronic side built on real sessions: fewer than **3 days with load before the rolling window** (`minLoadDays`) and the ACWR is null. A chronic average built on nothing but zeros cannot tell six weeks off from six weeks of sessions that never synced, and the first session after either would otherwise fire the full spike drain. The cost is one silent week after a genuine layoff; the ratio answers again as soon as that week is behind the window.

**Monotony and strain (Foster 1998).** Over the last seven daily loads:

```
weekly load = Σ loads
monotony    = mean / SD (n−1)         (null when SD = 0 — undefined, not infinite)
strain      = weekly load × monotony
```

**Strain z.** Foster's absolute thresholds (monotony > 2, strain > 6000 AU) assume his units and his athletes. Onyx instead compares this week's strain against **every rolling 7-day strain ending before today** in the 49-day history (≥ 14 required), as `clamp((strain − mean) / SD, −2, 2)`. It is a normalised deviation over autocorrelated windows, not a textbook z, and it is documented as such.

## 4. The charge (v9)

```
q = 0.45·ratio + 0.15·stagesQ + 0.25·hrvQ + 0.15·rhrQ         each term 0…1
wake charge = round(55 + 45·q)
```

- `ratio` — sleep duration / goal, capped at 1.
- `stagesQ` — (deep + REM) / asleep, saturating at 45 % (Apple's restorative guide). Unchanged from v8.
- `hrvQ = zQuality(hrvZ)`, `rhrQ = zQuality(−rhrZ)` where

```
zQuality(z) = clamp(0.75 + 0.25·z, 0, 1)      z = null → 0.75
```

Neutral is **0.75**, not 0.5: a z of zero means "exactly your own normal", and a normal night should charge nearly fully. +1 SD fills the term; −2 SD (the clamp) leaves a quarter of it. A missing z — thin history, a flat baseline — is neutral, never a penalty. The resting-HR sign is flipped because a high resting HR is the bad direction.

v8's −3 onset penalty on the wake charge is retired; the flag is a wellness item now (§5), so it is charged once.

With no autonomic history at all the most a night can charge is 96 (duration and stages at their maximum, both z terms neutral); a night with nothing at all charges 69.

## 5. The drains (v9)

```
currentPct = clamp(wake − time − activity − workout − load − wellness, 5, 100)
```

`time` (raised cosine over an 18-hour day, cap 35), `activity` (cap 12) and `workout` (relative tonnage × RPE, per-day ceiling, cap 32) are unchanged from v8.

**Load drain (cap 8)** — the training you have done that today's session does not explain:

```
acwrTerm   = 5 × clamp((ACWR − 1.3) / (2.0 − 1.3), 0, 1)
strainTerm = 3 × clamp(strainZ / 2, 0, 1)
load       = min(8, acwrTerm + strainTerm)
```

Below an ACWR of 1.3 (the top of the "sweet spot") nothing is charged; from 1.3 to 2.0 the term rises linearly and saturates. Both terms are floored at zero: a light week recharges nothing, because nothing does.

**Wellness drain (cap 6)** — Hooper et al. (1995) found four self-reported items (fatigue, muscle soreness, sleep, stress) track overtraining ahead of the physiology. Onyx's four, each 0…1 where 1 is worst:

| Item | Formula | Missing when |
|---|---|---|
| fatigue | (latest slot level − 1) / 4 | nothing logged |
| soreness | mean DOMS severity / 3 | nothing logged |
| onset | 1 if the night was hard to fall into, else 0 — **false is an answer** (the column is NOT NULL DEFAULT false; a missing row is an unticked night) | only when the column itself is unreadable (the export's `null`) |
| sleep | 1 − min(1, duration / goal) | no night recorded (0 h is unknown, not a complaint) |

```
index    = mean of the ANSWERED items          (null when none)
wellness = 6 × index                            (0 when none)
```

Hooper's index is a sum over items that are always answered; here two are optional self-reports, and a sum would read "did not open the tracker" as "feels perfect". So the index is the mean of what was answered — on an ordinary logged day a mean of three or four, the two optional complaints diluted by the two that were fine. Sleep is counted here and in the charge on purpose — the same fact in a different frame, worth at most 1.5 points on a near-empty night.

## 6. The budget invariant

```
maxTotalDrain = 35 + 12 + 32 + 8 + 6 = 93 < 100 − floor (95)
```

The rule v6 broke: the drain budget must stay strictly under the charge budget, so a well-slept day can never floor and a floor reading therefore means something. Asserted in `src/tests/scoring.test.ts`, `src/tests/readiness-v9.test.ts` and `InvariantTests.swift`. v9's worst day on a perfect night ends at 7.

**Five drains, and only five.** The stress index of [`STRESS_MODEL.md`](STRESS_MODEL.md) reads sleep fragmentation and self-reported fatigue that no term above spends, and it deliberately stays outside this budget — a sixth drain would reopen exactly the arithmetic v6 got wrong. The `stress-battery-isolation` golden vector holds the line: moving a stress input moves the index and leaves `battery_pct` byte-identical.

## 7. Outputs

`batteryBreakdown(inputs, hoursAwake)` / `Battery.breakdown(_:hoursAwake:)` returns every term — charge parts, the five drains, the load and wellness parts, the number — for the dashboard tile (W12 `BatteryStackSeries`) and the export. `computeBattery` is the same call with everything but the two stored numbers thrown away.

The weekly export's `## Derived` block prints, per day, the wake charge with its four terms, the load drain with ACWR / monotony / strain / strain z, and the wellness drain with its four items — beside the stored `battery_pct`, so a reader can see which input moved the number. The per-day signals travel on `ExportDay.readiness`.

## 8. What changed for stored scores

`battery_pct` changes on every scored day. `scripts/recompute-scores.mjs --app-url http://localhost:3000` against a local `next start` rewrites them; the script refuses the deployed URL unless `--allow-remote` is passed, because a remote server runs the formula it was deployed with.

## 9. Deviations from the wave plan, stated

- The plan wrote the lifting load as `session_rpe × 10 × duration_min`. `session_rpe` is stored as a CR-10 (5.0–9.0 live), so the ×10 would have made a lifting session ten times a cardio bout of the same effort and minutes in one series, and monotony would have read every cardio day as near-rest. Both modalities use Foster's `CR-10 × minutes`.
- The plan implied no fallback for an unrated session (decision 13: sRPE logged every session). 87 of 112 live sessions carry no rating, most inside the 49-day window; reading them as rest days would have corrupted ACWR and monotony for seven weeks. An unrated lifting session is read at CR-10 7, the battery's own default. Cardio has no such default.
- `strainZ` normalises against the athlete's own rolling strains rather than Foster's absolute thresholds (§3).
- The overnight-HRV flag has no column yet; it is reported on the `IngestReport`. The DDL to persist it is proposed in the wave report.

## References

- Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. *Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring.* Sports Medicine 2013;43(9):773–781. — 7-day rolling averages of ln rMSSD; single-day values too noisy.
- Buchheit M. *Monitoring training status with HR measures: do all roads lead to Rome?* Frontiers in Physiology 2014;5:73. — baseline ± SWC (0.5 × SD) as the meaningful-change threshold; interpretation of HRV against RHR.
- Foster C. *Monitoring training in athletes with reference to overtraining syndrome.* Medicine & Science in Sports & Exercise 1998;30(7):1164–1168. — session RPE × duration; monotony = mean/SD; strain = weekly load × monotony.
- Foster C, Florhaug JA, Franklin J, Gottschall L, Hrovatin LA, Parker S, Doleshal P, Dodge C. *A new approach to monitoring exercise training.* Journal of Strength and Conditioning Research 2001;15(1):109–115. — validation of the session-RPE method.
- Williams S, West S, Cross MJ, Stokes KA. *Better way to determine the acute:chronic workload ratio?* British Journal of Sports Medicine 2017;51(3):209–210. — EWMA with λ = 2/(N+1), 7- and 28-day windows.
- Hooper SL, Mackinnon LT, Howard A, Gordon RD, Bachmann AW. *Markers for monitoring overtraining and recovery.* Medicine & Science in Sports & Exercise 1995;27(1):106–112. — the four-item wellness questionnaire.
- Hopkins WG. *Measures of reliability in sports medicine and science.* Sports Medicine 2000;30(1):1–15. — the smallest worthwhile change as 0.5 × SD (cited through Buchheit 2014).
