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
// ── AND WHY IT SHOWS LAST TIME RATHER THAN THIS TIME ─────────────────────────
// The phone is face-down on the bench. What you need at the moment you pick it
// up is not a number you just entered — you entered it, you know it — it is the
// number you are about to have to beat, for the set you are walking towards.
// So the hero line is the NEXT set's history: the load, the reps and the effort
// it cost last time. Everything else on the face is context around that one
// line.
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
      DynamicIsland {
        // ── EXPANDED ──
        // Four regions, and the bottom one carries the whole point: what this
        // set cost you last time. Leading and trailing hold the two live totals
        // — the only numbers that move while you lift — and the centre is the
        // movement's name, which is the thing you looked down to check.
        DynamicIslandExpandedRegion(.leading) {
          IslandStat(value: context.state.volume, label: "volume", color: Helix.ember)
        }
        DynamicIslandExpandedRegion(.trailing) {
          IslandStat(value: context.state.sets, label: "sets", color: Helix.steel)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 1) {
            Text(context.state.exercise)
              .font(.system(size: 15, weight: .bold, design: .rounded))
              .foregroundStyle(.white)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            Text(context.state.setLabel)
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(Helix.muted)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          LastTimeRow(state: context.state)
        }
      } compactLeading: {
        // The mark, monochrome. The Island's compact regions are ~44pt wide and
        // shared with whatever else is running; a two-colour logo at 16pt in
        // that space is mud.
        HelixMark(size: 15, monochrome: true)
      } compactTrailing: {
        // The load to beat, and nothing else. A compact region that has to
        // choose one number should choose the one you cannot recover from
        // memory, which is not the set count.
        Text(context.state.lastTime.isEmpty ? context.state.sets : shortLoad(context.state.lastTime))
          .font(.system(size: 13, weight: .bold, design: .rounded))
          .foregroundStyle(Color(rgb: context.state.accent))
          .lineLimit(1)
      } minimal: {
        HelixMark(size: 15, monochrome: true)
      }
      // Tapping anywhere on the Island returns to the deck. `helix://` is the
      // scheme already declared in Info.plist and handled by `deepLink.ts`.
      .widgetURL(URL(string: "helix://session"))
      .keylineTint(Color(rgb: context.state.accent))
    }
  }

  /// "3.75 kg × 16" → "3.75kg". The compact trailing region is about 44pt: the
  /// rep count does not fit beside the load, and of the two the load is the one
  /// you are walking towards a machine to set.
  private func shortLoad(_ lastTime: String) -> String {
    guard let space = lastTime.firstIndex(of: "×") else { return lastTime }
    return String(lastTime[lastTime.startIndex..<space]).replacingOccurrences(of: " ", with: "")
  }
}

// MARK: - Lock Screen

@available(iOS 16.1, *)
private struct LockScreenWorkout: View {
  let context: ActivityViewContext<HelixWorkoutAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // ── Line one: whose workout this is, and how long it has been going ──
      HStack(spacing: 6) {
        HelixMark(size: 14)
        Text(context.attributes.title)
          .font(.system(size: 13, weight: .bold, design: .rounded))
          .foregroundStyle(Color(rgb: context.state.accent))
          .lineLimit(1)
        Spacer(minLength: 4)
        // Counted by the system from a start date rather than pushed as a
        // string. ActivityKit budgets updates hard, and a clock is the last
        // thing worth spending one on — see `HelixWorkoutAttributes.startedAt`.
        Text(context.attributes.startedAt, style: .timer)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Helix.muted)
          .frame(maxWidth: 56, alignment: .trailing)
      }

      // ── Line two: the movement you are walking towards ──
      VStack(alignment: .leading, spacing: 1) {
        Text(context.state.exercise)
          .font(.system(size: 17, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
        Text(context.state.setLabel)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(Helix.muted)
      }

      LastTimeRow(state: context.state)

      // ── Line four: the two live totals, plus gold if there is gold ──
      HStack(spacing: 6) {
        Pill(text: context.state.volume + " kg", color: Helix.ember)
        Pill(text: context.state.sets + (context.state.sets == "1" ? " set" : " sets"), color: Helix.steel)
        if context.state.records > 0 {
          Pill(text: "\(context.state.records) PR" + (context.state.records == 1 ? "" : "s"), color: Helix.gold)
        }
        Spacer(minLength: 0)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }
}

// MARK: - Parts

/// The hero line, on both presentations: what this set cost you last time.
///
/// Renders NOTHING when there is no history — a new movement, or a set number
/// last week did not reach. A row saying "no previous data" would take the same
/// height as the fact it fails to state, on the surface with the least of it.
@available(iOS 16.1, *)
private struct LastTimeRow: View {
  let state: HelixWorkoutAttributes.ContentState

  var body: some View {
    if state.lastTime.isEmpty {
      EmptyView()
    } else {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text("LAST TIME")
          .font(.system(size: 9, weight: .bold))
          .tracking(1.2)
          .foregroundStyle(Helix.muted)
        Text(state.lastTime)
          .font(.system(size: 15, weight: .bold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(.white)
          .lineLimit(1)
        if !state.lastRpe.isEmpty {
          Text(state.lastRpe)
            .font(.system(size: 11, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(Helix.copper)
        }
        Spacer(minLength: 0)
      }
    }
  }
}

@available(iOS 16.1, *)
private struct IslandStat: View {
  let value: String
  let label: String
  let color: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(value)
        .font(.system(size: 15, weight: .bold, design: .rounded))
        .monospacedDigit()
        .foregroundStyle(color)
        .lineLimit(1)
      Text(label.uppercased())
        .font(.system(size: 8, weight: .bold))
        .tracking(1)
        .foregroundStyle(Helix.muted)
    }
  }
}

/// The same tinted chip the deck's collapsed bar uses, at Lock Screen scale.
@available(iOS 16.1, *)
private struct Pill: View {
  let text: String
  let color: Color

  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .bold, design: .rounded))
      .monospacedDigit()
      .foregroundStyle(color)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .stroke(color.opacity(0.28), lineWidth: 1)
      )
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
