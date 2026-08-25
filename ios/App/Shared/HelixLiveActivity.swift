import Foundation
import ActivityKit

///  HELIX Live Activity — the shape of a running workout, on the Lock Screen and
///  in the Dynamic Island.
///
///  TARGET MEMBERSHIP: add this file to **App** and to **HelixWidgets**.
///  Both. This is the one file in the project that MUST be in two targets:
///  ActivityKit matches the app's `Activity.request` to the extension's
///  `ActivityConfiguration` by the ATTRIBUTES TYPE, and two identically-named
///  structs compiled into two modules are two different types. Getting this
///  wrong does not fail to build — the activity starts, and nothing draws.
///
///  ── WHY THIS ONE CAN CROSS THE APP-GROUP LINE AND `HelixSnapshot` CANNOT ────
///  `HelixSnapshot.swift` explains at length that App Groups are a PAID Apple
///  Developer Program capability, which is why the widget extension fetches its
///  own data over HTTP rather than reading anything the app wrote. That
///  constraint is about SHARED STORAGE, and a Live Activity does not use any:
///  the content state travels through ActivityKit itself, from `Activity.update`
///  in the app to the extension's view body, with no container in between.
///
///  So the workout can be pushed straight from the deck. Nothing is persisted,
///  nothing is fetched, and there is no token to keep fresh.
///
///  ── AND WHY EVERY FIELD IS A STRING ─────────────────────────────────────────
///  The producer is JavaScript, across a Capacitor bridge, and the consumer is a
///  SwiftUI view whose whole job is to draw text. Formatting a load as `3.75`
///  rather than `3.8` is a rule the web already owns and has already been bitten
///  by (see `weightLabel` in `SetEditorRow`); re-deriving it from a `Double` in
///  Swift would be a second implementation of a rounding rule that is allowed to
///  disagree with the first. The one non-string is `startedAt`, because a
///  duration has to be counted by the system rather than pushed every second.
@available(iOS 16.1, *)
public struct HelixWorkoutAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// The movement you are walking towards. "Lateral Raise Cable".
    public var exercise: String
    /// Which set of it, already composed: "Set 3 of 4".
    public var setLabel: String
    /// What you did on THIS set number last time — the whole point of the
    /// activity. Pre-formatted and pre-unit-ed: "3.75 kg × 16".
    ///
    /// Empty when the movement is new, or when last time had fewer sets than
    /// today does. An empty string renders as nothing at all rather than as a
    /// dash, because a Lock Screen has no room to say "no data" politely.
    public var lastTime: String
    /// Last time's effort on that set: "RPE 10". Empty when it was never rated.
    public var lastRpe: String
    /// Live session totals, formatted: "12,480 kg", "18".
    public var volume: String
    public var sets: String
    /// Records claimed so far. Zero renders as nothing — a permanent gold zero
    /// is how gold stops meaning a personal record (see `LiveSessionHero`).
    public var records: Int
    /// The workout's own colour, as `0xRRGGBB`. Sent rather than derived so the
    /// activity, the deck header and the widget cannot drift: `dayColor()` is
    /// the single source and it lives in TypeScript.
    public var accent: Int
  }

  /// The workout's name — fixed for the life of the activity, which is exactly
  /// what `ActivityAttributes` (as opposed to `ContentState`) is for.
  public var title: String
  /// When the session started, so the Island can count the duration itself with
  /// a `Text(_:style:)` timer rather than being pushed a new string every
  /// second. ActivityKit budgets updates; a clock is not worth spending them on.
  public var startedAt: Date

  public init(title: String, startedAt: Date) {
    self.title = title
    self.startedAt = startedAt
  }
}
