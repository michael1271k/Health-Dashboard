import Foundation
import Observation
import OnyxCore
import OnyxData

/// What a new account answers, and the one write at the end of it.
///
/// ── EVERY STEP HAS A DEFAULT AND EVERY STEP CAN BE SKIPPED ──────────────────
/// The flow opens with a plausible answer already in every field, and the
/// primary button on each step commits it. That is a UX preference twice over
/// and an App Review requirement once: guideline 5.1.1 requires that data useful
/// to a non-essential feature be OPTIONAL, and a reviewer who taps through
/// without reading must arrive at a working app rather than at a wall.
///
/// Bodyweight is the one figure everything downstream is scaled from, so it
/// starts at a value rather than blank — `defaultWeightKg` is a starting point
/// the user overwrites, not a claim about them.
///
/// ── NOTHING IS WRITTEN UNTIL `finish()` ─────────────────────────────────────
/// Eight screens of state live here and in nothing else until the last tap.
/// A flow that wrote as it went would leave an abandoned account half-configured
/// AND past the `needsOnboarding` gate, so it would never be offered again — the
/// worst of both. One transaction at the end means quitting halfway leaves an
/// account that is still, correctly, brand new.
@MainActor
@Observable
final class OnboardingModel {

    enum Step: Int, CaseIterable {
        case welcome, you, goal, targets, volume, records, plan, done
    }

    private let database: AppDatabase
    private let userId: String

    var step: Step = .welcome

    // ── Step 2 · you ────────────────────────────────────────────────────────
    /// Kilograms, always. The unit toggle is a DISPLAY choice; storing pounds
    /// would put a second unit into a database where every other mass is metric.
    var weightKg: Double? = defaultWeightKg
    var usesMetric = true
    /// 1 = Monday … 0 = Sunday. Inverted to `week_end_day` on the way out, the
    /// same inversion `SettingsModel.setWeekStartDay` does.
    var weekStartDay = 1
    var healthAsked = false

    // ── Step 3 · goal ───────────────────────────────────────────────────────
    var goal: StartingGoal = .cut {
        didSet {
            guard oldValue != goal else { return }
            // The macros and the volume both fall out of the goal, and a person
            // who changes their mind on step three must not carry step four's
            // arithmetic forward. Edits made AFTER this point are kept — that is
            // what `targetsTouched` is for.
            if !targetsTouched { recomputeTargets() }
            if !volumeTouched { recomputeVolume() }
        }
    }

    // ── Step 4 · targets ────────────────────────────────────────────────────
    var kcal: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var stepsGoal: Double?
    /// Set the moment the user edits a macro. From then on a goal change leaves
    /// their numbers alone, because they are theirs.
    private(set) var targetsTouched = false

    // ── Step 5 · volume ─────────────────────────────────────────────────────
    var volume: [String: Int] = [:]
    private(set) var volumeTouched = false

    // ── Step 6 · records ────────────────────────────────────────────────────
    /// Movement name → asserted one-rep max in kilograms. Entirely optional;
    /// the step's own copy says so.
    var oneRepMaxes: [String: Double] = [:]

    // ── Step 7 · plan ───────────────────────────────────────────────────────
    /// nil = "I'll build my own".
    var planId: String?

    // ── The write ───────────────────────────────────────────────────────────
    var isSaving = false
    var failure: String?
    private(set) var didSeed = false

    /// A starting bodyweight, not a guess about this person. It exists so the
    /// step after it has numbers to show, and it is the first thing on screen.
    static let defaultWeightKg: Double = 75

    /// The compounds a 1RM is worth asking for.
    ///
    /// Five, and they stop at five on purpose: this step is optional and its
    /// only job is to stop the first month of sessions reading as a personal
    /// record every week. A list long enough to feel like homework gets skipped
    /// entirely, and then none of them are seeded.
    static let compounds = [
        "Bench Press", "Squat", "Deadlift", "Overhead Press", "Barbell Row",
    ]

    init(database: AppDatabase, userId: String) {
        self.database = database
        self.userId = userId
        recomputeTargets()
        recomputeVolume()
    }

    // MARK: - Derived

    var targets: StartingTargets {
        StartingTargets(
            kcal: Int(kcal ?? 0), proteinG: Int(proteinG ?? 0), carbsG: Int(carbsG ?? 0),
            fatG: Int(fatG ?? 0),
            // Fibre is not on the form — four macro fields is already the most a
            // first run should ask for — so it tracks the kcal figure the user
            // ends up with rather than the one the builder first proposed.
            fiberG: Int((Double(Int(kcal ?? 0)) / 1000 * StartingTargetsBuilder.fiberPerThousandKcal).rounded()),
            stepsGoal: Int(stepsGoal ?? 0)
        )
    }

    /// Kilocalories the three macros account for. The app draws a warning when
    /// this disagrees with the stated figure, so onboarding shows it too rather
    /// than letting the first sight of it be a complaint on the Levers screen.
    var atwaterKcal: Int { targets.atwaterKcal }

    var atwaterGap: Int { atwaterKcal - Int(kcal ?? 0) }

    var weeklySets: Int { volume.values.reduce(0, +) }

    var plan: PlanTemplates.TemplatePlan? {
        planId.flatMap { id in PlanTemplates.plans.first { $0.id == id } }
    }

    /// How many days a week the chosen plan trains. Shown on the plan step,
    /// because "5 days" is the single fact that decides whether a split fits a
    /// life, and the label alone does not carry it.
    var planDays: Int { plan?.days.count ?? 0 }

    var canAdvance: Bool {
        switch step {
        // The one field the arithmetic downstream cannot proceed without.
        // Defaulted, so this is a guard against a cleared field, not a wall.
        case .you: return (weightKg ?? 0) >= StartingTargetsBuilder.weightRange.lowerBound
        default: return true
        }
    }

    // MARK: - Recomputes

    func recomputeTargets() {
        let t = StartingTargetsBuilder.build(weightKg: weightKg ?? Self.defaultWeightKg, goal: goal)
        kcal = Double(t.kcal)
        proteinG = Double(t.proteinG)
        carbsG = Double(t.carbsG)
        fatG = Double(t.fatG)
        stepsGoal = Double(t.stepsGoal)
    }

    func recomputeVolume() {
        volume = Dictionary(
            uniqueKeysWithValues: VolumeLandmarks.starting(for: goal.phase)
                .map { ($0.muscle.rawValue, $0.sets) }
        )
    }

    func markTargetsTouched() { targetsTouched = true }

    func setVolume(_ muscle: LandmarkMuscle, _ sets: Int) {
        volumeTouched = true
        volume[muscle.rawValue] = max(0, sets)
    }

    /// Bodyweight changed on step two. The macros follow it unless the user has
    /// since made them their own.
    func weightChanged() {
        guard !targetsTouched else { return }
        recomputeTargets()
    }

    // MARK: - Navigation

    func advance() {
        guard let next = Step(rawValue: step.rawValue + 1) else { return }
        step = next
    }

    func back() {
        guard let previous = Step(rawValue: step.rawValue - 1) else { return }
        step = previous
    }

    // MARK: - The write

    /// Build and write the account. One transaction (`AccountSeed`).
    ///
    /// Returns true when the app may proceed. A failure leaves the flow up with
    /// a message and the account still, correctly, unseeded — there is nothing
    /// half-written to clean up.
    @discardableResult
    func finish() async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }

        let template = plan
        let seed = AccountSeed(
            userId: userId,
            goal: goal,
            targets: targets,
            volume: volume,
            weightKg: weightKg,
            // The column is the week's END day. `SettingsModel.setWeekStartDay`
            // does this same inversion and the two must not disagree.
            weekEndDay: weekStartDay == 1 ? 0 : 6,
            unitSystem: usesMetric ? "metric" : "imperial",
            plan: template.map { p in
                SeedPlan(
                    programId: p.id, label: p.label, blurb: p.blurb, isLegacy: p.isLegacy,
                    sort: p.sort,
                    days: p.days.sorted { $0.sort < $1.sort }.map { d in
                        RoutineDay(
                            programId: p.id, dayKey: d.key, label: d.label, sub: d.sub,
                            weekday: d.weekday, accent: d.accent, sort: d.sort,
                            payload: RoutinePayload(exercises: d.exercises)
                        )
                    }
                )
            },
            exercises: catalogue(for: template),
            oneRepMaxes: oneRepMaxes.compactMap { name, kg in
                kg > 0 ? SeedOneRepMax(exerciseName: name, kg: kg) : nil
            }
            .sorted { $0.exerciseName < $1.exerciseName },
            startedOn: LogicalDay.today()
        )

        do {
            _ = try database.seedAccount(seed)
            didSeed = true
            failure = nil
            return true
        } catch {
            failure = "Could not set up your account. \(error.localizedDescription)"
            return false
        }
    }

    /// The catalogue rows to create.
    ///
    /// ── THE SEED IS THE CHOSEN PLAN'S OWN MOVEMENTS, NOT A LIBRARY ──────────
    /// D2 imagined a bundled `exercise-seed.json`. It is not needed and would be
    /// worse: the movements a new account needs on day one are exactly the ones
    /// in the plan it just chose, those names are already in the template, and a
    /// separate seed file would be a second list to keep in step with the first.
    /// A sixty-row catalogue nobody has trained is also what makes the library
    /// screen unreadable — the founder's account has twenty-nine such rows and
    /// `ExerciseCatalog`'s SQL carries a `HAVING` clause to hide them.
    ///
    /// Someone arriving with their own movements has the CSV importer, which is
    /// the same wave and a better answer than guessing for them.
    ///
    /// A blank plan seeds no catalogue at all: an empty library and an importer
    /// is an honest starting point; sixty rows they did not ask for is not.
    private func catalogue(for template: PlanTemplates.TemplatePlan?) -> [ExerciseDraft] {
        guard let template else { return [] }
        var seen = Set<String>()
        var out: [ExerciseDraft] = []
        for day in template.days {
            for exercise in day.exercises {
                let key = exercise.name.lowercased().trimmingCharacters(in: .whitespaces)
                guard !key.isEmpty, seen.insert(key).inserted else { continue }
                // Muscles are left nil: every one of these names is in
                // `MuscleMap`, which is the source every reader prefers, and a
                // stored copy would be a stale cache of it within a wave.
                out.append(ExerciseDraft(name: exercise.name))
            }
        }
        return out
    }
}
