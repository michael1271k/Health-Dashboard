import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// The Fuel tab — one day's intake against the target in force that day.
///
/// ── FIVE TILES, ONE HERO ────────────────────────────────────────────────────
/// Calories eaten is the one hero figure; everything else is a gauge with its
/// numbers beside it. A `Gauge` clamps at full, so overshoot is said three ways
/// a bar cannot: the value turns to the coral end of the Solar ramp, "+N over"
/// is appended, and an exclamation glyph carries the state for anyone who cannot
/// see the colour. `nil` renders as an em dash everywhere; a day with nothing
/// logged shows empty gauges and no "0 / 1,955" anywhere.
struct FuelTabView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied only by previews and the screenshot harness. The app never
    /// passes one.
    var seeded: FuelModel?

    @State private var resolved: FuelModel?

    var body: some View {
        Group {
            if let resolved {
                FuelScreen(model: resolved)
            } else {
                ProgressView().controlSize(.large)
            }
        }
        .task {
            if resolved == nil {
                resolved = seeded ?? FuelModel(database: environment.database, userId: environment.userIdString)
            }
            await resolved?.observe()
        }
    }
}

// MARK: - The screen

private struct FuelScreen: View {
    @Environment(\.scenePhase) private var scenePhase
    let model: FuelModel

    @State private var sheet: Sheet?
    @State private var showCalendar = false

    private enum Sheet: String, Identifiable {
        case macros, target, water
        var id: String { rawValue }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: HelixSpace.l) {
                if let failure = model.failure {
                    Label(failure, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Color.helix.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .helixGlass(.tile)
                }
                MacroTile(model: model)
                EntriesTile(model: model) { sheet = .macros }
                DayTargetTile(model: model) { sheet = .target }
                FlagsTile(model: model)
                WaterTile(model: model) { sheet = .water }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .helixScreen(.fuel)
        .foregroundStyle(Color.helix.textPrimary)
        .navigationTitle(FuelFormat.dayTitle(model.date))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                toolbarButton("chevron.left", "Previous day") { model.shift(-1) }
                toolbarButton("chevron.right", "Next day") { model.shift(1) }
                    .disabled(model.isToday)
                toolbarButton("calendar", "Choose a day") { showCalendar = true }
            }
        }
        .sheet(item: $sheet) { which in
            switch which {
            case .macros: MacroOverrideSheet(model: model)
            case .target: DayTargetSheet(model: model)
            case .water: WaterSheet(model: model)
            }
        }
        .sheet(isPresented: $showCalendar) { calendar }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refreshToday() }
        }
    }

    private func toolbarButton(_ icon: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(.rect)
        }
        .accessibilityLabel(label)
    }

    private var calendar: some View {
        NavigationStack {
            DatePicker(
                "Day",
                selection: Binding(
                    get: { LogicalDay.date(fromISO: model.date) ?? Date() },
                    set: { model.select(date: LogicalDay.iso($0)) }
                ),
                in: ...(LogicalDay.date(fromISO: model.today) ?? Date()),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .tint(Color.helix.accent(.fuel))
            .padding(.horizontal, 16)
            .frame(maxHeight: .infinity, alignment: .top)
            .helixScreen(.fuel)
            .navigationTitle("Choose a day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showCalendar = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: - Macros

private struct MacroTile: View {
    let model: FuelModel

    var body: some View {
        VStack(alignment: .leading, spacing: HelixSpace.l) {
            VStack(alignment: .leading, spacing: 4) {
                Text(model.eaten.map { FuelFormat.whole($0.kcal) } ?? "—")
                    .helixHero()
                    .foregroundStyle(Color.helix.textPrimary)
                    .accessibilityLabel("Calories eaten")
                    .accessibilityValue(model.eaten.map { "\(FuelFormat.whole($0.kcal)) kilocalories" } ?? "nothing logged")
                Text(model.targetKcal.map { "of \(FuelFormat.whole($0)) kcal" } ?? "no calorie target")
                    .helixCaption()
                    .helixNumeral()
                Text(model.provenance)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.helix.accent(.fuel))
            }

            VStack(spacing: 12) {
                MacroGauge(label: "Calories", eaten: model.eaten?.kcal, target: model.targetKcal, unit: "kcal")
                MacroGauge(label: "Protein", eaten: model.eaten?.protein, target: model.target.protein, unit: "g")
                MacroGauge(label: "Carbohydrate", eaten: model.eaten?.carbs, target: model.target.carbs, unit: "g",
                           tracked: model.tracksCarbs)
                MacroGauge(label: "Fat", eaten: model.eaten?.fat, target: model.target.fat, unit: "g",
                           tracked: model.tracksFat)
            }

            // The tags are the report's bracketed form; a chip is its own bracket.
            let brackets = CharacterSet(charactersIn: "[] ")
            let exception = ExceptionDay.tag(model.dailyLog?.nutritionException).trimmingCharacters(in: brackets)
            let estimated = ExceptionDay.estimatedTag(model.isEstimated).trimmingCharacters(in: brackets)
            if !exception.isEmpty || !estimated.isEmpty {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { chips(exception, estimated) }
                    VStack(alignment: .leading, spacing: 8) { chips(exception, estimated) }
                }
            }
        }
        .padding(HelixSpace.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
    }

    @ViewBuilder
    private func chips(_ exception: String, _ estimated: String) -> some View {
        if !exception.isEmpty { FuelChip(exception, icon: "calendar.badge.exclamationmark") }
        if !estimated.isEmpty { FuelChip(estimated, icon: "questionmark.circle") }
    }
}

/// One macro: its name, its numbers, and a capacity bar underneath.
struct MacroGauge: View {
    let label: String
    /// `nil` when nothing is logged.
    let eaten: Double?
    /// `nil` when there is no target — unset, or untracked today.
    let target: Double?
    let unit: String
    var tracked = true

    private var over: Double? {
        guard tracked, let eaten, let target, target > 0, eaten > target else { return nil }
        return eaten - target
    }

    private var fill: Double {
        guard tracked, let eaten, let target, target > 0 else { return 0 }
        return min(max(eaten / target, 0), 1)
    }

    private var spokenUnit: String { unit == "g" ? "grams" : "kilocalories" }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(label).font(.subheadline.weight(.medium))
                    Spacer(minLength: 8)
                    value
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.subheadline.weight(.medium))
                    value
                }
            }
            Gauge(value: fill, in: 0...1) { EmptyView() }
                .gaugeStyle(.accessoryLinearCapacity)
                .tint(over == nil ? Color.helix.accent(.fuel) : HelixDomain.fuel.end)
        }
        .opacity(tracked ? 1 : 0.55)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(spoken)
    }

    @ViewBuilder
    private var value: some View {
        if !tracked {
            Text("not graded today").helixCaption()
        } else if let eaten {
            if let over {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .accessibilityHidden(true)
                    Text("\(FuelFormat.whole(eaten)) of \(FuelFormat.whole(target ?? 0)) \(unit) · +\(FuelFormat.whole(over)) over")
                        .multilineTextAlignment(.leading)
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HelixDomain.fuel.end)
                .helixNumeral()
            } else if let target, target > 0 {
                Text("\(FuelFormat.whole(eaten)) of \(FuelFormat.whole(target)) \(unit)")
                    .font(.subheadline)
                    .foregroundStyle(Color.helix.textPrimary)
                    .helixNumeral()
            } else {
                Text("\(FuelFormat.whole(eaten)) \(unit) · no target")
                    .font(.subheadline)
                    .foregroundStyle(Color.helix.textSecondary)
                    .helixNumeral()
            }
        } else {
            Text("—")
                .font(.subheadline)
                .foregroundStyle(Color.helix.textSecondary)
        }
    }

    private var spoken: String {
        guard tracked else { return "not graded today" }
        guard let eaten else { return "nothing logged" }
        if let over { return "over target by \(FuelFormat.whole(over)) \(spokenUnit)" }
        if let target, target > 0 { return "\(FuelFormat.whole(eaten)) of \(FuelFormat.whole(target)) \(spokenUnit)" }
        return "\(FuelFormat.whole(eaten)) \(spokenUnit), no target"
    }
}

/// A small labelled state, in the tile's own material.
struct FuelChip: View {
    let text: String
    let icon: String

    init(_ text: String, icon: String) {
        self.text = text
        self.icon = icon
    }

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.helix.accent(.fuel))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .helixGlass(.row)
    }
}

// MARK: - Entries

private struct EntriesTile: View {
    let model: FuelModel
    let onCorrect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TileHeader("Logged") {
                TileAction("Correct macros", action: onCorrect)
            }

            if let entries = model.entries {
                if entries.isEmpty {
                    Text("Nothing logged yet — HealthKit fills this in")
                        .font(.subheadline)
                        .foregroundStyle(Color.helix.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(entries, id: \.id) { EntryRow(entry: $0) }
                    }
                }
            } else {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Reading the day…").helixCaption()
                }
            }
        }
        .padding(HelixSpace.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
    }
}

private struct EntryRow: View {
    let entry: NutritionEntryRow

    private var isManual: Bool { ManualEntry.isManualMacro(entry.hkUuid) }

    private var mealLabel: String {
        switch entry.mealType {
        case nil, "": "Entry"
        case "daily": "Whole day"
        case let some?: some.capitalized
        }
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(mealLabel).font(.body)
                    if isManual { FuelBadge("Manual") }
                }
                // A `daily` row carries a synthetic noon stamp, not a meal time.
                if entry.mealType == "daily" {
                    Text(isManual ? "Hand-entered" : "Apple Health").helixCaption()
                } else {
                    Text(entry.loggedAt, format: .dateTime.hour().minute())
                        .helixCaption()
                        .helixNumeral()
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(FuelFormat.whole(entry.calories)) kcal")
                    .font(.body)
                    .helixNumeral()
                Text("P \(FuelFormat.whole(entry.proteinG)) · C \(FuelFormat.whole(entry.carbsG)) · F \(FuelFormat.whole(entry.fatG))")
                    .helixCaption()
                    .helixNumeral()
            }
        }
        .padding(12)
        .helixGlass(.row)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Day target

private struct DayTargetTile: View {
    let model: FuelModel
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TileHeader("Day target") {
                if model.hasOverride { FuelBadge("Override") }
            }

            Text(summary)
                .font(.body)
                .helixNumeral()
            Text(model.hasOverride ? "Set for this day only. Blank figures keep the rung's." : "\(model.provenance) — the rung's figures apply.")
                .font(.footnote)
                .foregroundStyle(Color.helix.textSecondary)

            TileAction(model.hasOverride ? "Edit override" : (model.isToday ? "Override today" : "Override this day"), action: onEdit)
        }
        .padding(HelixSpace.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
    }

    /// `1,955 kcal · 170 P · 195 C · 55 F`, with "off" for an untracked macro.
    private var summary: String {
        let t = model.target
        func g(_ v: Double?, _ tracked: Bool, _ letter: String) -> String {
            guard tracked else { return "\(letter) off" }
            return "\(v.map(FuelFormat.whole) ?? "—") \(letter)"
        }
        return [
            model.targetKcal.map { "\(FuelFormat.whole($0)) kcal" } ?? "— kcal",
            g(t.protein, true, "P"),
            g(t.carbs, model.tracksCarbs, "C"),
            g(t.fat, model.tracksFat, "F"),
        ].joined(separator: " · ")
    }
}

// MARK: - Flags

private struct FlagsTile: View {
    let model: FuelModel

    private var reasons: [String] {
        var out = ExceptionDay.reasons
        // A stored reason that is not a preset still counts; the menu must be
        // able to show it rather than an empty selection.
        if let stored = model.exceptionReason, !out.contains(stored) { out.append(stored) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TileHeader("Context") { EmptyView() }

            LabeledContent("Exception day") {
                Picker("Exception day", selection: Binding(
                    get: { model.exceptionReason ?? "" },
                    set: { model.setException($0.isEmpty ? nil : $0) }
                )) {
                    Text("None").tag("")
                    ForEach(reasons, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .tint(Color.helix.accent(.fuel))
            }
            .frame(minHeight: 44)

            Toggle("Estimated", isOn: Binding(
                get: { model.isEstimated },
                set: { model.setEstimated($0) }
            ))
            .tint(Color.helix.accent(.fuel))
            .frame(minHeight: 44)

            Text("An exception is graded on protein only — intake still counts toward the week and the trend. Estimated forgives nothing; it only marks the numbers as a guess.")
                .helixCaption()
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(HelixSpace.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
    }
}

// MARK: - Water

private struct WaterTile: View {
    let model: FuelModel
    let onSet: () -> Void

    private var fill: Double {
        guard let ml = model.waterMl, let goal = model.waterGoalMl, goal > 0 else { return 0 }
        return min(ml / goal, 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TileHeader("Water") {
                if model.isWaterManual { FuelBadge("Manual") }
                TileAction("Set water", action: onSet)
            }

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(model.waterMl.map { "\(FuelFormat.litres($0)) L" } ?? "—")
                        .font(.title.weight(.semibold))
                        .helixNumeral()
                    Text(model.waterGoalMl.map { "of \(FuelFormat.litres($0)) L" } ?? "no goal set")
                        .helixCaption()
                        .helixNumeral()
                }
                Gauge(value: fill, in: 0...1) { EmptyView() }
                    .gaugeStyle(.accessoryLinearCapacity)
                    .tint(Color.helix.accent(.fuel))
            }
            // One spoken element for the figure and its bar; the header's badge
            // and button stay their own.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Water")
            .accessibilityValue(spoken)
        }
        .padding(HelixSpace.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
    }

    private var spoken: String {
        guard let ml = model.waterMl else { return "nothing logged" }
        guard let goal = model.waterGoalMl else { return "\(FuelFormat.litres(ml)) litres, no goal" }
        return "\(FuelFormat.litres(ml)) of \(FuelFormat.litres(goal)) litres"
    }
}

// MARK: - Shared tile furniture

private struct TileHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder let trailing: Trailing

    init(_ title: String, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                Text(title).font(.headline)
                Spacer(minLength: 8)
                trailing
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.headline)
                trailing
            }
        }
    }
}

/// A tile's one action, as text in the accent. 44 pt tall whatever the type size.
private struct TileAction: View {
    let title: String
    let action: () -> Void

    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.helix.accent(.fuel))
                .frame(minHeight: 44)
                .contentShape(.rect)
        }
        .helixPress()
    }
}

/// `Manual` / `Override` — a state, not a control.
private struct FuelBadge: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.caption2.weight(.bold))
            .foregroundStyle(Color.helix.accent(.fuel))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.helix.accent(.fuel).opacity(0.16)))
    }
}
