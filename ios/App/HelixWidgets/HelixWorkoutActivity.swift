// ActivityKit is iPhone-only: there is no Live Activity on watchOS, and no
// `ActivityConfiguration` in the watch SDK. The extension this file belongs to
// is an iOS extension, so the guard is never false in a working configuration —
// it is here so that a stray target membership (or a `--deep` sign that drags
// the bundle into a watchOS build) fails to *include* this file rather than
// failing to compile it.
#if os(iOS)
import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - The running workout, on the Lock Screen and in the Dynamic Island
//
// ── WHY THIS IS THE ONE WIDGET THAT DOES NOT FETCH ───────────────────────────
// Every other face in this extension calls `/api/widget/snapshot` for itself,
// because App Groups are a paid capability and the extension can read nothing
// the app wrote (see `HelixSnapshot.swift`). A Live Activity is exempt: its
// content arrives through ActivityKit from `Activity.update` in the app, so
// there is no container, no token and no network on this path at all. That is
// also why it can be correct SECOND BY SECOND where the others are correct to
// the half hour.
//
// ── WHAT LEADS, AND WHY IT IS NO LONGER "LAST TIME" ──────────────────────────
// The phone is face-down on the bench, and the card used to answer only one
// question — what did this set cost me last time — in the largest type on the
// face, while the set you were standing in front of had no numbers on the card
// at all. Its own load, its own reps and its own effort were all things you
// could see only by picking the phone up and unlocking it, which is the thing
// the Live Activity exists to save you.
//
// The order is now: who and which session, what the session has accumulated,
// then the set you are ON — name, ordinal, load, effort. Last time survives on
// the expanded Island only, small and muted, as the reference it always was.
// The Lock Screen omits it entirely; that face has a right-hand column and the
// session's volume curve is a better use of it than a second set of numbers.
//
// TARGET MEMBERSHIP: nothing to do. `HelixWidgets/` is a
// `PBXFileSystemSynchronizedRootGroup`, so this file is in the extension by
// virtue of being in the folder. `Shared/HelixLiveActivity.swift` needed the
// manual step and now has it: it is a member of BOTH `App` and
// `HelixWidgetsExtension` (and of neither watch target).

@available(iOS 16.1, *)
struct HelixWorkoutActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: HelixWorkoutAttributes.self) { context in
      LockScreenWorkout(context: context)
        // The Lock Screen presentation is drawn on the system's own material.
        // A solid Helix obsidian panel here reads as a black rectangle stuck to
        // the wallpaper; the tint is what makes it the app's without claiming
        // the whole surface. Same argument as the deck header's wash.
        .activityBackgroundTint(Color.black.opacity(0.55))
        .activitySystemActionForegroundColor(Helix.ember)
    } dynamicIsland: { context in
      // No `let accent = …` here, however much it would tidy the call sites
      // below: a binding turns the trailing closure into a multi-statement body,
      // which stops `DynamicIslandExpandedContentBuilder` inferring `Expanded`
      // and fails with "generic parameter 'Expanded' could not be inferred" —
      // an error that names none of the actual code.
      DynamicIsland {
        // ── EXPANDED ──
        //
        // ── WHY ALMOST EVERYTHING IS IN `.bottom` ────────────────────────────
        // The expanded presentation has four regions and they are NOT equal.
        // `.leading` and `.trailing` are the narrow columns either side of the
        // camera, and `.center` is the sliver BETWEEN them — the narrowest of
        // the three. Only `.bottom` spans the full width.
        //
        // The previous layout put a stat in each of leading and trailing and the
        // exercise name in the centre, which is why volume truncated, why the
        // set label was cramped, and why "last time" was clipped: three of the
        // four things on the card were competing for the three narrow slots
        // while the one wide slot held a single line.
        //
        // Now the flanks hold only what is genuinely short — the brand mark and
        // a timer — the centre holds nothing, and every fact that has a length
        // lives in the full-width region where it can breathe.
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 4) {
            HelixMark(size: 14, tint: Color(rgb: context.state.accent))
            Text("HELIX")
              .font(.system(size: 10, weight: .black, design: .rounded))
              .tracking(1.2)
              .foregroundStyle(.white.opacity(0.9))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.attributes.startedAt, style: .timer)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(Helix.muted)
            .frame(maxWidth: 54, alignment: .trailing)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            // Totals lead — the accumulated session, stated once, at the top.
            SessionTotals(state: context.state, accent: Color(rgb: context.state.accent))

            HStack(alignment: .bottom, spacing: 10) {
              CurrentSet(state: context.state, accent: Color(rgb: context.state.accent))
              Spacer(minLength: 6)
              VolumeSpark(values: context.state.spark, color: Color(rgb: context.state.accent))
                .frame(width: 76, height: 30)
            }

            // History last and smallest, because it is the reference and not the
            // subject. It WRAPS rather than scaling below 0.8: a load shrunk to
            // fit is a load you have to squint at mid-set.
            if !context.state.lastTime.isEmpty {
              HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("LAST TIME")
                  .font(.system(size: 8, weight: .bold))
                  .tracking(1.1)
                  .foregroundStyle(Helix.muted)
                Text(context.state.lastTime)
                  .font(.system(size: 12, weight: .bold, design: .rounded))
                  .monospacedDigit()
                  .foregroundStyle(.white.opacity(0.75))
                if !context.state.lastRpe.isEmpty {
                  Text(context.state.lastRpe)
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Helix.copper)
                }
                Spacer(minLength: 0)
              }
            }
          }
          .padding(.top, 2)
        }
      } compactLeading: {
        // ── COMPACT ──
        // Each region is roughly a 44pt slot flanking the camera. An exercise
        // name does not fit in one, in any design — so the two things that DO
        // fit are chosen for what you cannot recover from memory: where you are
        // in the exercise, and what is on the bar.
        //
        // The mark takes the session's accent instead of being forced
        // monochrome. Grey-on-black at 15pt is the "ugly logo" — a tinted mark
        // is legible at the same size and says which workout is running.
        HStack(spacing: 3) {
          HelixMark(size: 14, tint: Color(rgb: context.state.accent))
          Text(shortSet(context.state.setLabel))
            .font(.system(size: 12, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(.white.opacity(0.9))
            .lineLimit(1)
        }
      } compactTrailing: {
        // The load you are ON, not the one from last week. Falls back to the
        // set total only when the row is still blank.
        Text(context.state.load.isEmpty ? context.state.sets : shortLoad(context.state.load))
          .font(.system(size: 13, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Color(rgb: context.state.accent))
          .lineLimit(1)
      } minimal: {
        HelixMark(size: 15, tint: Color(rgb: context.state.accent))
      }
      // Tapping anywhere on the Island returns to the deck. `helix://` is the
      // scheme already declared in Info.plist and handled by `deepLink.ts`.
      .widgetURL(URL(string: "helix://session"))
      .keylineTint(Color(rgb: context.state.accent))
    }
  }

  /// "32.5 kg × 10" → "32.5×10". The compact trailing region is about 44pt, and
  /// dropping the unit buys the rep count — which is the half that changes
  /// within an exercise, and therefore the half worth showing.
  private func shortLoad(_ load: String) -> String {
    load
      .replacingOccurrences(of: " kg", with: "")
      .replacingOccurrences(of: " × ", with: "×")
  }

  /// "Set 3 of 4" → "3/4". Same region, same reason. A label that says "Every
  /// set logged" has no ordinal in it and collapses to a tick.
  private func shortSet(_ label: String) -> String {
    let parts = label.split(separator: " ")
    guard parts.count == 4, parts[0] == "Set" else { return "✓" }
    return "\(parts[1])/\(parts[3])"
  }
}

// MARK: - Lock Screen

/// The session's running totals — volume · sets · records, one hairline row.
///
/// It sits directly under the title on both surfaces. The Lock Screen used to
/// end with three tinted pills at the BOTTOM of the card, below the exercise and
/// below the history, which put the least changeable facts furthest from the
/// heading they belong to and pushed the set you were about to do into the
/// middle of the layout.
@available(iOS 16.1, *)
private struct SessionTotals: View {
  let state: HelixWorkoutAttributes.ContentState
  let accent: Color

  var body: some View {
    HStack(spacing: 5) {
      Text(state.volume + " kg")
        .foregroundStyle(accent)
      Text("·").foregroundStyle(Helix.muted.opacity(0.5))
      Text(state.sets + (state.sets == "1" ? " set" : " sets"))
        .foregroundStyle(Helix.steel)
      if state.records > 0 {
        Text("·").foregroundStyle(Helix.muted.opacity(0.5))
        // The only gold on the card, which is the point: WEEK_STATE.pr reserves
        // it app-wide for a record and nothing else.
        Text("\(state.records) PR" + (state.records == 1 ? "" : "s"))
          .foregroundStyle(Helix.gold)
      }
      Spacer(minLength: 0)
    }
    .font(.system(size: 11, weight: .bold, design: .rounded))
    .monospacedDigit()
    .lineLimit(1)
  }
}

/// Cumulative session tonnage, as a filled area.
///
/// Deliberately unlabelled and unaxed. At this size an axis is illegible and a
/// legend would cost more room than the chart, so the shape carries the only
/// claim it is making — the rate at which work is accumulating — and the exact
/// number is stated one line above in `SessionTotals`.
///
/// Draws nothing below two points: a single dot on an empty rect reads as a
/// failure to render rather than as an early session.
@available(iOS 16.1, *)
private struct VolumeSpark: View {
  let values: [Double]
  let color: Color

  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width
      let h = geo.size.height
      if values.count >= 2, let hi = values.max(), let lo = values.min(), hi > lo {
        let step = w / CGFloat(values.count - 1)
        let y: (Double) -> CGFloat = { v in h - CGFloat((v - lo) / (hi - lo)) * h }
        let points = values.enumerated().map { CGPoint(x: CGFloat($0.offset) * step, y: y($0.element)) }

        ZStack {
          Path { path in
            path.move(to: CGPoint(x: 0, y: h))
            for p in points { path.addLine(to: p) }
            path.addLine(to: CGPoint(x: w, y: h))
            path.closeSubpath()
          }
          .fill(
            LinearGradient(
              colors: [color.opacity(0.35), color.opacity(0.02)],
              startPoint: .top, endPoint: .bottom
            )
          )
          Path { path in
            path.move(to: points[0])
            for p in points.dropFirst() { path.addLine(to: p) }
          }
          .stroke(color, style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        }
      }
    }
  }
}

/// The set you are standing in front of: name, ordinal, load, effort.
///
/// This is the card's subject. `lastTime` is context and is drawn — smaller,
/// muted, and only where there is room for it — by whichever surface has the
/// space; the Lock Screen leaves it out entirely, because the brief was that the
/// exercise block shows the current set and nothing else.
@available(iOS 16.1, *)
private struct CurrentSet: View {
  let state: HelixWorkoutAttributes.ContentState
  let accent: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(state.exercise)
        .font(.system(size: 17, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      Text(state.setLabel)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(Helix.muted)
      if !state.load.isEmpty || !state.rpe.isEmpty {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          if !state.load.isEmpty {
            Text(state.load)
              .font(.system(size: 15, weight: .bold, design: .rounded))
              .monospacedDigit()
              .foregroundStyle(accent)
              .lineLimit(1)
          }
          if !state.rpe.isEmpty {
            Text(state.rpe)
              .font(.system(size: 11, weight: .bold, design: .rounded))
              .monospacedDigit()
              .foregroundStyle(Helix.copper)
          }
        }
        .padding(.top, 1)
      }
    }
  }
}

/// The Lock Screen card.
///
/// ── THE ORDER IS THE ARGUMENT ────────────────────────────────────────────────
/// Brand and session, then what the session has accumulated, then the set you
/// are about to do. Previously the largest thing on the card was LAST TIME — the
/// history — while the set you were walking towards had no numbers at all, and
/// the totals were three pills stranded at the bottom.
///
/// The right column was empty. It now carries the session's volume curve, which
/// is the one fact that benefits from a shape rather than a figure.
@available(iOS 16.1, *)
private struct LockScreenWorkout: View {
  let context: ActivityViewContext<HelixWorkoutAttributes>

  var body: some View {
    let accent = Color(rgb: context.state.accent)

    VStack(alignment: .leading, spacing: 7) {
      // Brand lockup, top-left: the mark, the name, then the session.
      HStack(spacing: 5) {
        HelixMark(size: 15)
        Text("HELIX")
          .font(.system(size: 11, weight: .black, design: .rounded))
          .tracking(1.4)
          .foregroundStyle(.white.opacity(0.92))
        Text("·")
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(Helix.muted.opacity(0.5))
        Text(context.attributes.title)
          .font(.system(size: 13, weight: .bold, design: .rounded))
          .foregroundStyle(accent)
          .lineLimit(1)
        Spacer(minLength: 4)
        Text(context.attributes.startedAt, style: .timer)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Helix.muted)
          .frame(maxWidth: 56, alignment: .trailing)
      }

      SessionTotals(state: context.state, accent: Color(rgb: context.state.accent))

      HStack(alignment: .bottom, spacing: 12) {
        CurrentSet(state: context.state, accent: Color(rgb: context.state.accent))
        Spacer(minLength: 8)
        VolumeSpark(values: context.state.spark, color: Color(rgb: context.state.accent))
          .frame(width: 84, height: 34)
      }
      .padding(.top, 1)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }
}

/// `0xRRGGBB` from the web's own `dayColor()`, so the activity and the deck
/// header cannot disagree about which workout this is.
private extension Color {
  init(rgb: Int) {
    self.init(
      .sRGB,
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255,
      opacity: 1
    )
  }
}
#endif  // os(iOS)
