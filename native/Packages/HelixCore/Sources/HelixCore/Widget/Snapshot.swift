import Foundation

/// The widget payload — every tile draws from this and nothing else.
///
/// Lifted verbatim from `ios/App/Shared/HelixSnapshot.swift` (Wave 5), minus
/// the HTTP client: the extension now reads the App Group GRDB file through
/// `WidgetSnapshotBuilder` in HelixData and builds one of these locally. The
/// shape is unchanged so the tile drawing code is unchanged. Every field is
/// optional on purpose: rendering "—" is correct, rendering an invented number
/// is not.

// MARK: - Model

/// Which slice of the payload to ask for.
///
/// The two composite widgets read disjoint halves and an extension is measured
/// in hundreds of milliseconds against a hard memory cap. The scope only ever
/// trims the OPTIONAL extras — every non-optional property below arrives in
/// every scope, because a decode failure renders as "can't reach HELIX", which
/// would blame the network for what is really a shape mismatch.
public enum HelixScope: String, Codable, Sendable {
  case lifestyle
  case performance
  case training
  case body
  case full
}

/// Mirrors `WidgetSnapshot` in src/lib/widget/snapshot.ts. Every field is
/// optional on purpose: rendering "—" is correct, rendering a stale or invented
/// number is not.
public struct HelixSnapshot: Codable, Sendable, Equatable {
  /// One dated reading. Short keys — this crosses the wire thousands of times.
  public struct Point: Codable, Sendable, Equatable, Identifiable {
    public let d: String
    public let v: Double
    public var id: String { d }
    public init(d: String, v: Double) {
      self.d = d
      self.v = v
    }
  }

  public struct Sleep: Codable, Sendable, Equatable {
    public let minutes: Int?
    public let deepMin: Int?
    public let remMin: Int?
    /// Stage TOTALS, not a timeline. The rainbow is a stacked bar and must never
    /// be drawn as a hypnogram — the ordering it would imply is not in the data.
    public let coreMin: Int?
    public let awakeMin: Int?
    public let score: Int?
    public let startTime: String?
    public let endTime: String?
    /// The user's own target, in minutes. The sleep face hardcoded 480, so a
    /// seven-hour goal was graded against someone else's eight.
    public let goalMin: Int?
    /// Seven nights of duration, oldest first. Body scope. One night is a
    /// reading; seven is the thing worth changing a bedtime over.
    public let trend: [Point]?
    public init(minutes: Int? = nil, deepMin: Int? = nil, remMin: Int? = nil, coreMin: Int? = nil, awakeMin: Int? = nil, score: Int? = nil, startTime: String? = nil, endTime: String? = nil, goalMin: Int? = nil, trend: [Point]? = nil) {
      self.minutes = minutes
      self.deepMin = deepMin
      self.remMin = remMin
      self.coreMin = coreMin
      self.awakeMin = awakeMin
      self.score = score
      self.startTime = startTime
      self.endTime = endTime
      self.goalMin = goalMin
      self.trend = trend
    }
  }
  public struct Weight: Codable, Sendable, Equatable {
    public let kg: Double?
    public let deltaKg: Double?
    public let measuredOn: String?
    public let targetKg: Double?
    /// Last week's mean — the dotted baseline the fortnight is read against.
    /// Nil, never zero: a 0 kg baseline would draw an ordinary fortnight as a
    /// catastrophic gain.
    public let prevWeekMeanKg: Double?
    public let trend: [Point]?
    public init(kg: Double? = nil, deltaKg: Double? = nil, measuredOn: String? = nil, targetKg: Double? = nil, prevWeekMeanKg: Double? = nil, trend: [Point]? = nil) {
      self.kg = kg
      self.deltaKg = deltaKg
      self.measuredOn = measuredOn
      self.targetKg = targetKg
      self.prevWeekMeanKg = prevWeekMeanKg
      self.trend = trend
    }
  }
  public struct Macros: Codable, Sendable, Equatable {
    public let kcal: Double?
    public let kcalGoal: Double?
    public let proteinG: Double?
    public let proteinGoalG: Double?
    public let carbsG: Double?
    public let carbsGoalG: Double?
    public let fatG: Double?
    public let fatGoalG: Double?
    /// Seven days of intake, oldest first. Lifestyle scope.
    public let kcalTrend: [Point]?
    public init(kcal: Double? = nil, kcalGoal: Double? = nil, proteinG: Double? = nil, proteinGoalG: Double? = nil, carbsG: Double? = nil, carbsGoalG: Double? = nil, fatG: Double? = nil, fatGoalG: Double? = nil, kcalTrend: [Point]? = nil) {
      self.kcal = kcal
      self.kcalGoal = kcalGoal
      self.proteinG = proteinG
      self.proteinGoalG = proteinGoalG
      self.carbsG = carbsG
      self.carbsGoalG = carbsGoalG
      self.fatG = fatG
      self.fatGoalG = fatGoalG
      self.kcalTrend = kcalTrend
    }
  }
  public struct Water: Codable, Sendable, Equatable {
    public let ml: Double?
    public let goalMl: Double?
    /// Seven days of intake, oldest first. Lifestyle scope — without it a Water
    /// face above Small has one number and a goal, which is a Small's worth of
    /// content however much room it is given.
    public let trend: [Point]?
    public init(ml: Double? = nil, goalMl: Double? = nil, trend: [Point]? = nil) {
      self.ml = ml
      self.goalMl = goalMl
      self.trend = trend
    }
  }
  public struct Steps: Codable, Sendable, Equatable {
    public let count: Int?
    public let goal: Int?
    public let distanceM: Double?
    public let activeKcal: Double?
    public let trend: [Point]?
    public init(count: Int? = nil, goal: Int? = nil, distanceM: Double? = nil, activeKcal: Double? = nil, trend: [Point]? = nil) {
      self.count = count
      self.goal = goal
      self.distanceM = distanceM
      self.activeKcal = activeKcal
      self.trend = trend
    }
  }
  public struct Workout: Codable, Sendable, Equatable {
    public let label: String
    public let dayKey: String?
    public let logged: Bool
    public let isRestDay: Bool
    /// What the PLAN asks of today, phase-resolved server-side. Optional so a
    /// build talking to an older deployment still decodes; nil renders as "—",
    /// never as a zero, because on a training day a zero reads as "nothing to
    /// do".
    public let plannedExercises: Int?
    public let plannedSets: Int?
    /// Tonnage the last time this same `dayKey` was trained — the number the
    /// due state is chasing.
    public let lastVolumeKg: Double?
    public init(label: String, dayKey: String? = nil, logged: Bool, isRestDay: Bool, plannedExercises: Int? = nil, plannedSets: Int? = nil, lastVolumeKg: Double? = nil) {
      self.label = label
      self.dayKey = dayKey
      self.logged = logged
      self.isRestDay = isRestDay
      self.plannedExercises = plannedExercises
      self.plannedSets = plannedSets
      self.lastVolumeKg = lastVolumeKg
    }
  }
  public struct Week: Codable, Sendable, Equatable {
    public let sessions: Int
    public let volumeKg: Double
    public let prs: Int
    public let sets: Int
    /// How many training days the plan schedules — "3 sessions" needs a
    /// denominator to mean anything at a glance.
    public let sessionTarget: Int?
    public init(sessions: Int, volumeKg: Double, prs: Int, sets: Int, sessionTarget: Int? = nil) {
      self.sessions = sessions
      self.volumeKg = volumeKg
      self.prs = prs
      self.sets = sets
      self.sessionTarget = sessionTarget
    }
  }
  /// Last week's totals. No `sessionTarget`: the plan may have changed since,
  /// and a denominator from this week's plan over last week's count is a
  /// comparison of two different things.
  public struct WeekTotals: Codable, Sendable, Equatable {
    public let sessions: Int
    public let volumeKg: Double
    public let prs: Int
    public let sets: Int
    public init(sessions: Int, volumeKg: Double, prs: Int, sets: Int) {
      self.sessions = sessions
      self.volumeKg = volumeKg
      self.prs = prs
      self.sets = sets
    }
  }
  public struct Record: Codable, Sendable, Equatable, Identifiable {
    public let exercise: String
    public let axis: String
    public let value: Double
    public let reps: Int?
    public let achievedOn: String
    public var id: String { "\(exercise)-\(axis)" }
    public init(exercise: String, axis: String, value: Double, reps: Int? = nil, achievedOn: String) {
      self.exercise = exercise
      self.axis = axis
      self.value = value
      self.reps = reps
      self.achievedOn = achievedOn
    }
  }
  public struct E1rm: Codable, Sendable, Equatable, Identifiable {
    public let exercise: String
    public let kg: Double
    /// Nil when the lift has no session old enough to compare against — which
    /// is a different statement from "no change", and must not render as +0.
    public let deltaKg: Double?
    /// The per-DAY best estimate over the window, oldest first. The chip says
    /// the lift moved; the shape says whether it climbed or spiked once and gave
    /// it back, and those two want opposite decisions next session.
    public let trend: [Point]?
    public var id: String { exercise }
    public init(exercise: String, kg: Double, deltaKg: Double? = nil, trend: [Point]? = nil) {
      self.exercise = exercise
      self.kg = kg
      self.deltaKg = deltaKg
      self.trend = trend
    }
  }
  public struct FamilyVolume: Codable, Sendable, Equatable, Identifiable {
    public let family: String
    public let kg: Double
    /// Fractional by design: a secondary mover earns half a set.
    public let sets: Double
    public var id: String { family }
    public init(family: String, kg: Double, sets: Double) {
      self.family = family
      self.kg = kg
      self.sets = sets
    }
  }

  /// TODAY's logged session — distinct from `workout`, which is what the PLAN
  /// says. Null until something has actually been logged, which is exactly the
  /// difference the Today face is drawing.
  public struct Today: Codable, Sendable, Equatable {
    public let durationMin: Int?
    public let sessionRpe: Double?
    public let volumeKg: Double?
    public let setCount: Int?
    public let prCount: Int?
    public init(durationMin: Int? = nil, sessionRpe: Double? = nil, volumeKg: Double? = nil, setCount: Int? = nil, prCount: Int? = nil) {
      self.durationMin = durationMin
      self.sessionRpe = sessionRpe
      self.volumeKg = volumeKg
      self.setCount = setCount
      self.prCount = prCount
    }
  }

  /// One day of the training calendar.
  ///
  /// `dayKey` is the PLAN's key for that date, resolved server-side through
  /// `serverScheduleContext` so a swap moves it — and it is what tints the ring
  /// (`Helix.day`). `logged` is whether a session actually landed. The two
  /// disagreeing is the whole point of the surface.
  public struct CalendarDay: Codable, Sendable, Equatable, Identifiable {
    public let d: String
    public let dayKey: String?
    /// The plan's own name for the day — "Legs & Core B". Nil on a rest day.
    /// A colour identifies a session; it cannot name one.
    public let label: String?
    /// False on a scheduled rest day.
    public let scheduled: Bool
    public let logged: Bool
    public let volumeKg: Double?
    public var id: String { d }
    public init(d: String, dayKey: String? = nil, label: String? = nil, scheduled: Bool, logged: Bool, volumeKg: Double? = nil) {
      self.d = d
      self.dayKey = dayKey
      self.label = label
      self.scheduled = scheduled
      self.logged = logged
      self.volumeKg = volumeKg
    }
  }

  /// Cardio: the last session, and how the week stands against Zone 2.
  ///
  /// ── ZONE 2 IS A COUNT OF SESSIONS ──────────────────────────────────────────
  /// `weekSessions` counts sessions at or over 20 minutes, against `weekTarget`
  /// (2). It is NOT a minute total, and `weekMinutes` beside it is deliberately
  /// labelled as minutes so the two can never be confused. The app draws one pip
  /// per session in the CardioLogger; a widget counting minutes under the same
  /// words would disagree with it on the same phone, which is the failure the
  /// streak already taught this project once.
  public struct Cardio: Codable, Sendable, Equatable {
    public struct Session: Codable, Sendable, Equatable {
      public let kind: String
      public let date: String
      public let distanceM: Double?
      public let durationMin: Double?
      /// Minutes per kilometre, computed SERVER-side. Pace there is a minimum
      /// with a 1 km floor; recomputing it here would be a second chance to get
      /// that wrong.
      public let paceMinPerKm: Double?
      public init(kind: String, date: String, distanceM: Double? = nil, durationMin: Double? = nil, paceMinPerKm: Double? = nil) {
        self.kind = kind
        self.date = date
        self.distanceM = distanceM
        self.durationMin = durationMin
        self.paceMinPerKm = paceMinPerKm
      }
    }
    public let last: Session?
    public let weekSessions: Int
    public let weekTarget: Int
    public let weekMinutes: Int
    public let trend: [Point]?
    public init(last: Session? = nil, weekSessions: Int, weekTarget: Int, weekMinutes: Int, trend: [Point]? = nil) {
      self.last = last
      self.weekSessions = weekSessions
      self.weekTarget = weekTarget
      self.weekMinutes = weekMinutes
      self.trend = trend
    }
  }

  /// The program day, twice.
  ///
  /// `current` is days elapsed since the cut opened (2026-07-15), both ends
  /// counted — a figure that only rises. `best` carries the same number: the
  /// shape predates the redefinition and a monotonic count has no separate
  /// record, so reporting them as equal is the honest answer rather than an
  /// omission. See `lib/training/streak.ts` for why the consecutive-days walk
  /// is still derived and no longer rendered.
  public struct Streak: Codable, Sendable, Equatable {
    public let current: Int
    public let best: Int
    public init(current: Int, best: Int) {
      self.current = current
      self.best = best
    }
  }

  /// One overnight reading, with the normal it is read against.
  ///
  /// `baseline` is computed SERVER-side over a fortnight, excluding today. A
  /// widget that averaged its own seven-point trend would be a second
  /// definition of "normal" and would disagree with the app the first time the
  /// windows differed by a day — the same class of split the streak taught this
  /// project once already.
  public struct Vital: Codable, Sendable, Equatable {
    public let value: Double?
    public let baseline: Double?
    public let trend: [Point]?

    /// How far tonight sits from your own normal, or nil when either is missing.
    public var delta: Double? {
      guard let value, let baseline else { return nil }
      return value - baseline
    }
    public init(value: Double? = nil, baseline: Double? = nil, trend: [Point]? = nil) {
      self.value = value
      self.baseline = baseline
      self.trend = trend
    }
  }

  /// The five readings a watch takes overnight.
  ///
  /// Steps and sleep are deliberately absent: they have their own blocks with
  /// their own goals, and the Vitals faces read those. Duplicating them here
  /// would be two payload fields that must agree and one day would not.
  public struct Vitals: Codable, Sendable, Equatable {
    public let hrvMs: Vital?
    public let restingBpm: Vital?
    public let wristTempDeltaC: Vital?
    public let bloodOxygenPct: Vital?
    public let respiratoryRate: Vital?
    public init(hrvMs: Vital? = nil, restingBpm: Vital? = nil, wristTempDeltaC: Vital? = nil, bloodOxygenPct: Vital? = nil, respiratoryRate: Vital? = nil) {
      self.hrvMs = hrvMs
      self.restingBpm = restingBpm
      self.wristTempDeltaC = wristTempDeltaC
      self.bloodOxygenPct = bloodOxygenPct
      self.respiratoryRate = respiratoryRate
    }
  }

  /// The five sub-scores behind the composite.
  ///
  /// `Double`, not `Int`: these are `numeric` columns read straight out of
  /// `daily_scores`, and a single 82.4 in the payload makes an Int decoder throw
  /// — which surfaces as "can't reach HELIX", blaming the network for a type.
  public struct Scores: Codable, Sendable, Equatable {
    public let sleep: Double?
    public let nutrition: Double?
    public let activity: Double?
    public let workout: Double?
    public let recovery: Double?
    public init(sleep: Double? = nil, nutrition: Double? = nil, activity: Double? = nil, workout: Double? = nil, recovery: Double? = nil) {
      self.sleep = sleep
      self.nutrition = nutrition
      self.activity = activity
      self.workout = workout
      self.recovery = recovery
    }
  }

  /// Today's readiness verdict, as `computeReadiness` grades it. `color` is a
  /// hex string from the same palette — parsed, never guessed at.
  public struct Readiness: Codable, Sendable, Equatable {
    public let level: String
    public let label: String
    public let color: String
    public let reason: String
    public init(level: String, label: String, color: String, reason: String) {
      self.level = level
      self.label = label
      self.color = color
      self.reason = reason
    }
  }

  /// Body composition beyond the scale weight.
  ///
  /// Three DIFFERENT measurements, never interchangeable: `smmKg` is skeletal
  /// muscle (~27 kg, entered by hand), `muscleKg` is lean soft tissue (~50 kg,
  /// and must be LABELLED as such), `ffmKg` is fat-free mass (~53 kg, derived).
  public struct Body: Codable, Sendable, Equatable {
    public let fatPct: Double?
    public let muscleKg: Double?
    public let smmKg: Double?
    public let ffmKg: Double?
    /// Movement since the previous DIFFERENT reading of that field. The table
    /// carries values forward, so a row-to-row delta would be 0.0 on every day
    /// between weigh-ins — "held steady" where the truth is "not measured".
    public let fatPctDelta: Double?
    public let muscleKgDelta: Double?
    public let smmKgDelta: Double?
    public let ffmKgDelta: Double?
    public let fatTrend: [Point]?
    public init(fatPct: Double? = nil, muscleKg: Double? = nil, smmKg: Double? = nil, ffmKg: Double? = nil, fatPctDelta: Double? = nil, muscleKgDelta: Double? = nil, smmKgDelta: Double? = nil, ffmKgDelta: Double? = nil, fatTrend: [Point]? = nil) {
      self.fatPct = fatPct
      self.muscleKg = muscleKg
      self.smmKg = smmKg
      self.ffmKg = ffmKg
      self.fatPctDelta = fatPctDelta
      self.muscleKgDelta = muscleKgDelta
      self.smmKgDelta = smmKgDelta
      self.ffmKgDelta = ffmKgDelta
      self.fatTrend = fatTrend
    }
  }

  /// A declared context, as the server writes it: the vocabulary key and the
  /// label to draw. The label comes down rather than being mapped here so the
  /// two sides cannot disagree about what "refeed" is called.
  public struct DayContext: Codable, Sendable, Equatable {
    public let mode: String
    public let label: String
    public init(mode: String, label: String) {
      self.mode = mode
      self.label = label
    }
  }

  public let date: String
  public let generatedAt: String
  /// Echoed by the server so a cache can be keyed on it. Optional so a build
  /// talking to an older deployment still decodes.
  public let scope: String?
  public let battery: Int?
  public let score: Int?
  public let sleep: Sleep
  public let weight: Weight
  public let macros: Macros
  public let water: Water
  public let steps: Steps
  public let workout: Workout
  public let week: Week
  public let weekPrev: WeekTotals?
  public let records: [Record]?
  public let e1rm: [E1rm]?
  public let volumeByFamily: [FamilyVolume]?

  // ── Added with the four configurable families ──────────────────────────────
  // Every one is OPTIONAL, including `today`, which the server sends in all
  // scopes as `null` on a day with no session. A build talking to a deployment
  // from before these existed still decodes; the faces render "—", which is
  // what they do for a missing reading anyway.
  public let today: Today?
  public let streak: Streak?
  /// The day's declared context (Illness, Travel, Refeed…), or nil for an
  /// ordinary day. A widget that presents a sick day as a normal one is the
  /// surface most likely to be believed and least able to explain itself.
  public let context: DayContext?
  public let cardio: Cardio?
  public let calendar: [CalendarDay]?
  public let volumeTrend: [Point]?
  public let body: Body?
  public let scores: Scores?
  public let readiness: Readiness?
  /// Lifestyle scope. Absent on an older deployment; every face treats that as
  /// "no readings", which is the same thing it renders for a night off-wrist.
  public let vitals: Vitals?
  public init(date: String, generatedAt: String, scope: String? = nil, battery: Int? = nil, score: Int? = nil, sleep: Sleep, weight: Weight, macros: Macros, water: Water, steps: Steps, workout: Workout, week: Week, weekPrev: WeekTotals? = nil, records: [Record]? = nil, e1rm: [E1rm]? = nil, volumeByFamily: [FamilyVolume]? = nil, today: Today? = nil, streak: Streak? = nil, context: DayContext? = nil, cardio: Cardio? = nil, calendar: [CalendarDay]? = nil, volumeTrend: [Point]? = nil, body: Body? = nil, scores: Scores? = nil, readiness: Readiness? = nil, vitals: Vitals? = nil) {
    self.date = date
    self.generatedAt = generatedAt
    self.scope = scope
    self.battery = battery
    self.score = score
    self.sleep = sleep
    self.weight = weight
    self.macros = macros
    self.water = water
    self.steps = steps
    self.workout = workout
    self.week = week
    self.weekPrev = weekPrev
    self.records = records
    self.e1rm = e1rm
    self.volumeByFamily = volumeByFamily
    self.today = today
    self.streak = streak
    self.context = context
    self.cardio = cardio
    self.calendar = calendar
    self.volumeTrend = volumeTrend
    self.body = body
    self.scores = scores
    self.readiness = readiness
    self.vitals = vitals
  }
}

extension HelixSnapshot {
  /// kcal left against the goal — the small widget's headline. Nil when unknown.
  public var caloriesRemaining: Int? {
    guard let kcal = macros.kcal, let goal = macros.kcalGoal else { return nil }
    return Int((goal - kcal).rounded())
  }

  /// "8h27m" for a minute count, or "—".
  public static func formatSleep(_ minutes: Int?) -> String {
    guard let m = minutes, m > 0 else { return "—" }
    return "\(m / 60)h\(String(format: "%02d", m % 60))m"
  }

  /// Fractional progress toward a goal, clamped to 0...1 (nil when unknown).
  public static func progress(_ value: Double?, _ goal: Double?) -> Double? {
    guard let v = value, let g = goal, g > 0 else { return nil }
    return min(1, max(0, v / g))
  }

  /// A tonne figure for a kilogram total: "38.4 t". Nil stays nil.
  public static func tonnes(_ kg: Double?) -> String? {
    guard let kg else { return nil }
    return String(format: "%.1f t", kg / 1000)
  }

  /// "+2.5" / "−1.2" / nil. The minus is U+2212, which is the same width as the
  /// plus in a tabular face; a hyphen is not, and the column jitters.
  /// A reading at a fixed number of decimals, or nil.
  ///
  /// `String(format:)` and not a `NumberFormatter`: the vitals faces call this
  /// once per row per redraw, and a formatter allocated per call is real cost
  /// inside an extension's memory cap for output that never varies by locale —
  /// these are all monospaced-digit readings, not prose.
  public static func fixed(_ v: Double?, decimals: Int) -> String? {
    guard let v, v.isFinite else { return nil }
    return String(format: "%.\(max(0, decimals))f", v)
  }

  public static func signed(_ v: Double?, decimals: Int = 1) -> String? {
    guard let v else { return nil }
    let magnitude = String(format: "%.\(decimals)f", abs(v))
    if abs(v) < 0.05 { return magnitude }
    return (v > 0 ? "+" : "−") + magnitude
  }

  /// "3d ago" / "today" / "12 Aug" for a `YYYY-MM-DD`. Nil for an unparseable one.
  public static func relativeDay(_ iso: String?, from now: Date = Date()) -> String? {
    guard let iso, let then = dayFormatter.date(from: iso) else { return nil }
    let days = Calendar.current.dateComponents([.day], from: then, to: now).day ?? 0
    switch days {
    case ..<0:  return "today"
    case 0:     return "today"
    case 1:     return "yesterday"
    case 2...6: return "\(days)d ago"
    default:    return shortDayFormatter.string(from: then)
    }
  }

  /// "21:48" from an ISO timestamp, in the DEVICE's timezone. Bedtime read in
  /// UTC on a phone in Jerusalem is three hours wrong, every night.
  public static func clockTime(_ iso: String?) -> String? {
    guard let iso, let date = isoFormatter.date(from: iso) else { return nil }
    return clockFormatter.string(from: date)
  }

  /// An ISO timestamp → a `Date`, tolerating a missing fractional-seconds part.
  ///
  /// `generatedAt` is written by `new Date().toISOString()`, which ALWAYS
  /// carries milliseconds — but the strict formatter this file already uses
  /// rejects a timestamp without them, and Postgres-sourced values elsewhere in
  /// the payload arrive both ways. One parser that accepts both is the
  /// difference between a staleness tag that works and one that silently never
  /// fires, which is the failure mode this whole helper exists to end.
  public static func timestamp(_ iso: String?) -> Date? {
    guard let iso else { return nil }
    return isoFormatter.date(from: iso) ?? plainIsoFormatter.date(from: iso)
  }

  /// A payload age as a caption: "4m", "2h", "3d". Nil below a minute — a widget
  /// announcing it is forty seconds old is noise, not information.
  public static func shortAge(_ seconds: TimeInterval?) -> String? {
    guard let seconds, seconds >= 60 else { return nil }
    let minutes = Int(seconds / 60)
    if minutes < 60 { return "\(minutes)m" }
    let hours = minutes / 60
    if hours < 24 { return "\(hours)h" }
    return "\(hours / 24)d"
  }

  // ── Calendar helpers ───────────────────────────────────────────────────────
  //
  // ── WHY WEEKDAYS ARE DERIVED AND NEVER ASSUMED ───────────────────────────────
  // The calendar payload is a rolling window ENDING TODAY, so its first cell is
  // whatever weekday today happens to be minus forty-one. The old grid chunked it
  // seven at a time and printed a hardcoded "S M T W T F S" over the result, so
  // every column was mislabelled by however far today sat from a Sunday. These
  // read the weekday out of the DATE, which is right whatever the window start —
  // and stays right if the server later aligns the window.

  /// 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD`. Nil for an unparseable one.
  public static func weekdayIndex(_ iso: String?) -> Int? {
    guard let iso, let date = dayFormatter.date(from: iso) else { return nil }
    return Calendar.current.component(.weekday, from: date) - 1
  }

  /// "S" / "M" / "T" … for a `YYYY-MM-DD`. Empty string when undatable, so a
  /// header cell holds its column rather than collapsing the grid.
  public static func weekdayInitial(_ iso: String?) -> String {
    guard let index = weekdayIndex(iso) else { return "" }
    return ["S", "M", "T", "W", "T", "F", "S"][max(0, min(6, index))]
  }

  /// The day of the month — the number that goes INSIDE a calendar ring, and
  /// which the grid drew none of.
  public static func dayOfMonth(_ iso: String?) -> Int? {
    guard let iso, let date = dayFormatter.date(from: iso) else { return nil }
    return Calendar.current.component(.day, from: date)
  }

  /// "AUG" on the first of a month, nil otherwise. What turns six undifferentiated
  /// rows of numbers into a calendar you can find a date in.
  public static func monthMarker(_ iso: String?) -> String? {
    guard dayOfMonth(iso) == 1, let date = dayFormatter.date(from: iso ?? "") else { return nil }
    return monthFormatter.string(from: date).uppercased()
  }

  /// "August" for any date in it — the calendar grid's own title.
  ///
  /// Distinct from `monthMarker`, which is a marker INSIDE a rolling grid and is
  /// deliberately nil on every day but the first. This one always answers, and
  /// it is what let the Calendar face stop captioning a month "THIS WEEK".
  public static func monthName(_ iso: String?) -> String? {
    guard let iso, let date = dayFormatter.date(from: iso) else { return nil }
    return fullMonthFormatter.string(from: date)
  }

  /// Whether a day belongs to the same calendar month as `reference`.
  ///
  /// String prefixes, not `Calendar` — `d` is `YYYY-MM-DD` and the first seven
  /// characters ARE the month, with no parsing to get a timezone wrong in.
  public static func sameMonth(_ iso: String, as reference: String?) -> Bool {
    guard let reference, reference.count >= 7 else { return true }
    return iso.hasPrefix(reference.prefix(7))
  }
}

private let dayFormatter: DateFormatter = {
  let f = DateFormatter()
  f.dateFormat = "yyyy-MM-dd"
  f.timeZone = TimeZone.current
  return f
}()

private let shortDayFormatter: DateFormatter = {
  let f = DateFormatter()
  f.dateFormat = "d MMM"
  return f
}()

private let monthFormatter: DateFormatter = {
  let f = DateFormatter()
  f.dateFormat = "MMM"
  return f
}()

/// "August" — the grid's title, where `monthFormatter` gives the "AUG" marker.
private let fullMonthFormatter: DateFormatter = {
  let f = DateFormatter()
  f.dateFormat = "MMMM"
  return f
}()

private let clockFormatter: DateFormatter = {
  let f = DateFormatter()
  f.dateFormat = "HH:mm"
  return f
}()

nonisolated(unsafe) private let isoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  // Postgres timestamps arrive with fractional seconds; the default parser
  // rejects them outright and every bedtime would silently read as "—".
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()

/// The same thing WITHOUT fractional seconds. `ISO8601DateFormatter` is strict
/// in both directions — a parser configured for milliseconds rejects a timestamp
/// that has none — so the two are tried in turn by `timestamp(_:)`.
nonisolated(unsafe) private let plainIsoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime]
  return f
}()

