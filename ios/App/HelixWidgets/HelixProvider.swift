import AppIntents
import WidgetKit
import SwiftUI

// MARK: - Timeline

/// Which face a configurable widget was asked to lead with.
///
/// The entry carries it because `AppIntentConfiguration`'s content closure is
/// handed the ENTRY, not the configuration — the provider is the last place that
/// sees both, so it stamps one onto the other. Nil for the five static kinds,
/// which have nothing to configure.
enum HelixFocus {
  case lifestyle(LifestyleFocus)
  case performance(PerformanceFocus)
}

struct HelixEntry: TimelineEntry {
  let date: Date
  let snapshot: HelixSnapshot?
  let status: HelixSnapshotClient.Status
  var focus: HelixFocus?

  /// Showing a cached snapshot because the live fetch failed.
  var isStale: Bool { snapshot != nil && status != .ok }
  /// Nothing to draw at all — the diagnostic face takes over.
  var isEmpty: Bool { snapshot == nil }

  /// The configured focus, or the widget's default. A placeholder entry has no
  /// configuration at all and still has to render something.
  var lifestyleFocus: LifestyleFocus {
    if case .lifestyle(let f) = focus { return f }
    return .calories
  }
  var performanceFocus: PerformanceFocus {
    if case .performance(let f) = focus { return f }
    return .records
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
  static let successMinutesDay = 30
  static let successMinutesNight = 120
  static let failureMinutes = 5

  /// Night is 00:00–06:00 local. Deliberately not "since the last sleep sample":
  /// a widget whose refresh cadence depends on data it may have failed to fetch
  /// has a failure mode where it never refreshes again.
  static func nextRefresh(after now: Date = Date(), ok: Bool, calendar: Calendar = .current) -> Date {
    let minutes: Int
    if !ok {
      minutes = failureMinutes
    } else {
      let hour = calendar.component(.hour, from: now)
      minutes = (hour < 6) ? successMinutesNight : successMinutesDay
    }
    return calendar.date(byAdding: .minute, value: minutes, to: now)
      ?? now.addingTimeInterval(TimeInterval(minutes * 60))
  }
}

// MARK: - Providers

/// The five original `StaticConfiguration` widgets. Unchanged in behaviour so
/// nothing already sitting on a home screen is disturbed by the split.
struct HelixProvider: TimelineProvider {
  func placeholder(in context: Context) -> HelixEntry { .placeholder() }

  func getSnapshot(in context: Context, completion: @escaping (HelixEntry) -> Void) {
    Task {
      let (snap, status) = await HelixSnapshotClient.fetchWithFallback()
      completion(HelixEntry(date: Date(), snapshot: snap, status: status))
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HelixEntry>) -> Void) {
    Task {
      let (snap, status) = await HelixSnapshotClient.fetchWithFallback()
      let entry = HelixEntry(date: Date(), snapshot: snap, status: status)
      completion(Timeline(entries: [entry], policy: .after(HelixRefresh.nextRefresh(ok: status == .ok))))
    }
  }
}

/// The configurable composites. A DIFFERENT protocol from `TimelineProvider`
/// (`AppIntentTimelineProvider` receives the configuration alongside the
/// context), which is why `HelixProvider` is generalised here rather than reused.
///
/// The generic carries the intent AND the scope it implies, so a Lifestyle
/// widget can never end up fetching — or caching under — the Performance slice.
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
}

/// An intent that knows which half of the payload its widget reads, and which
/// face it was configured to lead with.
protocol HelixScoped {
  var scope: HelixScope { get }
  var helixFocus: HelixFocus { get }
}
