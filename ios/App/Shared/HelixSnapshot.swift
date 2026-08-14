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
  }
  struct Water: Codable {
    let ml: Double?
    let goalMl: Double?
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
    var id: String { exercise }
  }
  struct FamilyVolume: Codable, Identifiable {
    let family: String
    let kg: Double
    /// Fractional by design: a secondary mover earns half a set.
    let sets: Double
    var id: String { family }
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

enum HelixSnapshotClient {
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
