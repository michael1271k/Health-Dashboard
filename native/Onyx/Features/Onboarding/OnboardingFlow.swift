import SwiftUI
import OnyxCore
import OnyxData
import OnyxUI

/// The eight screens between a confirmed e-mail and a logger with a routine in
/// it.
///
/// ── ONE CONTAINER, EIGHT CONTENTS ───────────────────────────────────────────
/// Not a `NavigationStack` of pushes and not a `TabView(.page)`. A stack would
/// give every step its own back-swipe into a half-answered questionnaire, and a
/// pager invites a sideways flick past a question the next screen's numbers
/// depend on. So the chrome — the progress rail, Back, and one primary button —
/// is drawn once and the middle is swapped, which also means the button says
/// something different and specific on every step instead of "Next" eight times.
///
/// ── AND IT IS A COVER, LIKE THE BACKFILL ────────────────────────────────────
/// `fullScreenCover` over the tabs, exactly as `BackfillSheet` is. The tabs
/// mount underneath and observe the store, so by the time the last step's write
/// commits they are already showing the plan it wrote — there is no reload and
/// no empty first frame.
struct OnboardingFlow: View {
    @Bindable var model: OnboardingModel
    @Environment(AppEnvironment.self) private var environment

    @FocusState private var focus: Field?

    enum Field: Hashable {
        case weight, kcal, protein, carbs, fat, steps
        case oneRepMax(String)
    }

    var body: some View {
        VStack(spacing: 0) {
            rail
            ScrollView {
                VStack(alignment: .leading, spacing: OnyxSpace.xl) {
                    heading
                    content
                }
                .padding(OnyxSpace.xl)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollBounceBehavior(.basedOnSize)
            footer
        }
        .onyxScreen(.train)
        // ── THE ACCENT, NOT THE SYSTEM'S ────────────────────────────────────
        // Without this every control here is iOS blue, which is a colour that
        // appears nowhere else in this app. `DaySheet` tints itself the same
        // way for the same reason; a flow that is a person's FIRST sight of
        // Onyx is the worst possible place to look like a stock form.
        .tint(OnyxDomain.train.accent)
        .toolbar { OnyxKeyboardDone { focus = nil } }
        // A half-answered questionnaire is not a state worth preserving, and
        // the gate will offer the whole flow again on the next launch anyway —
        // but an accidental swipe-down that loses six screens of answers is a
        // bad enough minute that it is worth forbidding outright.
        .interactiveDismissDisabled()
    }

    // MARK: - Chrome

    /// Eight segments, filled to the current step.
    ///
    /// A rail rather than "Step 3 of 8": the count is the same information and
    /// the shape carries it without being read. It is `.accessibilityHidden`
    /// because the heading below already announces where you are, and VoiceOver
    /// reading eight anonymous segments is noise.
    private var rail: some View {
        HStack(spacing: 3) {
            ForEach(OnboardingModel.Step.allCases, id: \.rawValue) { step in
                Capsule()
                    .fill(
                        step.rawValue <= model.step.rawValue
                            ? OnyxDomain.train.accent
                            : Color.onyx.textSecondary.opacity(0.25)
                    )
                    .frame(height: 3)
            }
        }
        .padding(.horizontal, OnyxSpace.xl)
        .padding(.top, OnyxSpace.m)
        .animation(.snappy(duration: 0.2), value: model.step)
        .accessibilityHidden(true)
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.title2.weight(.semibold))
                .foregroundStyle(Color.onyx.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .onyxType(.body)
                .foregroundStyle(Color.onyx.textSecondary)
        }
    }

    private var footer: some View {
        VStack(spacing: OnyxSpace.s) {
            if let failure = model.failure {
                Text(failure)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: OnyxSpace.m) {
                if model.step != .welcome && !model.isSaving {
                    Button("Back") { model.back() }
                        .buttonStyle(.bordered)
                        .frame(minHeight: 44)
                }
                Button(action: primary) {
                    HStack(spacing: 6) {
                        if model.isSaving { ProgressView().controlSize(.small) }
                        Text(primaryTitle)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!model.canAdvance || model.isSaving)
            }
            // ── EVERY OPTIONAL STEP SAYS SO, IN A CONTROL ───────────────────
            // Guideline 5.1.1: information useful to a non-essential feature
            // must be optional. "Skip" is that, stated rather than implied, and
            // it is the same size as the button beside it — a skip the size of a
            // footnote is a skip the reviewer will not find.
            if let skip = skipTitle {
                Button(skip) { model.advance() }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
        .padding(OnyxSpace.xl)
        .background(.ultraThinMaterial)
    }

    // MARK: - Copy

    private var title: String {
        switch model.step {
        case .welcome: "Welcome to Onyx"
        case .you:     "About you"
        case .goal:    "What are you training for?"
        case .targets: "Your daily targets"
        case .volume:  "Weekly sets per muscle"
        case .records: "Your current bests"
        case .plan:    "Pick a routine"
        case .done:    model.didSeed ? "You're set up" : "Ready when you are"
        }
    }

    private var subtitle: String {
        switch model.step {
        case .welcome:
            "Log your training, your food and your recovery in one place. Six questions and you're done — you can change every one of them later."
        case .you:
            "Your bodyweight sets your starting calorie and protein targets. Nothing here leaves your account."
        case .goal:
            "This sets your calories and how many hard sets a week the app aims for."
        case .targets:
            "Worked out from your bodyweight and your goal. Change anything that doesn't look right."
        case .volume:
            "A starting point from published training volume landmarks — not a prescription. Settings → Weekly set volume changes them any time."
        case .records:
            "Optional. If the app knows roughly what you can lift, it won't call your first few sessions a personal record every week."
        case .plan:
            "Start from a ready-made split or build your own. Either way you can edit every day afterwards."
        case .done:
            model.didSeed
                ? "Your plan, your targets and your movements are saved. Everything below is editable in Settings."
                : "That's everything. This writes your plan and your targets."
        }
    }

    private var primaryTitle: String {
        switch model.step {
        case .welcome: "Get started"
        case .done:    model.didSeed ? "Start training" : "Finish setup"
        default:       "Continue"
        }
    }

    /// The steps that are genuinely optional. `you`, `goal` and `plan` all have
    /// working defaults and are advanced with Continue, so a skip beside them
    /// would be a second button that does the same thing.
    private var skipTitle: String? {
        switch model.step {
        case .records: "Skip — I'll let the app learn"
        case .volume:  "Use the suggested numbers"
        default:       nil
        }
    }

    private func primary() {
        guard model.step == .done else { return model.advance() }
        Task {
            // Not `model.didSeed || await model.finish()` — `||` takes an
            // autoclosure and an autoclosure cannot be async.
            if model.didSeed { return environment.finishOnboarding() }
            if await model.finish() { environment.finishOnboarding() }
        }
    }

    // MARK: - The steps

    @ViewBuilder
    private var content: some View {
        switch model.step {
        case .welcome: welcomeStep
        case .you:     youStep
        case .goal:    goalStep
        case .targets: targetsStep
        case .volume:  volumeStep
        case .records: recordsStep
        case .plan:    planStep
        case .done:    doneStep
        }
    }

    private var welcomeStep: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.l) {
            OnyxMark(size: 56, opacity: 1)
                .frame(maxWidth: .infinity, alignment: .center)
                .accessibilityHidden(true)
            ForEach(Self.pillars, id: \.title) { pillar in
                card {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pillar.title)
                                .onyxType(.body).fontWeight(.semibold)
                                .foregroundStyle(Color.onyx.textPrimary)
                            Text(pillar.body)
                                .onyxType(.caption)
                                .foregroundStyle(Color.onyx.textSecondary)
                        }
                    } icon: {
                        Image(systemName: pillar.symbol)
                            .foregroundStyle(OnyxDomain.train.accent)
                    }
                    .labelStyle(.titleAndIcon)
                }
            }
        }
    }

    private static let pillars: [(symbol: String, title: String, body: String)] = [
        ("figure.strengthtraining.traditional", "Every set, in order",
         "A logger that knows what you lifted last time and what to beat."),
        ("waveform.path.ecg", "Recovery you can see",
         "Sleep, heart-rate variability and soreness, graded into one readiness score."),
        ("fork.knife", "Food against a target",
         "Macros that move with your phase, not a fixed number you outgrow."),
    ]

    private var youStep: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.l) {
            card {
                OnyxNumberRow(
                    label: "Bodyweight", value: $model.weightKg, field: Field.weight,
                    focus: $focus, unit: "kg", range: StartingTargetsBuilder.weightRange,
                    fractionLength: 1, onCommit: model.weightChanged
                )
            }

            card {
                VStack(alignment: .leading, spacing: OnyxSpace.s) {
                    Text("Week starts on")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textSecondary)
                    Picker("Week starts on", selection: $model.weekStartDay) {
                        Text("Monday").tag(1)
                        Text("Sunday").tag(0)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }
            }

            // ── THE HEALTH ASK, AND IT IS AN ASK ────────────────────────────
            // Guideline 5.1.1 again: Onyx logs sets perfectly well with no
            // Health access, so this is an offer with a decline exactly as
            // prominent as the accept, and the copy says what is read and what
            // it is read FOR — which is what the purpose string in Info.plist
            // has to match.
            card {
                VStack(alignment: .leading, spacing: OnyxSpace.s) {
                    Label("Apple Health", systemImage: "heart.fill")
                        .onyxType(.body).fontWeight(.semibold)
                        .foregroundStyle(Color.onyx.textPrimary)
                    Text("Onyx can read your weight, sleep, heart rate and workouts from Apple Health so your recovery score and your cardio log fill themselves in. You can use everything in the app without it.")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textSecondary)
                    HStack(spacing: OnyxSpace.m) {
                        Button(model.healthAsked ? "Asked" : "Connect Health") {
                            Task {
                                model.healthAsked = true
                                await environment.requestHealthAccess()
                                if let weight = await environment.latestHealthBody().weightKg,
                                   model.weightKg == OnboardingModel.defaultWeightKg {
                                    model.weightKg = (weight * 10).rounded() / 10
                                    model.weightChanged()
                                }
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.healthAsked)
                        .frame(minHeight: 44)

                        // `.bordered`, not `.plain`: a decline that renders as
                        // grey text is a decline a reviewer reads as a caption.
                        // Guideline 5.1.1 wants the optional path VISIBLE, and
                        // a button has to look like one.
                        Button("Not now") { model.healthAsked = true }
                            .buttonStyle(.bordered)
                            .frame(minHeight: 44)
                    }
                }
            }
        }
    }

    private var goalStep: some View {
        VStack(spacing: OnyxSpace.m) {
            ForEach(StartingGoal.allCases, id: \.rawValue) { goal in
                Button { model.goal = goal } label: {
                    HStack(alignment: .top, spacing: OnyxSpace.m) {
                        Image(systemName: model.goal == goal ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(
                                model.goal == goal ? OnyxDomain.train.accent : Color.onyx.textSecondary
                            )
                        VStack(alignment: .leading, spacing: 2) {
                            Text(goal.label)
                                .onyxType(.body).fontWeight(.semibold)
                                .foregroundStyle(Color.onyx.textPrimary)
                            Text(goal.blurb)
                                .onyxType(.caption)
                                .foregroundStyle(Color.onyx.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(OnyxSpace.m)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onyxGlass(.row)
                }
                .buttonStyle(.plain)
                .onyxPress(scale: 0.98)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(model.goal == goal ? [.isButton, .isSelected] : .isButton)
            }
        }
    }

    private var targetsStep: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.l) {
            card {
                VStack(spacing: OnyxSpace.xs) {
                    macro("Calories", $model.kcal, .kcal, "kcal", 0...8000)
                    macro("Protein", $model.proteinG, .protein, "g", 0...500)
                    macro("Carbohydrate", $model.carbsG, .carbs, "g", 0...900)
                    macro("Fat", $model.fatG, .fat, "g", 0...300)
                    macro("Steps", $model.stepsGoal, .steps, "steps", 0...40000)
                }
            }
            // The app draws this warning on the Levers screen; showing it here
            // means the first sight of it is not a complaint about numbers the
            // app itself produced.
            if abs(model.atwaterGap) >= 20 {
                Text("Your macros add up to \(model.atwaterKcal) kcal, which is \(abs(model.atwaterGap)) \(model.atwaterGap > 0 ? "above" : "below") the calorie target. That's fine if it's deliberate.")
                    .onyxType(.caption)
                    // Amber, not red: the macros not summing exactly to the
                    // calorie line is a thing to notice, not a thing that is
                    // wrong — a deliberate refeed looks exactly like this.
                    .foregroundStyle(Color.onyx.record)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Button("Recalculate from my bodyweight") {
                model.recomputeTargets()
            }
            .buttonStyle(.bordered)
            .frame(minHeight: 44)
        }
    }

    private func macro(
        _ label: String, _ value: Binding<Double?>, _ field: Field, _ unit: String,
        _ range: ClosedRange<Double>
    ) -> some View {
        OnyxNumberRow(
            label: label, value: value, field: field, focus: $focus,
            unit: unit, range: range, fractionLength: 0,
            onCommit: model.markTargetsTouched
        )
    }

    private var volumeStep: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.l) {
            HStack {
                Text("\(model.weeklySets) hard sets a week")
                    .onyxType(.body).fontWeight(.semibold)
                    .onyxNumeral()
                    .foregroundStyle(Color.onyx.textPrimary)
                Spacer()
            }
            ForEach(MuscleFamily.allCases, id: \.self) { family in
                VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                    OnyxSectionHeader(family.rawValue, color: Color.onyx.muscleFamily(family))
                    card {
                        VStack(spacing: OnyxSpace.xs) {
                            ForEach(family.members, id: \.self) { muscle in
                                volumeRow(muscle)
                            }
                        }
                    }
                }
            }
        }
    }

    private func volumeRow(_ muscle: LandmarkMuscle) -> some View {
        let value = model.volume[muscle.rawValue] ?? 0
        return Stepper(
            value: Binding(get: { value }, set: { model.setVolume(muscle, $0) }),
            in: 0...40
        ) {
            LabeledContent(muscle.displayName) {
                // Not colour-only, and zero says "none" rather than showing a 0
                // that reads as a measurement.
                Text(value == 0 ? "none" : value.formatted(.number))
                    .onyxNumeral()
                    .foregroundStyle(value == 0 ? Color.onyx.textSecondary : Color.onyx.textPrimary)
            }
        }
        .accessibilityValue("\(value) sets a week")
    }

    private var recordsStep: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.m) {
            card {
                VStack(spacing: OnyxSpace.xs) {
                    ForEach(OnboardingModel.compounds, id: \.self) { name in
                        OnyxNumberRow(
                            label: name,
                            value: Binding(
                                get: { model.oneRepMaxes[name] },
                                set: { model.oneRepMaxes[name] = $0 }
                            ),
                            field: Field.oneRepMax(name), focus: $focus,
                            unit: "kg", range: 0...500, fractionLength: 1
                        )
                    }
                }
            }
            Text("A one-rep max — the most you could lift once, even if you've never actually tried it. Leave any of them blank.")
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var planStep: some View {
        VStack(spacing: OnyxSpace.m) {
            ForEach(PlanTemplates.plans, id: \.id) { template in
                planCard(
                    id: template.id, label: template.label, blurb: template.blurb,
                    days: template.days.count
                )
            }
            planCard(
                id: nil, label: "Build my own",
                blurb: "Start with an empty routine and add your days and movements yourself.",
                days: 0
            )
        }
    }

    private func planCard(id: String?, label: String, blurb: String, days: Int) -> some View {
        let selected = model.planId == id
        return Button { model.planId = id } label: {
            HStack(alignment: .top, spacing: OnyxSpace.m) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? OnyxDomain.train.accent : Color.onyx.textSecondary)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: OnyxSpace.xs) {
                        Text(label)
                            .onyxType(.body).fontWeight(.semibold)
                            .foregroundStyle(Color.onyx.textPrimary)
                        if days > 0 {
                            // The one fact that decides whether a split fits a
                            // life, and the label alone does not carry it.
                            Text("\(days) days")
                                .onyxType(.micro).onyxNumeral()
                                .foregroundStyle(Color.onyx.textSecondary)
                        }
                    }
                    Text(blurb)
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(OnyxSpace.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onyxGlass(.row)
        }
        .buttonStyle(.plain)
        .onyxPress(scale: 0.98)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private var doneStep: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.m) {
            summary("Goal", model.goal.label, "target")
            summary("Daily calories", "\(model.targets.kcal) kcal · \(model.targets.proteinG) g protein", "fork.knife")
            summary("Weekly sets", "\(model.weeklySets) across 16 muscles", "figure.strengthtraining.traditional")
            summary(
                "Routine",
                model.plan.map { "\($0.label) · \(model.planDays) days" } ?? "Your own, built from scratch",
                "calendar"
            )
            if model.didSeed {
                Text("Everything here lives in Settings → Plan, Levers and Weekly set volume.")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func summary(_ label: String, _ value: String, _ symbol: String) -> some View {
        card {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textSecondary)
                    Text(value)
                        .onyxType(.body).fontWeight(.semibold)
                        .foregroundStyle(Color.onyx.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } icon: {
                Image(systemName: symbol).foregroundStyle(OnyxDomain.train.accent)
            }
            .labelStyle(.titleAndIcon)
        }
        .accessibilityElement(children: .combine)
    }

    private func card<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(OnyxSpace.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onyxGlass(.row)
    }
}
