import SwiftUI
import HelixUI
import HelixCore

/// What the plan says about this date, and the door to changing it.
struct SwapDayTile: View {
    let model: DayModel
    @State private var changing = false

    var body: some View {
        DayTile("Schedule", .train) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.scheduled?.label ?? "Rest")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Color.helix.accent(.train))
                    if let sub = model.scheduled?.sub {
                        Text(sub).font(.caption).foregroundStyle(Color.helix.textSecondary)
                    }
                }
                Spacer(minLength: 0)
                if model.isOverridden {
                    Label("Swapped", systemImage: "arrow.triangle.swap")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.helix.textSecondary)
                }
            }
            .accessibilityElement(children: .combine)

            if let note = model.swapNote {
                Text(note)
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
                    .accessibilityAddTraits(.updatesFrequently)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { actions }
                VStack(alignment: .leading, spacing: 10) { actions }
            }
        }
        .sheet(isPresented: $changing) {
            SwapDaySheet(model: model)
        }
    }

    @ViewBuilder
    private var actions: some View {
        Button("Change") { changing = true }
            .modifier(SwapButton())
        if model.isOverridden {
            Button("Undo swap") { withAnimation(HelixMotion.move) { model.undoSwap() } }
                .modifier(SwapButton())
                .accessibilityHint("Clears both dates of the swap")
        }
    }
}

private struct SwapButton: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color.helix.accent(.train))
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .helixPress(scale: 0.98)
            .helixGlass(.row)
    }
}

/// Two ways to change a date, each previewed before it is confirmed.
///
/// ── A REST DAY IS A REARRANGEMENT, NOT A DELETION ───────────────────────────
/// Taking a rest day moves the displaced workout to the plan's next rest slot;
/// placing a workout is an exchange with wherever it was. Both are two rows,
/// both are refused when a committed session stands in the way, and the
/// sentence saying what will happen is shown BEFORE the button — an action that
/// rearranges your week silently is one you stop trusting.
struct SwapDaySheet: View {
    let model: DayModel
    @Environment(\.dismiss) private var dismiss

    @State private var selectedKey: String?
    @State private var logged: [LoggedDay] = []

    private let accent = Color.helix.accent(.train)

    var body: some View {
        DaySheet("Change \(Swap.shortDayLabel(model.date))", domain: .train) {
            VStack(alignment: .leading, spacing: HelixSpace.l) {
                restSection
                Divider().overlay(Color.helix.hairline)
                placeSection
            }
        }
        .onAppear {
            // One read, on appear: the dates a swap can touch are this week and
            // the 13-day horizon a displaced workout may be re-homed within.
            let ahead = (1...Swap.horizonDays).compactMap { ISODate.addDays(model.date, $0) }
            logged = model.loggedDays(Array(Set(Swap.weekDatesOf(model.date) + ahead)).sorted())
        }
    }

    private func labelFor(_ key: String?) -> String {
        key.flatMap { model.program.day(key: $0)?.label } ?? "a session"
    }

    // MARK: Rest

    @ViewBuilder
    private var restSection: some View {
        let plan = Swap.planRestDay(model.date, resolve: model.resolver())
        let block: SwapBlock? = {
            guard let to = plan.movedTo, let key = plan.moved?.dayKey else { return nil }
            return Swap.blockForPlacement(to, dayKey: key, logged: logged, sourceDate: model.date)
        }()
        let sentence = block.map { Swap.describeBlock($0, labelFor: labelFor) } ?? Swap.describeRestPlan(plan)

        VStack(alignment: .leading, spacing: 8) {
            Label("Take a rest day", systemImage: "moon.zzz")
                .font(.headline)
            Text(sentence)
                .font(.footnote)
                .foregroundStyle(Color.helix.textSecondary)
            Button {
                if model.applySwap(plan.writes, note: Swap.describeRestPlan(plan)) { dismiss() }
            } label: {
                Text("Confirm rest day")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .disabled(block != nil || plan.outcome == .alreadyRest || plan.writes.isEmpty)
            .helixPress(scale: 0.98)
            .helixGlass(.row)
        }
    }

    // MARK: Place

    @ViewBuilder
    private var placeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Place a workout here", systemImage: "arrow.triangle.swap")
                .font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], spacing: 8) {
                ForEach(model.program.days) { day in
                    dayChoice(day)
                }
            }
            if let key = selectedKey, let day = model.program.day(key: key) {
                placement(day)
            }
        }
    }

    private func dayChoice(_ day: ProgramDay) -> some View {
        let selected = selectedKey == day.key
        return Button {
            withAnimation(HelixMotion.move) { selectedKey = day.key }
        } label: {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(day.label).font(.subheadline.weight(.semibold))
                    if let sub = day.sub {
                        Text(sub).font(.caption).foregroundStyle(Color.helix.textSecondary)
                    }
                }
                Spacer(minLength: 0)
                if selected {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(accent)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .helixPress(scale: 0.98)
        .helixGlass(.row)
        .overlay {
            if selected {
                RoundedRectangle(cornerRadius: HelixCorner.row, style: .continuous)
                    .strokeBorder(accent.opacity(0.7), lineWidth: 1)
            }
        }
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder
    private func placement(_ day: ProgramDay) -> some View {
        let writes = Swap.planDaySwap(model.date, dayKey: day.key, resolve: model.resolver(), naturalDate: model.naturalDate(of: day))
        let source = writes.count > 1 ? writes[1].date : nil
        let block = Swap.blockForPlacement(model.date, dayKey: day.key, logged: logged, sourceDate: source)
        let alreadyHere = model.scheduled?.dayKey == day.key
        let sentence: String = {
            if let block { return Swap.describeBlock(block, labelFor: labelFor) }
            if alreadyHere { return "\(day.label) is already scheduled here." }
            guard let source else { return "\(day.label) placed on \(Swap.shortDayLabel(model.date))." }
            return "\(day.label) moves here; \(model.scheduled?.label ?? "Rest") moves to \(Swap.shortDayLabel(source))."
        }()

        VStack(alignment: .leading, spacing: 8) {
            Text(sentence)
                .font(.footnote)
                .foregroundStyle(Color.helix.textSecondary)
            Button {
                if model.applySwap(writes, note: sentence) { dismiss() }
            } label: {
                Text("Confirm swap")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .disabled(block != nil || alreadyHere)
            .helixPress(scale: 0.98)
            .helixGlass(.row)
        }
    }
}
