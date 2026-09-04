import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// The Train tab — today's plan, and the door into the logger.
///
/// ── THE LOGGER IS A COVER, NOT THE TAB ──────────────────────────────────────
/// Wave 1 put `LiveLoggerView` at the tab root, which made opening the Train
/// tab the same thing as starting a workout: the Live Activity appeared on the
/// Lock Screen because you glanced at Thursday's plan. A workout is something
/// you START. This screen shows what the day asks, and one deliberate tap
/// presents the logger as a full-screen cover — and only then does the logger's
/// `onAppear` request the Live Activity.
///
/// ── WHY THE MODEL AND THE ACTIVITY LIVE HERE ────────────────────────────────
/// The cover can be dismissed mid-session to check the Body tab. If the logger
/// owned its `LoggerModel` and `LiveActivityController`, dismissing it would
/// drop the rest timer and orphan the Lock Screen card — a card nothing can
/// update or end, and a second one on re-open. So both are `@State` on the tab
/// that outlives the cover, and the logger borrows them.
struct TrainTabView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Cut is the live block. `@AppStorage` so the toggle survives a relaunch.
    @AppStorage("helix.phase") private var storedPhase = ProgramPhase.cut.rawValue

    /// Supplied only by the screenshot harness, which cannot depend on which
    /// weekday the shot happens to run on. The app never passes one.
    var seededDay: ProgramDay?

    @State private var session: LoggerModel?
    @State private var activity = LiveActivityController()
    @State private var isLogging = false
    @State private var showPhase = false
    @State private var status: Status = .idle

    private enum Status: Equatable {
        case idle
        case live(sets: Int, volumeKg: Double)
        case done(sets: Int, volumeKg: Double, minutes: Double?)
    }

    private var phase: ProgramPhase { ProgramPhase(rawValue: storedPhase) ?? .cut }
    private var accent: Color { Color.helix.accent(.train) }

    /// The PLAN's layout, by weekday — the one correct use of a weekday here.
    /// Never infer a LOGGED session's split from its weekday: a swap moves a
    /// workout to another date. The swap/override layer lands with the Body tab.
    private var today: ProgramDay? {
        if let seededDay { return seededDay }
        let weekday = Calendar.current.component(.weekday, from: Date()) - 1
        return Program.helix5.day(weekday: weekday)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let day = today {
                    planTile(day)
                } else {
                    restTile
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .helixScreen(.train)
        .navigationTitle("Train")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                // The library is a sub-screen of Training, not a sixth tab.
                NavigationLink {
                    ExerciseLibraryView()
                } label: {
                    Label("Exercises", systemImage: "list.bullet.rectangle")
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let day = today { footer(day) }
        }
        .fullScreenCover(isPresented: $isLogging, onDismiss: refresh) {
            if let session {
                NavigationStack {
                    LiveLoggerView(model: session, activity: activity)
                }
                .preferredColorScheme(.dark)
            }
        }
        .sheet(isPresented: $showPhase) {
            if let day = today {
                PhaseSheet(day: day, phase: Binding(
                    get: { phase },
                    set: { storedPhase = $0.rawValue }
                ))
            }
        }
        .onAppear(perform: refresh)
    }

    // MARK: - The plan

    private func planTile(_ day: ProgramDay) -> some View {
        let exercises = day.exercises(for: phase)
        return VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(Date(), format: .dateTime.weekday(.wide).day().month())
                        .helixCaption()
                    Text(day.label)
                        .helixDisplay()
                        .foregroundStyle(accent)
                    if let sub = day.sub {
                        Text(sub)
                            .font(.subheadline)
                            .foregroundStyle(Color.helix.textSecondary)
                    }
                }
                Spacer(minLength: 8)
                AtlasFigure(side: .front, worked: worked(day), monochromeTint: accent)
                    .frame(height: 88)
                    .accessibilityHidden(true)
            }

            // Side by side until the type size says otherwise, then stacked —
            // at AX5 the count wrapped to a lone "7" under the chip.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { phaseChip; planCount(day, exercises.count) }
                VStack(alignment: .leading, spacing: 8) { phaseChip; planCount(day, exercises.count) }
            }

            VStack(spacing: 6) {
                ForEach(exercises) { exercise in
                    HStack(spacing: 10) {
                        Text(exercise.name)
                            .font(.body)
                            .lineLimit(1)
                        Spacer(minLength: 8)
                        Text("\(exercise.sets(for: phase)) × \(exercise.reps)")
                            .font(.body)
                            .foregroundStyle(Color.helix.textSecondary)
                            .helixNumeral()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .helixGlass(.row)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
        .foregroundStyle(Color.helix.textPrimary)
    }

    private func planCount(_ day: ProgramDay, _ exercises: Int) -> some View {
        Text("\(exercises) exercises · \(day.plannedSets(for: phase)) sets")
            .font(.footnote)
            .foregroundStyle(Color.helix.textSecondary)
            .helixNumeral()
    }

    private var phaseChip: some View {
        Button { showPhase = true } label: {
            Label(phase.label, systemImage: phase == .cut ? "flame.fill" : "leaf.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(accent)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .helixGlass(.row)
        }
        .helixPress()
        .accessibilityLabel("Training phase, \(phase.label). Tap to change.")
    }

    private var restTile: some View {
        VStack(spacing: 12) {
            Image(systemName: "figure.walk")
                .font(.system(size: 40, weight: .medium))
                .foregroundStyle(accent)
            Text("Zone-2 rest")
                .helixDisplay()
            Text("HELIX-5 trains Sun, Mon, Tue, Thu and Fri. Today is a walk.")
                .font(.subheadline)
                .foregroundStyle(Color.helix.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .helixGlass(.tile)
        .foregroundStyle(Color.helix.textPrimary)
    }

    /// Landmark → 0…1 for the day's prescription, so the figure shows where the
    /// session will land before a set is logged.
    private func worked(_ day: ProgramDay) -> [LandmarkMuscle: Double] {
        MuscleCredit.worked(from: MuscleCredit.weightedSets(
            day.exercises(for: phase).map { .init(physicalSets: $0.sets(for: phase), movers: $0.movers) }
        ))
    }

    // MARK: - The door

    @ViewBuilder
    private func footer(_ day: ProgramDay) -> some View {
        Group {
            switch status {
            case .done(let sets, let volumeKg, let minutes):
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Session complete")
                            .font(.headline)
                        Text(summary(sets: sets, volumeKg: volumeKg, minutes: minutes))
                            .font(.subheadline)
                            .foregroundStyle(Color.helix.textSecondary)
                            .helixNumeral()
                    }
                    Spacer(minLength: 0)
                }
                .padding(16)
                .helixGlass(.tile)
                .accessibilityElement(children: .combine)

            case .live(let sets, let volumeKg):
                startButton(
                    title: "Resume workout",
                    detail: summary(sets: sets, volumeKg: volumeKg, minutes: nil),
                    icon: "play.fill", day: day
                )

            case .idle:
                startButton(title: "Start workout", detail: nil, icon: "figure.strengthtraining.traditional", day: day)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(alignment: .top) {
            Rectangle().fill(.regularMaterial).ignoresSafeArea()
        }
        .overlay(alignment: .top) {
            Color.helix.hairline.frame(height: 0.5)
        }
    }

    private func startButton(title: String, detail: String?, icon: String, day: ProgramDay) -> some View {
        Button { start(day) } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.title3.weight(.bold))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.headline)
                    if let detail {
                        Text(detail)
                            .font(.footnote)
                            .helixNumeral()
                            .opacity(0.85)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.bold))
                    .opacity(0.7)
            }
            .foregroundStyle(Color.helix.textPrimary)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, minHeight: 60)
            .background(
                HelixDomain.train.ramp,
                in: RoundedRectangle(cornerRadius: HelixCorner.tile, style: .continuous)
            )
        }
        .helixPress(scale: 0.98)
        .accessibilityHint("Opens the logger and starts the Live Activity")
    }

    private func summary(sets: Int, volumeKg: Double, minutes: Double?) -> String {
        var parts = ["\(sets) sets", "\(HelixFormat.volume(volumeKg)) kg"]
        if let minutes, minutes > 0 { parts.append("\(Int(minutes.rounded())) min") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Actions

    private func start(_ day: ProgramDay) {
        if session == nil || session?.day.key != day.key {
            session = LoggerModel(
                day: day, phase: phase,
                store: environment.database, userId: environment.userIdString
            )
        }
        isLogging = true
    }

    /// Where today stands, read from the store. Synchronous on purpose: two
    /// indexed lookups on appear and on dismiss, and no observation to reap.
    private func refresh() {
        guard let day = today else { status = .idle; return }
        let database = environment.database
        let date = LogicalDay.today()
        do {
            if let live = try database.liveSession(dayKey: day.key, date: date) {
                // The kept model knows the session better than the store does
                // — it counts working sets, the store counts rows.
                if let session, session.day.key == day.key {
                    status = .live(sets: session.completedSets, volumeKg: session.totalVolumeKg)
                } else {
                    let sets = try database.sets(sessionId: live.id).filter { $0.setType != "ghost" }
                    status = .live(sets: sets.count, volumeKg: tonnage(sets))
                }
            } else if let closed = try database.sessions(on: date)
                        .first(where: { $0.dayKey == day.key && $0.endedAt != nil }) {
                let sets = try database.sets(sessionId: closed.id).filter { $0.setType != "ghost" }
                status = .done(sets: sets.count, volumeKg: tonnage(sets), minutes: closed.durationMin)
                session = nil
            } else {
                status = .idle
            }
        } catch {
            // A store that cannot be read still shows the plan; the button
            // reads "Start", and the logger surfaces the same failure in its
            // own banner with the detail.
            status = .idle
        }
    }

    private func tonnage(_ sets: [WorkoutSet]) -> Double {
        sets.reduce(0) { $0 + $1.weightKg * Double($1.reps) }
    }
}

#if DEBUG
#Preview("Train — Upper B") {
    NavigationStack {
        TrainTabView(seededDay: Program.helix5.day(key: "cb_b"))
    }
    .environment(AppEnvironment.preview)
    .preferredColorScheme(.dark)
}
#endif
