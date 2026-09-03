import SwiftUI
import HelixCore
import HelixData

// MARK: - Sleep

/// The night, the bank, and the one thing the watch cannot see.
struct SleepTile: View {
    let model: DayModel

    private let accent = Color.helix.accent(.recover)

    var body: some View {
        DayTile("Sleep", .recover) {
            if let night = model.night {
                // Side by side until the type size says otherwise, then stacked.
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) { nightHeader(night) }
                    VStack(alignment: .leading, spacing: 2) { nightHeader(night) }
                }
                stages(night)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("—").font(.title.weight(.semibold)).helixNumeral()
                    Text("No sleep recorded for this night")
                        .font(.subheadline)
                        .foregroundStyle(Color.helix.textSecondary)
                }
                .accessibilityElement(children: .combine)
            }

            if let debt = model.sleepDebt {
                Gauge(value: min(debt.debtHours, 10), in: 0...10) {
                    Text("Sleep debt · 14-night").helixCaption()
                } currentValueLabel: {
                    Text(debt.debtHours <= 0.1 ? "settled" : "−\(DayFormat.number(debt.debtHours))h")
                        .font(.footnote.weight(.semibold))
                        .helixNumeral()
                }
                .gaugeStyle(.accessoryLinearCapacity)
                .tint(accent)
                .accessibilityLabel("Sleep debt")
                .accessibilityValue(debt.debtHours <= 0.1
                    ? "settled, over \(debt.nights) nights"
                    : "\(DayFormat.number(debt.debtHours)) hours over \(debt.nights) nights")
                Text("vs \(DayFormat.number(debt.goalHours))h goal · surplus nights repay · last week decays ×0.75")
                    .font(.caption2)
                    .foregroundStyle(Color.helix.textTertiary)
            }

            Toggle("Trouble falling asleep", isOn: Binding(
                get: { model.log?.sleepOnsetTrouble ?? false },
                set: { model.setSleepOnsetTrouble($0) }
            ))
            .tint(accent)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .helixGlass(.row)
        }
    }

    @ViewBuilder
    private func nightHeader(_ night: SleepSessionRow) -> some View {
        Text(DayFormat.minutes(night.durationMin))
            .font(.title.weight(.semibold))
            .helixNumeral()
            .accessibilityLabel("Slept \(DayFormat.minutes(night.durationMin))")
        if let score = night.sleepScore {
            Text("Score \(score)")
                .font(.subheadline)
                .foregroundStyle(Color.helix.textSecondary)
                .helixNumeral()
        }
    }

    /// Deep · REM · Core · Awake, as one bar and a legend that says the same
    /// thing in words — the bar's shades are never the only copy of the split.
    @ViewBuilder
    private func stages(_ night: SleepSessionRow) -> some View {
        let parts: [(String, Int, Color)] = [
            ("Deep", night.deepMin ?? 0, accent),
            ("REM", night.remMin ?? 0, accent.opacity(0.7)),
            ("Core", night.coreMin ?? 0, accent.opacity(0.4)),
            ("Awake", night.awakeMin ?? 0, Color.helix.textTertiary),
        ]
        let total = parts.reduce(0) { $0 + $1.1 }
        if total > 0 {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(parts, id: \.0) { part in
                        if part.1 > 0 {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(part.2)
                                .frame(width: max(2, geo.size.width * CGFloat(part.1) / CGFloat(total) - 2))
                        }
                    }
                }
            }
            .frame(height: 8)
            .accessibilityElement()
            .accessibilityLabel("Sleep stages")
            .accessibilityValue(parts.filter { $0.1 > 0 }.map { "\($0.0) \(DayFormat.minutes($0.1))" }.joined(separator: ", "))

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), alignment: .leading)], alignment: .leading, spacing: 4) {
                ForEach(parts, id: \.0) { part in
                    if part.1 > 0 {
                        HStack(spacing: 5) {
                            Circle().fill(part.2).frame(width: 6, height: 6)
                            Text("\(part.0) \(DayFormat.minutes(part.1))")
                                .font(.caption2)
                                .foregroundStyle(Color.helix.textSecondary)
                                .helixNumeral()
                        }
                    }
                }
            }
            .accessibilityHidden(true)
        }
    }
}

// MARK: - Fatigue

/// Three readings, in the words that mean the same thing in March as in August.
struct FatigueTile: View {
    let model: DayModel

    private let accent = Color.helix.accent(.recover)

    var body: some View {
        DayTile("Fatigue", .recover) {
            ForEach(model.fatigueSlots, id: \.self) { slot in
                slotRow(slot)
            }
            if model.isTraining {
                Text(Fatigue.delta(model.fatigue).map { "Session cost \($0 >= 0 ? "+" : "")\($0)" } ?? "Session cost —")
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
                    .helixNumeral()
            }
        } trailing: {
            Text(model.isTraining ? "Training day" : "Rest day")
                .helixCaption()
        }
    }

    private func slotRow(_ slot: FatigueSlot) -> some View {
        let current = model.fatigue[slot]
        return VStack(alignment: .leading, spacing: 8) {
            Text(slot.label)
                .font(.subheadline.weight(.medium))
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 58), spacing: 6)], spacing: 6) {
                ForEach(Fatigue.levels, id: \.value) { level in
                    chip(level, slot: slot, selected: current == level.value)
                }
            }
            if let detail = Fatigue.level(current)?.detail {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(Color.helix.textSecondary)
            }
        }
    }

    private func chip(_ level: FatigueLevel, slot: FatigueSlot, selected: Bool) -> some View {
        Button {
            // Tapping the chosen word again clears the slot.
            withAnimation(HelixMotion.move) { model.setFatigue(slot, level: selected ? nil : level.value) }
        } label: {
            Text(level.label)
                .font(.footnote.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(selected ? Color.helix.base : Color.helix.textPrimary)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background {
                    let shape = RoundedRectangle(cornerRadius: HelixCorner.row, style: .continuous)
                    if selected { shape.fill(accent) }
                }
        }
        .helixPress()
        .modifier(RowGlassUnlessSelected(selected: selected))
        .accessibilityLabel("\(slot.label): \(level.label)")
        .accessibilityHint(level.hint)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// `.helixGlass(.row)` only on the unselected chips; the selected one is the
/// accent and a material under a solid fill is a material nobody sees.
private struct RowGlassUnlessSelected: ViewModifier {
    let selected: Bool
    func body(content: Content) -> some View {
        if selected { content } else { content.helixGlass(.row) }
    }
}

// MARK: - Soreness

/// The body, tinted by where it hurts. The map is the interface; it is just
/// not the resting state — the tile summarises, the sheet rates.
struct DomsTile: View {
    let model: DayModel
    @State private var rating = false

    var body: some View {
        DayTile("Soreness", .recover) {
            Button { rating = true } label: {
                HStack(spacing: 16) {
                    AtlasFigure(side: .both, worked: DomsMap.worked(model.domsSeverity), monochromeTint: Color.helix.accent(.recover))
                        .frame(height: 120)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(DomsMap.summary(model.domsSeverity) ?? "No soreness logged")
                            .font(.subheadline)
                            .multilineTextAlignment(.leading)
                        Text("Rate 24–72 h after training")
                            .font(.caption)
                            .foregroundStyle(Color.helix.textSecondary)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Color.helix.textTertiary)
                }
                .contentShape(Rectangle())
            }
            .helixPress(scale: 0.98)
            .accessibilityLabel("Soreness, \(DomsMap.summary(model.domsSeverity) ?? "none logged")")
            .accessibilityHint("Opens the rating sheet")
        }
        .sheet(isPresented: $rating) {
            DomsSheet(model: model)
        }
    }
}

private struct DomsSheet: View {
    let model: DayModel

    var body: some View {
        DaySheet("Rate soreness", domain: .recover, glass: false) {
            Form {
                Section {
                    ForEach(DomsMap.muscles, id: \.self) { muscle in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(muscle)
                            Picker(muscle, selection: Binding(
                                get: { model.domsSeverity[muscle] ?? 0 },
                                set: { model.setDoms(muscle, severity: $0) }
                            )) {
                                ForEach(Array(DomsMap.levels.enumerated()), id: \.offset) { index, label in
                                    Text(label).tag(index)
                                }
                            }
                            .pickerStyle(.segmented)
                            .labelsHidden()
                            .accessibilityLabel("\(muscle) soreness")
                        }
                        .padding(.vertical, 4)
                    }
                } footer: {
                    Text("Soreness peaks a day or two after training. Ratings are a record, not an input to the score.")
                }
            }
        }
    }
}
