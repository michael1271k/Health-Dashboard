import SwiftUI
import OnyxUI
import OnyxCore

/// How tired you said you were, in one row.
///
/// ── WHY THE CHIPS MOVED INTO A SHEET ────────────────────────────────────────
/// The tile this replaces drew three slots × five words = fifteen 44 pt chips,
/// a definition sentence under each slot and a cost line — four hundred points
/// of a permanently-open form for a reading taken once or twice a day. The row
/// states the ANSWER (the latest word, which slot it came from, how many of the
/// day's slots are in) and the form opens on a tap, which is what a form that
/// is used twice a day should do.
struct FatigueSummaryRow: View {
    let model: DayModel
    let onOpen: () -> Void

    private var day: FatigueDay { model.fatigue }
    private var slots: [FatigueSlot] { model.fatigueSlots }
    private var latest: FatigueReading? { Fatigue.latest(day) }
    private var logged: Int { slots.filter { day[$0] != nil }.count }

    /// "Before training · 2 of 3", or the invitation when nothing is logged.
    private var detail: String {
        guard let latest else { return "Not rated · 0 of \(slots.count)" }
        return "\(latest.slot.label) · \(logged) of \(slots.count)"
    }

    var body: some View {
        PulseRow(
            symbol: "battery.50",
            title: "Fatigue",
            detail: detail,
            tint: Color.onyx.fatigue(latest?.level),
            spoken: latest.map { "\(Fatigue.level($0.level)?.label ?? ""), \(detail)\(costSpoken)" } ?? detail,
            action: onOpen
        ) {
            HStack(spacing: OnyxSpace.s) {
                if let level = latest?.level, let word = Fatigue.level(level)?.label {
                    Text(word)
                        .onyxType(.body).fontWeight(.semibold)
                        .foregroundStyle(Color.onyx.fatigue(level))
                        .lineLimit(1)
                }
                cost
                dots
            }
        }
    }

    /// One dot per slot the day HAS — three on a training day, three on a rest
    /// day, and they are not the same three (`Fatigue.slotsForDay`).
    private var dots: some View {
        HStack(spacing: OnyxSpace.xs) {
            ForEach(slots, id: \.self) { slot in
                Circle()
                    .fill(day[slot] != nil ? Color.onyx.fatigue(day[slot]) : .clear)
                    .strokeBorder(day[slot] != nil ? .clear : Color.onyx.textTertiary, lineWidth: 1)
                    .frame(width: 7, height: 7)
            }
        }
        .accessibilityHidden(true)
    }

    /// What the session cost, `post` − `pre`. Absent on a rest day and on a
    /// training day missing either end — a delta against an unrated slot looks
    /// like a measurement and is not one.
    @ViewBuilder
    private var cost: some View {
        if let delta = Fatigue.delta(day) {
            Text("\(delta >= 0 ? "+" : "")\(delta)")
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(delta > 1 ? Color.onyx.record : Color.onyx.textSecondary)
                .padding(.horizontal, OnyxSpace.s)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color.onyx.hairline))
        }
    }

    private var costSpoken: String {
        Fatigue.delta(day).map { ", session cost \($0 >= 0 ? "+" : "")\($0)" } ?? ""
    }
}

/// The three slots, in the words that mean the same thing in March as in
/// August.
struct FatigueSheet: View {
    let model: DayModel

    var body: some View {
        DaySheet("Fatigue", domain: .recover, glass: false) {
            Form {
                ForEach(model.fatigueSlots, id: \.self) { slot in
                    Section {
                        picker(slot)
                        if let detail = Fatigue.level(model.fatigue[slot])?.detail {
                            Text(detail)
                                .onyxType(.caption)
                                .foregroundStyle(Color.onyx.textSecondary)
                        }
                    } header: {
                        OnyxSectionHeader(slot.label, .recover)
                    }
                }
                if model.isTraining {
                    Section {
                        Text(Fatigue.delta(model.fatigue).map {
                            "Session cost \($0 >= 0 ? "+" : "")\($0) — before against after."
                        } ?? "Rate before and after training and the session's cost appears here.")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textSecondary)
                    }
                }
            }
        }
    }

    /// A `Picker`, not five chips: five mutually exclusive words is the case
    /// the system control exists for, and it brings the VoiceOver rotor, the
    /// selected-state announcement and the "clear" path for free.
    ///
    /// Tag 0 is "not rated" and writes nil — a slot you can set and never unset
    /// is a slot that records a mistap forever.
    private func picker(_ slot: FatigueSlot) -> some View {
        Picker(slot.label, selection: Binding(
            get: { model.fatigue[slot] ?? 0 },
            set: { model.setFatigue(slot, level: $0 == 0 ? nil : $0) }
        )) {
            Text("Not rated").tag(0)
            ForEach(Fatigue.levels, id: \.value) { level in
                Text("\(level.label) — \(level.hint)").tag(level.value)
            }
        }
        .pickerStyle(.inline)
        .labelsHidden()
        .tint(Color.onyx.accent(.recover))
    }
}
