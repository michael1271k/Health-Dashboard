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

/// Phone-like battery — drain-only (v7). A direct port of
/// `src/lib/scoring/battery.ts`; the reasoning lives there and is not duplicated
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
        public let workoutMax: Double = 30
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
    public static var maxTotalDrain: Double {
        defaults.timeMax + defaults.activityCap + defaults.workoutMax
    }

    /// The workout drain ceiling, **per programme day**.
    ///
    /// Keyed on `day_key` (the programme day), never on `split_day` — `splitDay`
    /// does not drain, and has not since v7.
    public static let workoutMaxByDay: [String: Double] = [
        "legs_a": 30, "legs_b": 30,   // hardest
        "cb_a": 24, "cb_b": 24,       // upper A / upper B
        "arms": 18,                   // delts & arms — the easiest day
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

    /// Wake charge from sleep quality (0...1): `55 + 45·q`, rounded.
    public static func computeMorningCharge(sleepQuality: Double) -> Double {
        jsRound(defaults.wakeMin + defaults.wakeRange * clamp(sleepQuality, 0, 1))
    }

    /// Sleep quality 0...1 — 70% duration vs goal, 15% deep sleep, 15% resting
    /// HR vs baseline (an elevated RHR drags quality down). Drives wake charge.
    public static func computeSleepQuality(_ inputs: ScoringInputs) -> Double {
        let ratio = inputs.sleepGoalHours != 0
            ? Swift.min(1, inputs.sleepHours / inputs.sleepGoalHours)
            : 1
        let deepQ = inputs.deepMinutes >= 75 ? 1 : Swift.max(0, inputs.deepMinutes / 75)
        var rhrQ: Double = 1
        // Mirrors JavaScript truthiness: the TypeScript guard is
        // `if (inputs.restingHR && inputs.baselineHR)`, so a present-but-zero
        // reading takes the same branch as an absent one.
        if let rhr = inputs.restingHR, rhr != 0, let base = inputs.baselineHR, base != 0 {
            // +20 bpm over baseline reaches 0; at or below baseline is 1.
            rhrQ = clamp(1 - (rhr - base) / 20, 0, 1)
        }
        return clamp(0.7 * ratio + 0.15 * deepQ + 0.15 * rhrQ, 0, 1)
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
        let wakeCharge = computeMorningCharge(sleepQuality: computeSleepQuality(inputs))

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

        let currentPct = clamp(wakeCharge - time - activity - workout, defaults.floor, 100)
        return BatteryState(morningCharge: wakeCharge, currentPct: jsRound(currentPct))
    }
}
