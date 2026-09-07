import OnyxCore
import OnyxData
import OnyxUI
import SwiftUI

/// The rest of the session, as a list.
///
/// ── WHY A LIST AND NOT A PAGER ──────────────────────────────────────────────
/// This is the one place a pager would have been defensible, and a `List` still
/// wins: the deck is up to a dozen movements, the Crown scrolls a list natively
/// with no focus contest, and "where am I in the workout" is a question you
/// answer by scanning rather than by paging.
///
/// It is reached from the toolbar rather than from a swipe, because it is a
/// reference and not a step. Nothing here is tappable: reordering a deck or
/// skipping a movement is a phone gesture, and inventing a second, smaller way
/// to do it on a wrist is how two clients start disagreeing about what a
/// session is.
struct DeckView: View {

    @Environment(WatchModel.self) private var model

    var body: some View {
        List {
            ForEach(model.movements) { movement in
                HStack(spacing: OnyxSpace.s) {
                    // Done, current, or still owed. Three states, one glyph —
                    // a progress bar per row would spend width on a fraction
                    // that "2/4" already says exactly.
                    Image(systemName: movement.isDone ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(movement.isDone ? WatchInk.commit : WatchInk.secondary)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 1) {
                        Text(movement.plan.name)
                            .font(WatchType.label)
                            .foregroundStyle(WatchInk.primary)
                            .lineLimit(2)
                            .allowsTightening(true)
                        Text("\(movement.logged.count)/\(movement.plannedSets) · \(movement.plan.reps)")
                            .font(WatchType.label)
                            .foregroundStyle(WatchInk.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .listRowBackground(
                    RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                        .fill(WatchInk.fill)
                )
                .accessibilityElement(children: .combine)
            }
        }
        .containerBackground(WatchInk.ground, for: .navigation)
        .navigationTitle("Deck")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The Control Center — readiness, the week, and what today costs.
///
/// ── IT IS ONE SWIPE FROM THE START CARD, NOT THE ROOT ───────────────────────
/// A dashboard that opens the app puts a screen between you and the set you
/// came to log. This one is reached deliberately, before a session, which is
/// the only moment its numbers change a decision.
///
/// ── AND IT DRAWS NONE OF THE PHONE'S TILES ──────────────────────────────────
/// `OnyxUI`'s tiles are fenced `#if os(iOS)` — they switch on `WidgetFamily`
/// cases that do not exist on watchOS. That fence is also the right design call:
/// a tile is a Home Screen face with a tile's information density, and at 40 mm
/// the honest version of a dashboard is four rows of text.
struct DashboardView: View {

    @Environment(WatchModel.self) private var model

    var body: some View {
        List {
            if let day = model.day {
                row("Today", day.label)
                row("Movements", "\(day.exercises(for: model.phase).count)")
                row("Phase", model.phase.label)
            } else {
                row("Today", "Rest")
            }
            if model.sessionId != nil {
                row("Logged", "\(model.sets.count) sets")
            }
            if let bpm = model.workout.heartRate {
                row("Heart", "\(bpm) bpm")
            }
        }
        .containerBackground(WatchInk.ground, for: .navigation)
        .navigationTitle("Today")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(WatchType.label)
                .foregroundStyle(WatchInk.secondary)
            Spacer(minLength: OnyxSpace.s)
            Text(value)
                .font(WatchType.label)
                .foregroundStyle(WatchInk.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .listRowBackground(
            RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
                .fill(WatchInk.fill)
        )
        .accessibilityElement(children: .combine)
    }
}
