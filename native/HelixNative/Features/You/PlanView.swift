import SwiftUI
import HelixUI
import HelixCore

/// The training plan and its phase, plus what the plan actually asks of you.
///
/// ── THE ONLY DESTRUCTIVE ACTION IN THE TAB ──────────────────────────────────
/// Activating rewrites five things at once: the five macro goals, the three body
/// destinations, the plan and phase, the date the phase started, and the dated
/// registry the charts label eras from. That is not a toggle, so the selection
/// here is a PREVIEW — nothing is written until Activate, and Activate asks
/// once. Apple's rule is that a confirmation is for the genuinely irreversible
/// and that overusing it teaches people to tap through; this screen is the one
/// place in the tab that earns it.
struct PlanView: View {
    let model: YouModel

    @State private var previewPlanId: String?
    @State private var previewPhase: ProgramPhase?
    @State private var isConfirming = false

    private var selectedPlanId: String { previewPlanId ?? model.planId }
    private var selectedPhase: ProgramPhase { previewPhase ?? model.phase }
    private var isActive: Bool {
        selectedPlanId == model.planId && selectedPhase == model.phase
    }

    var body: some View {
        Form {
            plans
            phase
            consequences
            routine
        }
        .helixFormBackground(.train)
        .navigationTitle("Training plan")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.observe() }
        .confirmationDialog(
            "Switch to \(Programs.plan(id: selectedPlanId)?.label ?? selectedPlanId) · \(selectedPhase.label)?",
            isPresented: $isConfirming,
            titleVisibility: .visible
        ) {
            Button("Activate", role: .destructive) {
                model.activate(planId: selectedPlanId, phase: selectedPhase)
                previewPlanId = nil
                previewPhase = nil
            }
        } message: {
            Text("Replaces your macro targets and body destinations with this phase's, and starts the phase today. Logged sessions are untouched.")
        }
    }

    // MARK: - Plans

    private var plans: some View {
        Section {
            ForEach(Programs.pickerOrder) { plan in
                Button {
                    previewPlanId = plan.id
                    // A different plan starts from its own cut, because a phase
                    // is a position inside a plan and carrying one across means
                    // nothing. Re-selecting the live plan keeps the live phase.
                    previewPhase = plan.id == model.planId ? model.phase : .cut
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(plan.label)
                                    .foregroundStyle(Color.helix.textPrimary)
                                if plan.isLegacy {
                                    Text("legacy")
                                        .font(.caption2)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(Color.helix.hairline, in: .capsule)
                                        .foregroundStyle(Color.helix.textSecondary)
                                }
                            }
                            Text(plan.blurb)
                                .font(.caption)
                                .foregroundStyle(Color.helix.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: plan.id == selectedPlanId ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(plan.id == selectedPlanId ? HelixDomain.train.accent : Color.helix.textTertiary)
                            .accessibilityHidden(true)
                    }
                    .frame(minHeight: 44)
                    .contentShape(.rect)
                }
                .buttonStyle(HelixPressStyle())
                .accessibilityAddTraits(plan.id == selectedPlanId ? [.isButton, .isSelected] : .isButton)
            }
        } header: {
            HelixSectionHeader("Plan", .train)
        }
    }

    // MARK: - Phase

    private var phase: some View {
        Section {
            Picker("Phase", selection: Binding(
                get: { selectedPhase },
                set: { previewPhase = $0; previewPlanId = selectedPlanId }
            )) {
                // Cut and bulk only. `maintenance` was deleted as a phase — a
                // maintenance week is a nutrition lever, and a phase would
                // change the training programme, which it does not.
                ForEach(ProgramPhase.allCases, id: \.self) { phase in
                    Text(phase.label).tag(phase)
                }
            }
            .pickerStyle(.segmented)
        } header: {
            HelixSectionHeader("Phase", .train)
        } footer: {
            Text(selectedPhase.blurb)
        }
    }

    // MARK: - Consequences

    @ViewBuilder
    private var consequences: some View {
        let goals = Programs.goals(planId: selectedPlanId, phase: selectedPhase)
        Section {
            LabeledContent("Calories") {
                Text(goals.calorieGoal, format: .number.precision(.fractionLength(0)))
                    .helixNumeral()
            }
            LabeledContent("Protein · carbs · fat") {
                Text(macroLine(goals)).helixNumeral()
            }
            LabeledContent("Steps") {
                Text(goals.stepsGoal, format: .number.precision(.fractionLength(0)))
                    .helixNumeral()
            }
            LabeledContent("Weekly sets") {
                Text(
                    Programs.weeklySetTargets(selectedPhase).values.reduce(0, +),
                    format: .number.precision(.fractionLength(0))
                )
                .helixNumeral()
            }

            if isActive {
                Text("This is your live plan.")
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
            } else {
                Button("Activate") { isConfirming = true }
                    .frame(maxWidth: .infinity)
                    .fontWeight(.semibold)
            }
        } header: {
            HelixSectionHeader(isActive ? "In force" : "What changes", .fuel)
        }
    }

    private func macroLine(_ goals: PhaseGoals) -> String {
        let parts = [goals.proteinGoalG, goals.carbsGoalG, goals.fatGoalG].map { value in
            value.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—"
        }
        return parts.joined(separator: " · ")
    }

    // MARK: - Routine

    @ViewBuilder
    private var routine: some View {
        Section {
            if let program = model.deck(for: selectedPlanId) {
                ForEach(program.days) { day in
                    NavigationLink {
                        RoutineDayView(day: day, phase: selectedPhase)
                    } label: {
                        LabeledContent(day.label) {
                            Text("\(day.plannedSets(for: selectedPhase)) sets")
                                .helixNumeral()
                        }
                    }
                }
            } else {
                // Only HELIX-5's deck is ported. Saying so is the honest answer;
                // drawing an empty list would read as "this plan trains nothing".
                Text("This plan's deck has not been ported yet. Its goals above are live.")
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
            }
        } header: {
            HelixSectionHeader("What you do each day", .train)
        } footer: {
            Text("The plan's own layout. A swapped or overridden date moves a session without changing this.")
        }
    }
}

/// One day's prescription, read-only.
private struct RoutineDayView: View {
    let day: ProgramDay
    let phase: ProgramPhase

    var body: some View {
        Form {
            Section {
                ForEach(day.exercises(for: phase)) { exercise in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(exercise.name)
                            .foregroundStyle(Color.helix.textPrimary)
                        HStack(spacing: 6) {
                            Text("\(exercise.sets(for: phase)) × \(exercise.reps)")
                                .helixNumeral()
                            if let rest = exercise.restSec {
                                Text("· \(rest / 60):\(String(format: "%02d", rest % 60)) rest")
                                    .helixNumeral()
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(Color.helix.textSecondary)
                    }
                    .padding(.vertical, 2)
                    .accessibilityElement(children: .combine)
                }
            } header: {
                HelixSectionHeader(day.sub ?? day.label, .train)
            } footer: {
                Text("\(day.plannedSets(for: phase)) working sets prescribed for this day.")
            }
        }
        .helixFormBackground(.train)
        .navigationTitle(day.label)
        .navigationBarTitleDisplayMode(.inline)
    }
}

#if DEBUG
#Preview("Plan") {
    NavigationStack {
        PlanView(model: YouModel(
            database: try! .inMemory(deviceId: "preview"), userId: "preview"
        ))
    }
}
#endif
