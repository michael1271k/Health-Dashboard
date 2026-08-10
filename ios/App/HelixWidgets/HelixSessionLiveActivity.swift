import ActivityKit
import WidgetKit
import SwiftUI

/**
 * The running session, on the lock screen and in the Dynamic Island.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 * The phone is in a pocket between sets. The only question it has to answer
 * without being unlocked is "how long until I lift again", and the only other
 * thing worth a glance is which lift and how far through. Everything else —
 * the deck, the history, the records — is a tap away in the app and does not
 * belong on a surface you look at for half a second.
 *
 * ── THE COUNTDOWN COSTS NOTHING ──────────────────────────────────────────────
 * `Text(timerInterval:)` is rendered and animated by the system, so the numbers
 * tick down with no update from the app at all. The alternative — pushing a
 * remaining-seconds integer once a second — is throttled by ActivityKit almost
 * immediately and the timer visibly freezes. This is why `ContentState` carries
 * `restEndsAt` as a Date rather than a duration.
 */

private enum Ink {
    static let text    = Color(white: 0.93)
    static let muted   = Color(white: 0.55)
    static let ember   = Color(red: 0.878, green: 0.439, blue: 0.235)
    static let gold    = Color(red: 0.831, green: 0.686, blue: 0.216)
    static let emerald = Color(red: 0.243, green: 0.620, blue: 0.478)
}

/// The rest countdown, or a dash when you are not resting. One definition, used
/// at four sizes, so the Island and the lock screen can never disagree.
@available(iOS 16.1, *)
private struct RestClock: View {
    let endsAt: Date?
    var font: Font = .system(.body, design: .rounded).monospacedDigit()

    var body: some View {
        if let endsAt, endsAt > .now {
            Text(timerInterval: .now...endsAt, countsDown: true)
                .font(font)
                .monospacedDigit()
                .foregroundStyle(Ink.ember)
        } else {
            // Not resting is a state worth showing, not a gap to hide.
            Text("—").font(font).foregroundStyle(Ink.muted)
        }
    }
}

private struct SetProgress: View {
    let done: Int
    let planned: Int
    var body: some View {
        Text(planned > 0 ? "\(done)/\(planned)" : "\(done)")
            .font(.system(.caption, design: .rounded).weight(.semibold))
            .monospacedDigit()
            .foregroundStyle(Ink.text)
    }
}

@available(iOS 16.1, *)
struct HelixSessionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: HelixSessionAttributes.self) { context in
            // ── Lock screen / banner ──
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.dayLabel.uppercased())
                        .font(.system(.caption2, design: .rounded).weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(Ink.muted)
                    Text(context.state.exercise)
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(Ink.text)
                        .lineLimit(1)
                    if let last = context.state.lastSet {
                        Text(last)
                            .font(.system(.caption, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Ink.muted)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    RestClock(endsAt: context.state.restEndsAt,
                              font: .system(.title2, design: .rounded).weight(.bold))
                    HStack(spacing: 6) {
                        if context.state.prCount > 0 {
                            // Gold means a record here too — the rule holds
                            // across the app boundary, not just inside it.
                            Text("\(context.state.prCount) PR")
                                .font(.system(.caption2, design: .rounded).weight(.bold))
                                .foregroundStyle(Ink.gold)
                        }
                        SetProgress(done: context.state.setsDone, planned: context.state.setsPlanned)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .activityBackgroundTint(Color.black)
            .activitySystemActionForegroundColor(Ink.text)

        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(context.attributes.dayLabel.uppercased())
                            .font(.system(.caption2, design: .rounded).weight(.bold))
                            .tracking(1.1)
                            .foregroundStyle(Ink.muted)
                        Text(context.state.exercise)
                            .font(.system(.subheadline, design: .rounded).weight(.semibold))
                            .foregroundStyle(Ink.text)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SetProgress(done: context.state.setsDone, planned: context.state.setsPlanned)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .firstTextBaseline) {
                        RestClock(endsAt: context.state.restEndsAt,
                                  font: .system(size: 34, weight: .bold, design: .rounded))
                        Spacer()
                        if let last = context.state.lastSet {
                            Text(last)
                                .font(.system(.footnote, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(Ink.muted)
                        }
                        if context.state.prCount > 0 {
                            Text("\(context.state.prCount) PR")
                                .font(.system(.footnote, design: .rounded).weight(.bold))
                                .foregroundStyle(Ink.gold)
                        }
                    }
                }
            } compactLeading: {
                // Resting reads ember; mid-set reads emerald. Two states, one
                // glance, no text needed.
                Circle()
                    .fill(context.state.restEndsAt != nil ? Ink.ember : Ink.emerald)
                    .frame(width: 8, height: 8)
            } compactTrailing: {
                RestClock(endsAt: context.state.restEndsAt,
                          font: .system(.caption, design: .rounded).weight(.semibold))
            } minimal: {
                Circle()
                    .fill(context.state.restEndsAt != nil ? Ink.ember : Ink.emerald)
                    .frame(width: 8, height: 8)
            }
            .keylineTint(Ink.ember)
        }
    }
}
