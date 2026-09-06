import SwiftUI
import OnyxUI
import OnyxCore

/// What was trained on this date, and the door to the page that reads it
/// properly (§W11).
///
/// ── WHY THE DAY PAGE HAD NOTHING ABOUT TRAINING ON IT ───────────────────────
/// Pulse is the recovery screen and the session lives in the Workout tab, which
/// was a clean split until History started pushing this same screen for a past
/// day (§5.9). Standing on 30 August you could see the night, the vitals, the
/// scale and the soreness — and no way at all to reach the session that caused
/// every one of them. Getting there meant leaving, opening History, finding the
/// week, finding the day, and arriving back at the same date.
///
/// One card and a chevron. It states the three figures that say what kind of
/// session it was and hands the reader to `SessionDetailView`, which replays
/// the record book and draws the rest.
///
/// ── AND WHY IT IS NOT A `PulseRow` ──────────────────────────────────────────
/// Every other door on this screen opens a SHEET about the day you are already
/// on. This one pushes a different screen, and it carries three numbers rather
/// than one sentence. A row shaped like the other four that behaves unlike all
/// of them is the more expensive kind of consistency.
struct WorkoutSummaryCard: View {
    let session: DayModel.WorkoutSummary
    let onOpen: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    /// The split's own colour, as the calendar ring and the session chip draw
    /// it — a leg day is the same teal everywhere or it is decoration.
    private var tint: Color { Color.onyx.day(session.dayKey) }

    /// ── WHY A BUTTON AND NOT A `NavigationLink` ─────────────────────────────
    /// A `NavigationLink` inside a `List` row draws the system disclosure at
    /// the ROW's trailing edge — outside this card's glass, because `plainRow()`
    /// insets the row and the card fills what is left. The first build had two
    /// chevrons: one in the card's header where it belongs, and one floating in
    /// the gutter beside it. The push moves to `DayScreen`, which owns the
    /// destination for the same reason it owns every other sheet on the page.
    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                header
                figures
            }
            .padding(OnyxSpace.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onyxGlass(.tile)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .onyxPress(scale: 0.99)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Workout summary. \(session.label ?? "Session"), \(spoken)")
        .accessibilityHint("Opens the session.")
        .accessibilityAddTraits(.isButton)
    }

    private var header: some View {
        HStack(spacing: OnyxSpace.s) {
            Circle()
                .fill(tint)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            Text(session.label ?? "Session")
                .onyxType(.body).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
            Spacer(minLength: OnyxSpace.s)
            Text("Workout summary")
                .onyxMicro()
                .lineLimit(1)
            Image(systemName: "chevron.right")
                .onyxType(.caption).fontWeight(.bold)
                .foregroundStyle(Color.onyx.textTertiary)
                .accessibilityHidden(true)
        }
    }

    /// Three figures, and never a fourth: PRs are a whole-ledger replay and
    /// belong to the page this card opens (`DayModel.WorkoutSummary`).
    private var figures: some View {
        // At AX5 three columns of a label over a numeral is three ellipses.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: OnyxSpace.xs))
            : AnyLayout(HStackLayout(alignment: .top, spacing: OnyxSpace.m))
        return layout {
            figure("TONNAGE", "\(Format.volume(session.tonnageKg)) kg")
            figure("SETS", "\(session.sets)")
            figure("TIME", DayFormat.minutes(session.durationMin.map { Int($0.rounded()) }))
        }
    }

    private func figure(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).onyxMicro()
            Text(value)
                .onyxType(.secondary).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: typeSize.isAccessibilitySize ? nil : .infinity, alignment: .leading)
    }

    private var spoken: String {
        var parts = ["\(Format.volume(session.tonnageKg)) kilograms", "\(session.sets) sets"]
        if let minutes = session.durationMin, minutes > 0 {
            parts.append("\(Int(minutes.rounded())) minutes")
        }
        return parts.joined(separator: ", ")
    }
}
