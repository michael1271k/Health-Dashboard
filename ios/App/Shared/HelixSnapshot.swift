import Foundation

///  HELIX snapshot client — shared by the Widget extension and the Watch app.
///
///  TARGET MEMBERSHIP: add this file to **HelixWidgets** and **HelixWatch**.
///  Do NOT add it to the main **App** target — the app talks to Supabase through
///  the web layer and has no use for it.
///
///  WHY THE EXTENSIONS FETCH FOR THEMSELVES:
///  the usual way to share data with an extension is an App Group, but App Groups
///  are a PAID Apple Developer Program capability — on a free personal team Xcode
///  refuses to add one ("Personal development teams do not support the App Groups
///  capability"). Extensions therefore cannot read the app's UserDefaults, files,
///  or Keychain, and cannot run Supabase auth (nowhere to persist a rotating
///  refresh token). They call `/api/widget/snapshot` with an opaque read-only
///  token instead. Side benefit: the Watch works standalone over Wi-Fi/LTE with
///  the phone out of range.
///
///  CONFIGURATION: `HELIX_SNAPSHOT_URL` and `HELIX_SNAPSHOT_TOKEN` come from
///  Secrets.xcconfig via each target's Info.plist. Secrets.xcconfig is gitignored.

// MARK: - Model

/// Which slice of the payload to ask for.
///
/// The two composite widgets read disjoint halves and an extension is measured
/// in hundreds of milliseconds against a hard memory cap. The scope only ever
/// trims the OPTIONAL extras — every non-optional property below arrives in
/// every scope, because a decode failure renders as "can't reach HELIX", which
/// would blame the network for what is really a shape mismatch.
enum HelixScope: String {
  case lifestyle
  case performance
  case training
  case body
  case full
}

/// Mirrors `WidgetSnapshot` in src/lib/widget/snapshot.ts. Every field is
/// optional on purpose: rendering "—" is correct, rendering a stale or invented
/// number is not.
struct HelixSnapshot: Codable {
  /// One dated reading. Short keys — this crosses the wire thousands of times.
  struct Point: Codable, Identifiable {
    let d: String
    let v: Double
    var id: String { d }
  }

  struct Sleep: Codable {
    let minutes: Int?
    let deepMin: Int?
    let remMin: Int?
    /// Stage TOTALS, not a timeline. The rainbow is a stacked bar and must never
    /// be drawn as a hypnogram — the ordering it would imply is not in the data.
    let coreMin: Int?
    let awakeMin: Int?
    let score: Int?
    let startTime: String?
    let endTime: String?
    /// The user's own target, in minutes. The sleep face hardcoded 480, so a
    /// seven-hour goal was graded against someone else's eight.
    let goalMin: Int?
    /// Seven nights of duration, oldest first. Body scope. One night is a
    /// reading; seven is the thing worth changing a bedtime over.
    let trend: [Point]?
  }
  struct Weight: Codable {
    let kg: Double?
    let deltaKg: Double?
    let measuredOn: String?
    let targetKg: Double?
    /// Last week's mean — the dotted baseline the fortnight is read against.
    /// Nil, never zero: a 0 kg baseline would draw an ordinary fortnight as a
    /// catastrophic gain.
    let prevWeekMeanKg: Double?
    let trend: [Point]?
  }
  struct Macros: Codable {
    let kcal: Double?
    let kcalGoal: Double?
    let proteinG: Double?
    let proteinGoalG: Double?
    let carbsG: Double?
    let carbsGoalG: Double?
    let fatG: Double?
    let fatGoalG: Double?
    /// Seven days of intake, oldest first. Lifestyle scope.
    let kcalTrend: [Point]?
  }
  struct Water: Codable {
    let ml: Double?
    let goalMl: Double?
    /// Seven days of intake, oldest first. Lifestyle scope — without it a Water
    /// face above Small has one number and a goal, which is a Small's worth of
    /// content however much room it is given.
    let trend: [Point]?
  }
  struct Steps: Codable {
    let count: Int?
    let goal: Int?
    let distanceM: Double?
    let activeKcal: Double?
    let trend: [Point]?
  }
  struct Workout: Codable {
    let label: String
    let dayKey: String?
    let logged: Bool
    let isRestDay: Bool
    /// What the PLAN asks of today, phase-resolved server-side. Optional so a
    /// build talking to an older deployment still decodes; nil renders as "—",
    /// never as a zero, because on a training day a zero reads as "nothing to
    /// do".
    let plannedExercises: Int?
    let plannedSets: Int?
    /// Tonnage the last time this same `dayKey` was trained — the number the
    /// due state is chasing.
    let lastVolumeKg: Double?
  }
  struct Week: Codable {
    let sessions: Int
    let volumeKg: Double
    let prs: Int
    let sets: Int
    /// How many training days the plan schedules — "3 sessions" needs a
    /// denominator to mean anything at a glance.
    let sessionTarget: Int?
  }
  /// Last week's totals. No `sessionTarget`: the plan may have changed since,
  /// and a denominator from this week's plan over last week's count is a
  /// comparison of two different things.
  struct WeekTotals: Codable {
    let sessions: Int
    let volumeKg: Double
    let prs: Int
    let sets: Int
  }
  struct Record: Codable, Identifiable {
    let exercise: String
    let axis: String
    let value: Double
    let reps: Int?
    let achievedOn: String
    var id: String { "\(exercise)-\(axis)" }
  }
  struct E1rm: Codable, Identifiable {
    let exercise: String
    let kg: Double
    /// Nil when the lift has no session old enough to compare against — which
    /// is a different statement from "no change", and must not render as +0.
    let deltaKg: Double?
    /// The per-DAY best estimate over the window, oldest first. The chip says
    /// the lift moved; the shape says whether it climbed or spiked once and gave
    /// it back, and those two want opposite decisions next session.
    let trend: [Point]?
    var id: String { exercise }
  }
  struct FamilyVolume: Codable, Identifiable {
    let family: String
    let kg: Double
    /// Fractional by design: a secondary mover earns half a set.
    let sets: Double
    var id: String { family }
  }

  /// TODAY's logged session — distinct from `workout`, which is what the PLAN
  /// says. Null until something has actually been logged, which is exactly the
  /// difference the Today face is drawing.
  struct Today: Codable {
    let durationMin: Int?
    let sessionRpe: Double?
    let volumeKg: Double?
    let setCount: Int?
    let prCount: Int?
  }

  /// One day of the training calendar.
  ///
  /// `dayKey` is the PLAN's key for that date, resolved server-side through
  /// `serverScheduleContext` so a swap moves it — and it is what tints the ring
  /// (`Helix.day`). `logged` is whether a session actually landed. The two
  /// disagreeing is the whole point of the surface.
  struct CalendarDay: Codable, Identifiable {
    let d: String
    let dayKey: String?
    /// The plan's own name for the day — "Legs & Core B". Nil on a rest day.
    /// A colour identifies a session; it cannot name one.
    let label: String?
    /// False on a scheduled rest day.
    let scheduled: Bool
    let logged: Bool
    let volumeKg: Double?
    var id: String { d }
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
  struct Cardio: Codable {
    struct Session: Codable {
      let kind: String
      let date: String
      let distanceM: Double?
      let durationMin: Double?
      /// Minutes per kilometre, computed SERVER-side. Pace there is a minimum
      /// with a 1 km floor; recomputing it here would be a second chance to get
      /// that wrong.
      let paceMinPerKm: Double?
    }
    let last: Session?
    let weekSessions: Int
    let weekTarget: Int
    let weekMinutes: Int
    let trend: [Point]?
  }

  /// Consistency in two numbers. `current` counts backwards over SCHEDULED
  /// training days only, so Wednesday and Saturday rest never breaks it.
  struct Streak: Codable {
    let current: Int
    let best: Int
  }

  /// The five sub-scores behind the composite.
  ///
  /// `Double`, not `Int`: these are `numeric` columns read straight out of
  /// `daily_scores`, and a single 82.4 in the payload makes an Int decoder throw
  /// — which surfaces as "can't reach HELIX", blaming the network for a type.
  struct Scores: Codable {
    let sleep: Double?
    let nutrition: Double?
    let activity: Double?
    let workout: Double?
    let recovery: Double?
  }

  /// Today's readiness verdict, as `computeReadiness` grades it. `color` is a
  /// hex string from the same palette — parsed, never guessed at.
  struct Readiness: Codable {
    let level: String
    let label: String
    let color: String
    let reason: String
  }

  /// Body composition beyond the scale weight.
  ///
  /// Three DIFFERENT measurements, never interchangeable: `smmKg` is skeletal
  /// muscle (~27 kg, entered by hand), `muscleKg` is lean soft tissue (~50 kg,
  /// and must be LABELLED as such), `ffmKg` is fat-free mass (~53 kg, derived).
  struct Body: Codable {
    let fatPct: Double?
    let muscleKg: Double?
    let smmKg: Double?
    let ffmKg: Double?
    /// Movement since the previous DIFFERENT reading of that field. The table
    /// carries values forward, so a row-to-row delta would be 0.0 on every day
    /// between weigh-ins — "held steady" where the truth is "not measured".
    let fatPctDelta: Double?
    let muscleKgDelta: Double?
    let smmKgDelta: Double?
    let ffmKgDelta: Double?
    let fatTrend: [Point]?
  }

  /// A declared context, as the server writes it: the vocabulary key and the
  /// label to draw. The label comes down rather than being mapped here so the
  /// two sides cannot disagree about what "refeed" is called.
  struct DayContext: Codable {
    let mode: String
    let label: String
  }

  let date: String
  let generatedAt: String
  /// Echoed by the server so a cache can be keyed on it. Optional so a build
  /// talking to an older deployment still decodes.
  let scope: String?
  let battery: Int?
  let score: Int?
  let sleep: Sleep
  let weight: Weight
  let macros: Macros
  let water: Water
  let steps: Steps
  let workout: Workout
  let week: Week
  let weekPrev: WeekTotals?
  let records: [Record]?
  let e1rm: [E1rm]?
  let volumeByFamily: [FamilyVolume]?

  // ── Added with the four configurable families ──────────────────────────────
  // Every one is OPTIONAL, including `today`, which the server sends in all
  // scopes as `null` on a day with no session. A build talking to a deployment
  // from before these existed still decodes; the faces render "—", which is
  // what they do for a missing reading anyway.
  let today: Today?
  let streak: Streak?
  /// The day's declared context (Illness, Travel, Refeed…), or nil for an
  /// ordinary day. A widget that presents a sick day as a normal one is the
  /// surface most likely to be believed and least able to explain itself.
  let context: DayContext?
  let cardio: Cardio?
  let calendar: [CalendarDay]?
  let volumeTrend: [Point]?
  let body: Body?
  let scores: Scores?
  let readiness: Readiness?
}

extension HelixSnapshot {
  /// kcal left against the goal — the small widget's headline. Nil when unknown.
  var caloriesRemaining: Int? {
    guard let kcal = macros.kcal, let goal = macros.kcalGoal else { return nil }
    return Int((goal - kcal).rounded())
  }

  /// "8h27m" for a minute count, or "—".
  static func formatSleep(_ minutes: Int?) -> String {
    guard let m = minutes, m > 0 else { return "—" }
    return "\(m / 60)h\(String(format: "%02d", m % 60))m"
  }

  /// Fractional progress toward a goal, clamped to 0...1 (nil when unknown).
  static func progress(_ value: Double?, _ goal: Double?) -> Double? {
    guard let v = value, let g = goal, g > 0 else { return nil }
    return min(1, max(0, v / g))
  }

  /// A tonne figure for a kilogram total: "38.4 t". Nil stays nil.
  static func tonnes(_ kg: Double?) -> String? {
    guard let kg else { return nil }
    return String(format: "%.1f t", kg / 1000)
  }

  /// "+2.5" / "−1.2" / nil. The minus is U+2212, which is the same width as the
  /// plus in a tabular face; a hyphen is not, and the column jitters.
  static func signed(_ v: Double?, decimals: Int = 1) -> String? {
    guard let v else { return nil }
    let magnitude = String(format: "%.\(decimals)f", abs(v))
    if abs(v) < 0.05 { return magnitude }
    return (v > 0 ? "+" : "−") + magnitude
  }

  /// "3d ago" / "today" / "12 Aug" for a `YYYY-MM-DD`. Nil for an unparseable one.
  static func relativeDay(_ iso: String?, from now: Date = Date()) -> String? {
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
  static func clockTime(_ iso: String?) -> String? {
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
  static func timestamp(_ iso: String?) -> Date? {
    guard let iso else { return nil }
    return isoFormatter.date(from: iso) ?? plainIsoFormatter.date(from: iso)
  }

  /// A payload age as a caption: "4m", "2h", "3d". Nil below a minute — a widget
  /// announcing it is forty seconds old is noise, not information.
  static func shortAge(_ seconds: TimeInterval?) -> String? {
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
  static func weekdayIndex(_ iso: String?) -> Int? {
    guard let iso, let date = dayFormatter.date(from: iso) else { return nil }
    return Calendar.current.component(.weekday, from: date) - 1
  }

  /// "S" / "M" / "T" … for a `YYYY-MM-DD`. Empty string when undatable, so a
  /// header cell holds its column rather than collapsing the grid.
  static func weekdayInitial(_ iso: String?) -> String {
    guard let index = weekdayIndex(iso) else { return "" }
    return ["S", "M", "T", "W", "T", "F", "S"][max(0, min(6, index))]
  }

  /// The day of the month — the number that goes INSIDE a calendar ring, and
  /// which the grid drew none of.
  static func dayOfMonth(_ iso: String?) -> Int? {
    guard let iso, let date = dayFormatter.date(from: iso) else { return nil }
    return Calendar.current.component(.day, from: date)
  }

  /// "AUG" on the first of a month, nil otherwise. What turns six undifferentiated
  /// rows of numbers into a calendar you can find a date in.
  static func monthMarker(_ iso: String?) -> String? {
    guard dayOfMonth(iso) == 1, let date = dayFormatter.date(from: iso ?? "") else { return nil }
    return monthFormatter.string(from: date).uppercased()
  }

  /// "August" for any date in it — the calendar grid's own title.
  ///
  /// Distinct from `monthMarker`, which is a marker INSIDE a rolling grid and is
  /// deliberately nil on every day but the first. This one always answers, and
  /// it is what let the Calendar face stop captioning a month "THIS WEEK".
  static func monthName(_ iso: String?) -> String? {
    guard let iso, let date = dayFormatter.date(from: iso) else { return nil }
    return fullMonthFormatter.string(from: date)
  }

  /// Whether a day belongs to the same calendar month as `reference`.
  ///
  /// String prefixes, not `Calendar` — `d` is `YYYY-MM-DD` and the first seven
  /// characters ARE the month, with no parsing to get a timezone wrong in.
  static func sameMonth(_ iso: String, as reference: String?) -> Bool {
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

private let isoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  // Postgres timestamps arrive with fractional seconds; the default parser
  // rejects them outright and every bedtime would silently read as "—".
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()

/// The same thing WITHOUT fractional seconds. `ISO8601DateFormatter` is strict
/// in both directions — a parser configured for milliseconds rejects a timestamp
/// that has none — so the two are tried in turn by `timestamp(_:)`.
private let plainIsoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime]
  return f
}()

// MARK: - Fetching

enum HelixSnapshotError: Error, LocalizedError {
  case notConfigured
  case badStatus(Int)

  var errorDescription: String? {
    switch self {
    case .notConfigured:
      return "HELIX_SNAPSHOT_URL / HELIX_SNAPSHOT_TOKEN missing from Info.plist"
    case .badStatus(let code):
      return code == 401 ? "Snapshot token rejected" : "Snapshot request failed (\(code))"
    }
  }
}

/// Where a snapshot comes from.
///
/// ── WHY A PROTOCOL FOR ONE CONFORMER ─────────────────────────────────────────
/// There is exactly one implementation and there will be exactly one until this
/// account stops being a free personal team. The seam exists because the fetch
/// path is not a design choice — it is a workaround for App Groups being a paid
/// capability (see the file header), and the day that changes, the correct
/// source becomes a shared container read with no network at all. Naming the
/// boundary now makes that a one-file swap instead of an archaeology exercise
/// across four view files.
///
/// Deliberately minimal: no caching, no status, no fallback. Those are policy
/// and belong to `HelixSnapshotClient`, which is what every caller actually uses.
protocol HelixSnapshotSource {
  static func fetch(scope: HelixScope) async throws -> HelixSnapshot
}

enum HelixSnapshotClient: HelixSnapshotSource {
  private static func infoValue(_ key: String) -> String? {
    guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  /// True when the build actually carries a URL + token, so a UI can show a
  /// "not configured" state instead of a silent permanent spinner.
  static var isConfigured: Bool {
    infoValue("HELIX_SNAPSHOT_URL") != nil && infoValue("HELIX_SNAPSHOT_TOKEN") != nil
  }

  /// Fetch the current snapshot. Sends the DEVICE's timezone — the server runs
  /// in UTC and would otherwise be a day out for part of every day.
  static func fetch(scope: HelixScope = .full) async throws -> HelixSnapshot {
    guard let base = infoValue("HELIX_SNAPSHOT_URL"),
          let token = infoValue("HELIX_SNAPSHOT_TOKEN"),
          var components = URLComponents(string: base) else {
      throw HelixSnapshotError.notConfigured
    }
    components.queryItems = [
      URLQueryItem(name: "tz", value: TimeZone.current.identifier),
      URLQueryItem(name: "scope", value: scope.rawValue),
    ]
    guard let url = components.url else { throw HelixSnapshotError.notConfigured }

    var request = URLRequest(url: url)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    // Extensions get a small time budget; fail fast rather than hang the
    // timeline and let iOS kill us mid-render.
    request.timeoutInterval = 10
    request.cachePolicy = .reloadRevalidatingCacheData

    let (data, response) = try await URLSession.shared.data(for: request)
    if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
      throw HelixSnapshotError.badStatus(http.statusCode)
    }
    return try JSONDecoder().decode(HelixSnapshot.self, from: data)
  }

  /// Why a surface has no fresh data. A widget that shows zeros is worse than
  /// one that shows nothing, and one that shows nothing is worse than one that
  /// says WHICH of these went wrong — the three have completely different fixes
  /// (edit Secrets.xcconfig, rotate the token, wait for signal) and a blank
  /// rectangle points at none of them.
  enum Status: Equatable {
    case ok
    /// No URL/token baked into the build.
    case notConfigured
    /// Reached the server; it refused the token.
    case unauthorized
    /// Could not reach it at all, or it answered with something undecodable.
    case unreachable
  }

  /// Fetch, falling back to the last good snapshot when the network is down.
  /// A widget that briefly shows yesterday's numbers is better than one that
  /// shows nothing — but the caller is handed the status so it can say so.
  static func fetchWithFallback(scope: HelixScope = .full) async -> (snapshot: HelixSnapshot?, status: Status) {
    do {
      let fresh = try await fetch(scope: scope)
      cache(fresh, scope: scope)
      return (fresh, .ok)
    } catch let error as HelixSnapshotError {
      switch error {
      case .notConfigured:            return (cached(scope), .notConfigured)
      case .badStatus(let code):      return (cached(scope), code == 401 ? .unauthorized : .unreachable)
      }
    } catch {
      return (cached(scope), .unreachable)
    }
  }

  // Each extension has its OWN container (no App Group on a free team), so this
  // cache is per-extension. That's fine: it only exists to survive a failed
  // refresh, not to share state between targets.
  //
  // ── AND PER SCOPE ───────────────────────────────────────────────────────────
  // It used to be one global slot. With two composite widgets asking for
  // different slices out of the same process, a Performance widget whose refresh
  // failed would fall back to whatever a Lifestyle widget had cached — a face
  // full of fields it never requested, and empty in the ones it did.
  private static func cacheKey(_ scope: HelixScope) -> String { "helix.snapshot.cache.\(scope.rawValue)" }

  private static func cache(_ snapshot: HelixSnapshot, scope: HelixScope) {
    guard let data = try? JSONEncoder().encode(snapshot) else { return }
    UserDefaults.standard.set(data, forKey: cacheKey(scope))
  }

  private static func cached(_ scope: HelixScope) -> HelixSnapshot? {
    let store = UserDefaults.standard
    // A `full` payload is a superset, so it is a legitimate fallback for either
    // half. The reverse is not true and is never attempted.
    for key in [cacheKey(scope), cacheKey(.full)] {
      if let data = store.data(forKey: key),
         let decoded = try? JSONDecoder().decode(HelixSnapshot.self, from: data) {
        return decoded
      }
    }
    return nil
  }
}
