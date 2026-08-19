import AppIntents
import WidgetKit
import SwiftUI

// MARK: - Timeline

/// Which face a configurable widget was asked to lead with.
///
/// The entry carries it because `AppIntentConfiguration`'s content closure is
/// handed the ENTRY, not the configuration — the provider is the last place that
/// sees both, so it stamps one onto the other. Nil on a placeholder entry, which
/// has no configuration at all and still has to render something.
enum HelixFocus {
  case fuel(FuelFocus)
  case training(TrainingFocus)
  case body(BodyFocus)
  case vitals(VitalsFocus)
  case lock(LockFocus)
}

struct HelixEntry: TimelineEntry {
  let date: Date
  let snapshot: HelixSnapshot?
  let status: HelixSnapshotClient.Status
  var focus: HelixFocus?

  /// How old the payload on screen actually is, from its own `generatedAt`.
  ///
  /// ── WHY THIS WAS MISSING AND WHY IT MATTERS ────────────────────────────────
  /// `generatedAt` has been in the payload since the first version and no Swift
  /// line ever read it. Staleness was `status != .ok` — purely "the last fetch
  /// failed" — so a payload fetched perfectly at 06:00 and still on screen at
  /// 14:00 carried no tag at all. That is the case that matters: a widget whose
  /// numbers are eight hours old and look confident is worse than one that
  /// admits it, because it is the confident one you act on.
  ///
  /// Nil when unparseable. An unknown age must never render as a fresh one.
  var age: TimeInterval? {
    guard let iso = snapshot?.generatedAt,
          let then = HelixSnapshot.timestamp(iso) else { return nil }
    return max(0, date.timeIntervalSince(then))
  }

  /// Showing a cached snapshot because the fetch failed, OR a fresh one that has
  /// simply been on screen too long. Both mean "do not trust this to the
  /// minute"; the tag says which.
  ///
  /// 45 minutes is chosen against the cadence table: longer than the densest
  /// band (20) so an ordinary refresh never trips it, shorter than the sparsest
  /// daytime one (45) so a skipped refresh does. A tag that appears during
  /// normal operation is a tag that gets ignored.
  var isStale: Bool { snapshot != nil && (status != .ok || (age ?? 0) > 45 * 60) }
  /// Nothing to draw at all — the diagnostic face takes over.
  var isEmpty: Bool { snapshot == nil }

  /// The configured focus, or the family's default.
  var fuelFocus: FuelFocus {
    if case .fuel(let f) = focus { return f }
    return .calories
  }
  var trainingFocus: TrainingFocus {
    if case .training(let f) = focus { return f }
    return .today
  }
  var bodyFocus: BodyFocus {
    if case .body(let f) = focus { return f }
    return .weight
  }
  var vitalsFocus: VitalsFocus {
    if case .vitals(let f) = focus { return f }
    return .panel
  }
  var lockFocus: LockFocus {
    if case .lock(let f) = focus { return f }
    return .battery
  }

  static func placeholder(_ date: Date = Date()) -> HelixEntry {
    HelixEntry(date: date, snapshot: nil, status: .ok, focus: nil)
  }
}

// MARK: - Refresh policy
//
// ── WHY THE CADENCE IS NOT A CONSTANT ────────────────────────────────────────
// WidgetKit grants a widget roughly 40–70 timeline refreshes a day, shared
// across every instance of every kind. A flat 30 minutes spends 48 of them, a
// third of which land between midnight and six in the morning refreshing a
// battery nobody is looking at, on data that cannot have changed because the
// user is asleep.
//
// Spending the budget where the day is means the widget is meaningfully fresher
// during waking hours AND uses fewer refreshes overall. The failure interval
// stays short and separate: 30 minutes of "can't reach HELIX" when the phone
// regained signal 40 seconds later is a widget nobody trusts again.
//
// This is only half the story. See `HelixBackgroundRefresh.swift` in the App
// target for the other half — the timeline can only re-READ the server, and
// something has to keep the server's own numbers moving.

enum HelixRefresh {
  /// The interval to ask for, by the hour the request is made in.
  ///
  /// ── WHY NOT SIMPLY 15 MINUTES ALL DAY ──────────────────────────────────────
  /// Because that makes the widget STALER, not fresher. The grant is 40–70
  /// refreshes a day; a flat 15 minutes asks for 96, and past the grant the
  /// system does not stretch the interval, it drops the requests — so the widget
  /// sits on whatever it last got, at an hour nobody chose. The old flat 30
  /// asked for 48, already at the top of the band, and spent three of them
  /// between midnight and six on a sleeping athlete.
  ///
  /// Shaping the same budget buys roughly twice the density in the two windows
  /// where anything actually changes — the morning look, and the evening when
  /// training and dinner are logged — for FEWER refreshes than before:
  ///
  ///   00:00–06:00  150 min  ≈  2.4     asleep; the battery decays predictably
  ///   06:00–10:00   20 min  ≈ 12       sleep has landed, the day starts
  ///   10:00–17:00   45 min  ≈  9.3     at work; nothing is being logged
  ///   17:00–22:00   20 min  ≈ 15       training and the evening meal
  ///   22:00–00:00   60 min  ≈  2       winding down
  ///                                   ≈ 41 / day
  ///
  /// Mirrored in `src/lib/widget/cadence.ts` with a parity test, because there
  /// is no Swift test runner in this project and an untested budget is one that
  /// drifts past the grant without anything noticing.
  static let schedule: [(fromHour: Int, minutes: Int)] = [
    (0, 150), (6, 20), (10, 45), (17, 20), (22, 60),
  ]

  /// A failed fetch retries fast and separately. Thirty minutes of "can't reach
  /// HELIX" when the phone regained signal forty seconds later is a widget
  /// nobody trusts again.
  static let failureMinutes = 5

  /// The interval for a given local hour.
  static func minutes(forHour hour: Int) -> Int {
    // Last band whose start is at or before the hour. The table is ordered and
    // starts at 0, so there is always one.
    schedule.last { hour >= $0.fromHour }?.minutes ?? 30
  }

  /// Deliberately keyed on the CLOCK, not on "since the last sleep sample": a
  /// widget whose cadence depends on data it may have failed to fetch has a
  /// failure mode where it never refreshes again.
  static func nextRefresh(after now: Date = Date(), ok: Bool, calendar: Calendar = .current) -> Date {
    let minutes = ok ? minutes(forHour: calendar.component(.hour, from: now)) : failureMinutes
    return calendar.date(byAdding: .minute, value: minutes, to: now)
      ?? now.addingTimeInterval(TimeInterval(minutes * 60))
  }
}

// MARK: - Providers

/// The one provider. `AppIntentTimelineProvider` receives the configuration
/// alongside the context, which plain `TimelineProvider` does not — and now that
/// the five static kinds are gone, nothing needs the plain one.
///
/// The generic carries the intent AND the scope it implies, so a Fuel widget can
/// never end up fetching — or caching under — the Training slice.
struct HelixIntentProvider<Intent: WidgetConfigurationIntent & HelixScoped>: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> HelixEntry { .placeholder() }

  func snapshot(for configuration: Intent, in context: Context) async -> HelixEntry {
    let (snap, status) = await HelixSnapshotClient.fetchWithFallback(scope: configuration.scope)
    return HelixEntry(date: Date(), snapshot: snap, status: status, focus: configuration.helixFocus)
  }

  func timeline(for configuration: Intent, in context: Context) async -> Timeline<HelixEntry> {
    let (snap, status) = await HelixSnapshotClient.fetchWithFallback(scope: configuration.scope)
    let entry = HelixEntry(date: Date(), snapshot: snap, status: status, focus: configuration.helixFocus)
    return Timeline(entries: [entry], policy: .after(HelixRefresh.nextRefresh(ok: status == .ok)))
  }

  /// One gallery tile per focus.
  ///
  /// Without this the gallery shows a single generic preview per KIND, so a
  /// family's focuses are invisible until after you have placed one and gone
  /// looking for "Edit Widget" — the choice is hidden at exactly the moment it
  /// is being made. The options come off the intent so the provider stays
  /// generic and no family can be added without declaring its own.
  func recommendations() -> [AppIntentRecommendation<Intent>] {
    Intent.galleryOptions.map { AppIntentRecommendation(intent: $0.intent, description: $0.title) }
  }
}

/// An intent that knows which slice of the payload its widget reads, which face
/// it was configured to lead with, and what to offer in the gallery.
protocol HelixScoped {
  var scope: HelixScope { get }
  var helixFocus: HelixFocus { get }
  /// One entry per focus, in the order the gallery should list them.
  static var galleryOptions: [(intent: Self, title: LocalizedStringResource)] { get }
}
