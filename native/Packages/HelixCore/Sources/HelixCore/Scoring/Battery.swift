import Foundation

/// Battery state — `BatteryState` in `src/lib/scoring/battery.ts`.
public struct BatteryState: Codable, Sendable, Equatable {
    /// 0–100, charge at wake, sleep-driven.
    public var morningCharge: Double
    /// 0–100, time-of-day aware.
    public var currentPct: Double

    public init(morningCharge: Double, currentPct: Double) {
        self.morningCharge = morningCharge
        self.currentPct = currentPct
    }
}

/// Phone-like battery — drain-only (v7) with v8's morning-charge and stress
/// terms on top. A direct port of `src/lib/scoring/battery.ts`; the reasoning lives there and is not duplicated
/// here, but the one rule that must survive translation is repeated because a
/// port is exactly where it would be lost:
///
/// > **The drain budget must stay strictly under the charge budget.**
///
/// v6 broke it — max drain reached 104.2 against a 100-point charge, so a leg
/// day hit the floor before bedtime no matter how well you slept. `Invariants`
/// in the test target asserts it here the same way `battery.test.ts` asserts it
/// on the web side. If a constant below is ever edited, that test is the thing
/// that catches the edit being unsafe.
public enum Battery {
    public struct Defaults: Sendable {
        public let floor: Double = 5
        /// Worst-sleep wake charge.
        public let wakeMin: Double = 55
        /// Plus up to 45 for perfect sleep, reaching 100.
        public let wakeRange: Double = 45
        /// Full chronological cost of an 18h day, cosine-distributed.
        public let timeMax: Double = 35
        public let activityCap: Double = 12
        /// The heaviest day's ceiling — see `workoutMaxByDay`.
        public let workoutMax: Double = 32
        /// v8 — RHR elevation + HRV suppression + the latest fatigue reading.
        public let stressCap: Double = 10
        /// v8 — a night you struggled to fall into starts the day 3 lower.
        public let onsetPenalty: Double = 3
        /// v8 — (deep + REM) / asleep at which the stages term saturates.
        public let restorativeShare: Double = 0.45
        /// Used when `session_rpe` is absent (74 legacy sessions carry none).
        /// Note this is already a 0–1 fraction, *not* a CR-10 value.
        public let defaultRpe: Double = 0.7
        /// A session at or below 60% of normal still costs something.
        public let relMin: Double = 0.6
        /// Beyond 140% of normal, more tonnage stops adding drain.
        public let relMax: Double = 1.4
        public let maxAwake: Double = 18
    }

    public static let defaults = Defaults()

    /// The worst case the model can ever charge in a single day.
    /// v8: 35 + 12 + 32 + 10 = 89.
    public static var maxTotalDrain: Double {
        defaults.timeMax + defaults.activityCap + defaults.workoutMax + defaults.stressCap
    }

    /// The workout drain ceiling, **per programme day**.
    ///
    /// Keyed on `day_key` (the programme day), never on `split_day` — `splitDay`
    /// does not drain, and has not since v7.
    public static let workoutMaxByDay: [String: Double] = [
        "legs_a": 32, "legs_b": 32,   // hardest — a third more than upper (v8)
        "cb_a": 24, "cb_b": 24,       // upper A / upper B
        "arms": 16,                   // delts & arms — the easiest day
    ]

    /// Default 24, the upper-day figure, for a session with no programme day.
    /// Assuming the middle beats assuming either extreme.
    public static let workoutMaxDefault: Double = 24

    /// How much of the day's workout ceiling a maintenance/deload day may spend.
    /// Strictly below 1, which is what keeps `maxTotalDrain` an upper bound.
    public static let maintenanceDrainFactor: Double = 0.75

    /// The floor of the relative term on a maintenance day. Lower than
    /// `relMin`, so it can only ever lower a drain — never raise the worst case.
    public static let maintenanceRelMin: Double = 0.35

    public static func workoutMaxFor(dayKey: String? = nil, maintenance: Bool = false) -> Double {
        let base = dayKey.flatMap { workoutMaxByDay[$0] } ?? workoutMaxDefault
        return maintenance ? base * maintenanceDrainFactor : base
    }

    /// The floor of the relative term for this kind of day.
    public static func relMinFor(maintenance: Bool) -> Double {
        maintenance ? maintenanceRelMin : defaults.relMin
    }

    /// Wake charge from sleep quality (0...1): `55 + 45·q`, rounded — then
    /// minus 3 for a night you struggled to fall into (v8). The penalty lands
    /// AFTER the rounding and OUTSIDE the clamp, so the worst start is 52.
    public static func computeMorningCharge(sleepQuality: Double, onsetTrouble: Bool = false) -> Double {
        jsRound(defaults.wakeMin + defaults.wakeRange * clamp(sleepQuality, 0, 1))
            - (onsetTrouble ? defaults.onsetPenalty : 0)
    }

    /// `computeSleepQuality`, with the four terms it is built from. Each 0...1.
    public struct SleepQualityParts: Codable, Sendable, Equatable {
        /// Duration vs goal, capped at 1.
        public var ratio: Double
        /// (deep + REM) / asleep, saturating at `restorativeShare`.
        public var stagesQ: Double
        /// 0.5 at baseline; 1 at twice it; 0 at zero. 0.5 when either side is missing.
        public var hrvQ: Double
        /// 1 at or below baseline; 0 at +20 bpm. 1 when either side is missing.
        public var rhrQ: Double
        public var quality: Double
    }

    /// Sleep quality 0...1 (v8) — 55 % duration vs goal, 15 % restorative
    /// stages, 15 % HRV vs baseline, 15 % resting HR vs baseline. Every term
    /// degrades to its NEUTRAL value when its inputs are missing, never to a
    /// penalty: an unsynced reading is not a bad reading.
    public static func sleepQualityParts(_ inputs: ScoringInputs) -> SleepQualityParts {
        let ratio = inputs.sleepGoalHours != 0
            ? Swift.min(1, inputs.sleepHours / inputs.sleepGoalHours)
            : 1
        let asleepMin = inputs.sleepHours * 60
        let stagesQ = asleepMin > 0
            ? clamp((inputs.deepMinutes + inputs.remMinutes) / (defaults.restorativeShare * asleepMin), 0, 1)
            : 0
        // Mirrors JavaScript truthiness: the TypeScript guards are
        // `if (inputs.hrvMs && inputs.hrvBaseline)` and
        // `if (inputs.restingHR && inputs.baselineHR)`, so a present-but-zero
        // reading takes the same branch as an absent one.
        var hrvQ = 0.5
        if let hrv = inputs.hrvMs, hrv != 0, let base = inputs.hrvBaseline, base != 0 {
            hrvQ = clamp(0.5 + (hrv - base) / (2 * base), 0, 1)
        }
        var rhrQ: Double = 1
        if let rhr = inputs.restingHR, rhr != 0, let base = inputs.baselineHR, base != 0 {
            // +20 bpm over baseline reaches 0; at or below baseline is 1.
            rhrQ = clamp(1 - (rhr - base) / 20, 0, 1)
        }
        let quality = clamp(0.55 * ratio + 0.15 * stagesQ + 0.15 * hrvQ + 0.15 * rhrQ, 0, 1)
        return SleepQualityParts(ratio: ratio, stagesQ: stagesQ, hrvQ: hrvQ, rhrQ: rhrQ, quality: quality)
    }

    public static func computeSleepQuality(_ inputs: ScoringInputs) -> Double {
        sleepQualityParts(inputs).quality
    }

    /// The stress drain, term by term.
    public struct StressParts: Codable, Sendable, Equatable {
        /// 4 per 10 bpm over the resting-HR baseline. 0 at or below it, or unmeasured.
        public var rhrTerm: Double
        /// 3 at half the HRV baseline. 0 at or above it, or unmeasured.
        public var hrvTerm: Double
        /// 0...4 — Fresh / Fine / Worn / Heavy / Empty of the LATEST slot logged today.
        public var fatigueTerm: Double
        /// The sum, capped at `stressCap`.
        public var drain: Double
    }

    /// Stress drain (v8, cap 10) — the day's physiological and felt load that
    /// no session explains. Every term is floored at zero: a low resting HR or
    /// a high HRV is credited by the wake charge and recharges nothing,
    /// because nothing does.
    public static func stressParts(_ inputs: ScoringInputs) -> StressParts {
        var rhrTerm: Double = 0
        if let rhr = inputs.restingHR, rhr != 0, let base = inputs.baselineHR, base != 0 {
            rhrTerm = 4 * Swift.max(0, (rhr - base) / 10)
        }
        var hrvTerm: Double = 0
        if let hrv = inputs.hrvMs, hrv != 0, let base = inputs.hrvBaseline, base != 0 {
            hrvTerm = 3 * Swift.max(0, ((base - hrv) / base) * 2)
        }
        var fatigueTerm: Double = 0
        if let level = inputs.fatigueLevel, level >= 1 {
            fatigueTerm = clamp(level - 1, 0, 4)
        }
        return StressParts(
            rhrTerm: rhrTerm, hrvTerm: hrvTerm, fatigueTerm: fatigueTerm,
            drain: Swift.min(defaults.stressCap, rhrTerm + hrvTerm + fatigueTerm)
        )
    }

    public static func stressDrain(_ inputs: ScoringInputs) -> Double {
        stressParts(inputs).drain
    }

    /// How far through the waking day the user is — `hoursAwakeInTZ` from the
    /// old snapshot route. The battery drains against this, so it is the one
    /// input that changes every hour with no new data; a 07:00 wake convention,
    /// clamped to `[0, maxAwake]`.
    public static func hoursAwake(at now: Date = Date(), calendar: Calendar = .current, wakeHour: Int = 7) -> Double {
        clamp(Double(calendar.component(.hour, from: now) - wakeHour), 0, defaults.maxAwake)
    }

    /// Chronological drain, as a raised cosine over the waking day rather than a
    /// line: little before hour 6, most between 8 and 14, flattening late.
    /// `awake = 0` gives 0; `awake = maxAwake` gives `timeMax`. Monotonic.
    public static func timeDrain(hoursAwake: Double) -> Double {
        let awake = clamp(hoursAwake, 0, defaults.maxAwake)
        return defaults.timeMax * (1 - Foundation.cos(Double.pi * awake / defaults.maxAwake)) / 2
    }

    /// Workout drain — relative to your own normal for this session type, scaled
    /// by how hard you said it was.
    ///
    /// `maintenance` lowers the ceiling and the relative floor and touches
    /// nothing else. It must never scale the effort term: an RPE 9 logged on a
    /// deload day was a nine.
    public static func workoutDrain(
        sessionVolumeKg: Double,
        trailingAvgVolumeKg: Double,
        sessionRpe: Double? = nil,
        dayKey: String? = nil,
        maintenance: Bool = false
    ) -> Double {
        guard sessionVolumeKg > 0 else { return 0 }
        let relative = trailingAvgVolumeKg > 0 ? sessionVolumeKg / trailingAvgVolumeKg : 1
        let intensity: Double = {
            guard let rpe = sessionRpe, rpe > 0 else { return defaults.defaultRpe }
            return clamp(rpe / 10, 0, 1)
        }()
        return workoutMaxFor(dayKey: dayKey, maintenance: maintenance)
            * intensity
            * clamp(relative, relMinFor(maintenance: maintenance), defaults.relMax)
            / defaults.relMax
    }

    /// Current battery % — strict drain-only. There is no recharge term, which
    /// is why eating breakfast can never make the battery jump.
    public static func computeBattery(_ inputs: ScoringInputs, hoursAwake: Double? = nil) -> BatteryState {
        let wakeCharge = computeMorningCharge(
            sleepQuality: computeSleepQuality(inputs), onsetTrouble: inputs.sleepOnsetTrouble == true
        )

        let awake = clamp(hoursAwake ?? inputs.hoursAwake ?? 8, 0, defaults.maxAwake)
        let time = timeDrain(hoursAwake: awake)
        let activity = Swift.min(
            defaults.activityCap,
            0.004 * inputs.activeCal + 0.5 * (inputs.steps / 1000)
        )
        let workout = workoutDrain(
            sessionVolumeKg: inputs.sessionVolumeKg,
            trailingAvgVolumeKg: inputs.trailingAvgVolumeKg,
            sessionRpe: inputs.sessionRpe,
            dayKey: inputs.sessionDayKey,
            maintenance: inputs.isMaintenance ?? false
        )

        let stress = stressDrain(inputs)

        let currentPct = clamp(wakeCharge - time - activity - workout - stress, defaults.floor, 100)
        return BatteryState(morningCharge: wakeCharge, currentPct: jsRound(currentPct))
    }
}
