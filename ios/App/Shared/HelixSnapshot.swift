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

/// Mirrors `WidgetSnapshot` in src/lib/widget/snapshot.ts. Every field is
/// optional on purpose: rendering "—" is correct, rendering a stale or invented
/// number is not.
struct HelixSnapshot: Codable {
  struct Sleep: Codable {
    let minutes: Int?
    let deepMin: Int?
    let remMin: Int?
  }
  struct Weight: Codable {
    let kg: Double?
    let deltaKg: Double?
    let measuredOn: String?
  }
  struct Macros: Codable {
    let kcal: Double?
    let kcalGoal: Double?
    let proteinG: Double?
    let proteinGoalG: Double?
    let carbsG: Double?
    let fatG: Double?
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
  }
  struct Workout: Codable {
    let label: String
    let logged: Bool
    let isRestDay: Bool
  }
  struct Week: Codable {
    let sessions: Int
    let volumeKg: Double
    let prs: Int
    let sets: Int
  }

  let date: String
  let generatedAt: String
  let battery: Int?
  let score: Int?
  let sleep: Sleep
  let weight: Weight
  let macros: Macros
  let water: Water
  let steps: Steps
  let workout: Workout
  let week: Week
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
}

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
  static func fetch() async throws -> HelixSnapshot {
    guard let base = infoValue("HELIX_SNAPSHOT_URL"),
          let token = infoValue("HELIX_SNAPSHOT_TOKEN"),
          var components = URLComponents(string: base) else {
      throw HelixSnapshotError.notConfigured
    }
    components.queryItems = [URLQueryItem(name: "tz", value: TimeZone.current.identifier)]
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

  /// Fetch, falling back to the last good snapshot when the network is down.
  /// A widget that briefly shows yesterday's numbers is better than one that
  /// shows nothing — but the caller is handed `isStale` so it can say so.
  static func fetchWithFallback() async -> (snapshot: HelixSnapshot?, isStale: Bool) {
    do {
      let fresh = try await fetch()
      cache(fresh)
      return (fresh, false)
    } catch {
      return (cached(), true)
    }
  }

  // Each extension has its OWN container (no App Group on a free team), so this
  // cache is per-extension. That's fine: it only exists to survive a failed
  // refresh, not to share state between targets.
  private static let cacheKey = "helix.snapshot.cache"

  private static func cache(_ snapshot: HelixSnapshot) {
    guard let data = try? JSONEncoder().encode(snapshot) else { return }
    UserDefaults.standard.set(data, forKey: cacheKey)
  }

  private static func cached() -> HelixSnapshot? {
    guard let data = UserDefaults.standard.data(forKey: cacheKey) else { return nil }
    return try? JSONDecoder().decode(HelixSnapshot.self, from: data)
  }
}
