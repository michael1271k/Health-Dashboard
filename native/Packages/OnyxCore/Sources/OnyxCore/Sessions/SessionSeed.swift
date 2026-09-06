import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The session seed — what a day's deck opens with, and where every number in it
// came from. A port of `src/lib/sessions/sessionSeed.ts`; vectors
// `session-seed.json` and `sessions-for-seed.json`.
//
// This replaces `LoggerModel.seedRows`, which seeded every row from
// `ProgramExercise.wk1Kg` — a load chosen in July — and printed
// `"<wk1Kg>kg × <floor>"` as the Previous column. After six months of training
// that is not a seed, it is a number with the shape of one.
//
// THE TIERS, HIGHEST FIRST:
//   1. HISTORY — the newest qualifying session that logged this movement (see
//      `sessionsForSeed`), reproduced set for set.
//   2. TEMPLATE — `routine_templates.payload`, the shape of the last deck
//      committed for this day. It carries no date, so it is a shape and not a
//      memory: consulted only when history has nothing.
//   3. PROGRAM — `wk1Kg` at the rep floor. The cold start.
//
// AND WHY HISTORY IS MATCHED BY NAME, NEVER BY `exercise_id`: web-logged sets
// carry the catalogue's uuid; this phone writes `"helix5-<slug>"`
// (`ExerciseSlug.id`). The Sept 6 Upper A session was logged on the web, so any
// seed that indexes history by id finds zero rows for it and falls through to
// the cold start — which looks exactly like "this movement is new" and is not.
// The id is resolved to a display name by the caller
// (`PrRecorder.nameResolver`) and canonicalised in here.
// ─────────────────────────────────────────────────────────────────────────────

/// A candidate previous session. One row of `workout_sessions`, narrowed.
public struct SeedSession: Codable, Sendable, Equatable {
    public var id: String
    public var dayKey: String?
    /// The session's logical day, ISO.
    public var date: String
    /// Any string that sorts chronologically — `started_at` does.
    public var startedAt: String
    /// Was this session logged under the maintenance lever?
    ///
    /// Resolved by the CALLER (`Levers.leverForDate` / `Maintenance`), not in
    /// here: the answer depends on `user_goals.active_lever` and
    /// `maintenance_until`, which are rows, and a pure rule that reads rows is
    /// a rule that cannot be put in a vector.
    public var maintenance: Bool

    public init(id: String, dayKey: String?, date: String, startedAt: String, maintenance: Bool) {
        self.id = id
        self.dayKey = dayKey
        self.date = date
        self.startedAt = startedAt
        self.maintenance = maintenance
    }
}

/// One logged set of a candidate session, already name-resolved.
public struct SeedSet: Codable, Sendable, Equatable {
    public var sessionId: String
    /// The stored display name — canonicalised in here. NEVER an id.
    public var exerciseName: String
    /// Performed order within the session (`set_number` / `set_index`).
    public var order: Int
    public var weightKg: Double
    public var reps: Int
    public var rpe: Double?
    public var setType: String?
    public var side: String?
    public var pairId: String?

    public init(
        sessionId: String, exerciseName: String, order: Int,
        weightKg: Double, reps: Int, rpe: Double? = nil,
        setType: String? = nil, side: String? = nil, pairId: String? = nil
    ) {
        self.sessionId = sessionId
        self.exerciseName = exerciseName
        self.order = order
        self.weightKg = weightKg
        self.reps = reps
        self.rpe = rpe
        self.setType = setType
        self.side = side
        self.pairId = pairId
    }
}

/// A `.ready` progression verdict for one movement on this day.
public struct SeedProgression: Codable, Sendable, Equatable {
    public var name: String
    /// The load the verdict recommends. Nil (a bodyweight `ready`) does nothing.
    public var suggestKg: Double?

    public init(name: String, suggestKg: Double?) {
        self.name = name
        self.suggestKg = suggestKg
    }
}

/// The seed's view of one `routine_templates` exercise — the fields it reads,
/// nothing more. `RoutineTemplateRow.payload` decodes into this.
public struct SeedTemplateSet: Codable, Sendable, Equatable {
    public var weightKg: Double
    public var reps: Int
    public var rpe: Double?
    public var setType: String?

    public enum CodingKeys: String, CodingKey { case weightKg, reps, rpe, setType }

    public init(weightKg: Double, reps: Int, rpe: Double? = nil, setType: String? = nil) {
        self.weightKg = weightKg
        self.reps = reps
        self.rpe = rpe
        self.setType = setType
    }
}

public struct SeedTemplateExercise: Codable, Sendable, Equatable {
    public var name: String
    public var order: Int
    public var sets: [SeedTemplateSet]

    public init(name: String, order: Int, sets: [SeedTemplateSet]) {
        self.name = name
        self.order = order
        self.sets = sets
    }
}

public struct SeedTemplate: Codable, Sendable, Equatable {
    public var exercises: [SeedTemplateExercise]
    public init(exercises: [SeedTemplateExercise]) { self.exercises = exercises }
}

public enum SeedSource: String, Codable, Sendable {
    case history, template, program
}

public struct SeedRow: Codable, Sendable, Equatable {
    /// The only two kinds a seed can produce. A failure or a drop set is
    /// something you decide in the moment, never something proposed for you.
    public enum Kind: String, Codable, Sendable { case normal, warmup }

    public var kind: Kind
    public var weightKg: Double?
    public var reps: Int?
    /// The remembered rating, or nil when there is none to carry.
    public var rpe: Double?
    /// True when a rating was DROPPED because the seeded work is harder — the
    /// "rate this" pip. See `RpeMemory.resolveSeededRpe`.
    public var rpeStale: Bool
    /// The set this row is seeded from, pre-formatted: `"47kg × 12"`. Nil when
    /// nothing was logged, which is the only honest answer for a cold start.
    public var previous: String?
    /// This row carries a progression bump — the chip.
    public var progressed: Bool
}

public struct SeedExercise: Codable, Sendable, Equatable {
    /// Canonical name, as the program spells it.
    public var name: String
    public var source: SeedSource
    /// The date the rows came from; nil for the template and program tiers.
    public var seededFrom: String?
    public var rows: [SeedRow]
}

public struct SessionSeed: Codable, Sendable, Equatable {
    public var dayKey: String
    public var exercises: [SeedExercise]
}

public enum SessionSeedBuilder {

    /// The sessions a seed — and the progression verdict — may look at, newest
    /// first.
    ///
    /// ── THE THREE FILTERS ───────────────────────────────────────────────────
    /// `day_key` — the rep ceiling and the set count come from the ROUTINE DAY,
    /// not from the movement: Leg Press is 8–12 on Legs A and 12–15 on Legs B.
    /// A session with no day key cannot be attributed to a routine and is
    /// dropped, never pooled.
    ///
    /// `era` — a session from the previous program is not comparable, and a new
    /// block must not inherit the old one's loads.
    ///
    /// `maintenance` — decision 6. A maintenance week is deliberately lighter,
    /// so seeding the week after one from it hands you a target below what you
    /// were lifting a fortnight ago and calls it Previous.
    ///
    /// `AppDatabase.progressionQueue` reads the same list, so the verdict and
    /// the number it pre-fills can never be about different sessions.
    public static func sessionsForSeed(
        _ sessions: [SeedSession], dayKey: String, today: String
    ) -> [SeedSession] {
        let era = Era.forDate(today)
        return sessions
            .filter { $0.dayKey == dayKey && !$0.maintenance && Era.forDate($0.date) == era }
            .sorted { a, b in
                if a.date != b.date { return a.date > b.date }
                if a.startedAt != b.startedAt { return a.startedAt > b.startedAt }
                return a.id < b.id
            }
    }

    /// `"47kg × 12"` — the previous column, as the row prints it.
    public static func previousLabel(weightKg: Double, reps: Int) -> String {
        "\(formatKg(weightKg))kg × \(reps)"
    }

    /// `47`, `49.5`, `13.75` — never `49.50`, never `13.8`. `String(v)` in
    /// JavaScript, which is what the twin builds this label with.
    static func formatKg(_ value: Double) -> String {
        jsIntegerString(jsRound(value * 100) / 100)
    }

    /// One session's rows for one movement, pairs collapsed, in performed order.
    ///
    /// A genuine L/R pair is TWO rows sharing a `pair_id`, and it is ONE set of
    /// work at the weaker side — `min(weight) × min(reps)`, the rule
    /// `SessionVolume.sessionVolumeKg` already scores it by, so a set logged
    /// split seeds exactly what the same set seeds logged unsided. A lone side,
    /// or a bucket that is not exactly one L and one R, is left as the rows it
    /// is: inventing a partner for it would be inventing work.
    ///
    /// `ghost` rows are dropped — a set deliberately not performed is not
    /// evidence.
    public static func collapsePairs(_ sets: [SeedSet]) -> [SeedSet] {
        let sorted = sets.filter { $0.setType != "ghost" }.sorted { $0.order < $1.order }

        var buckets: [String: [SeedSet]] = [:]
        for s in sorted { if let id = pairKey(s) { buckets[id, default: []].append(s) } }

        var done: Set<String> = []
        var out: [SeedSet] = []
        for s in sorted {
            guard let id = pairKey(s) else { out.append(s); continue }
            let bucket = buckets[id] ?? []
            let left = bucket.first { $0.side == "L" }
            let right = bucket.first { $0.side == "R" }
            guard bucket.count == 2, let left, let right else { out.append(s); continue }
            if done.contains(id) { continue }
            done.insert(id)
            var folded = s
            folded.weightKg = Swift.min(left.weightKg, right.weightKg)
            folded.reps = Swift.min(left.reps, right.reps)
            // The collapsed row is one set, not half of two.
            folded.side = nil
            folded.pairId = nil
            // The set is graded at the weaker side, so that is the rating that
            // describes it.
            folded.rpe = weakerSide(left, right).rpe
            out.append(folded)
        }
        return out
    }

    /// The pair id of a genuine two-sided row — a `pair_id` with no side, or a
    /// side with no `pair_id`, is an ordinary set.
    private static func pairKey(_ s: SeedSet) -> String? {
        guard let id = s.pairId, !id.isEmpty, s.side == "L" || s.side == "R" else { return nil }
        return id
    }

    private static func weakerSide(_ left: SeedSet, _ right: SeedSet) -> SeedSet {
        if left.weightKg != right.weightKg { return left.weightKg < right.weightKg ? left : right }
        return left.reps <= right.reps ? left : right
    }

    /// Build one day's seed.
    ///
    /// The DECK is the program's — its exercises, in its order, at its
    /// working-set count for the phase. History supplies the numbers, never the
    /// shape: a session where you did four sets instead of three does not
    /// silently reprogram the day.
    public static func build(
        dayKey: String,
        today: String,
        phase: ProgramPhase,
        sessions: [SeedSession],
        sets: [SeedSet],
        template: SeedTemplate? = nil,
        ready: [SeedProgression] = [],
        program: Program = .onyx5
    ) -> SessionSeed {
        guard let day = program.day(key: dayKey) else { return SessionSeed(dayKey: dayKey, exercises: []) }

        let ordered = sessionsForSeed(sessions, dayKey: dayKey, today: today)
        let known = Set(ordered.map(\.id))

        // (session, canonical name) → its rows. Only sessions that qualified.
        var bySession: [String: [String: [SeedSet]]] = [:]
        for s in sets where known.contains(s.sessionId) {
            bySession[s.sessionId, default: [:]][canon(s.exerciseName), default: []].append(s)
        }

        var templateByName: [String: SeedTemplateExercise] = [:]
        for e in template?.exercises ?? [] { templateByName[canon(e.name)] = e }
        var readyByName: [String: SeedProgression] = [:]
        for r in ready { readyByName[canon(r.name)] = r }

        let exercises = day.exercises(for: phase).map { plan in
            seed(
                plan, phase: phase, ordered: ordered, bySession: bySession,
                templateByName: templateByName, readyByName: readyByName, program: program
            )
        }
        return SessionSeed(dayKey: dayKey, exercises: exercises)
    }

    // MARK: - One movement

    private static func seed(
        _ plan: ProgramExercise,
        phase: ProgramPhase,
        ordered: [SeedSession],
        bySession: [String: [String: [SeedSet]]],
        templateByName: [String: SeedTemplateExercise],
        readyByName: [String: SeedProgression],
        program: Program
    ) -> SeedExercise {
        let name = ExerciseAliases.canonicalName(plan.name)
        let key = canon(plan.name)
        let prescribed = plan.sets(for: phase)
        let floor = Ceilings.parseRepWindow(plan.reps).map { Int($0.floor) }
        let bump = readyByName[key]?.suggestKg

        // ── TIER 1: the newest qualifying session that logged THIS movement ──
        // Newest-first over the whole qualifying list rather than "the last
        // session" alone: a lift you skipped last week has not become a new
        // movement, and falling back to `wk1Kg` for it would say that it had.
        for session in ordered {
            guard let raw = bySession[session.id]?[key], !raw.isEmpty else { continue }
            let rows = collapsePairs(raw)
            guard !rows.isEmpty else { continue }
            let warmups = rows.filter { $0.setType == "warmup" }
            let working = rows.filter { SetTags.isWorkingSet($0.setType) }
            return SeedExercise(
                name: name, source: .history, seededFrom: session.date,
                // Warm-ups are carried, in the order they were performed. A
                // warm-up you did last time is a warm-up you will do again, and
                // it is not one of the sets the program counts — `prescribed`
                // is working sets only.
                rows: warmups.map {
                    row(.warmup, $0.weightKg, $0.reps, nil, previousLabel(weightKg: $0.weightKg, reps: $0.reps), false)
                } + workingRows(working, prescribed: prescribed, floor: floor, bump: bump)
            )
        }

        // ── TIER 2: the stored template ──────────────────────────────────────
        let tplRows = (templateByName[key]?.sets ?? [])
            .filter { $0.setType != "ghost" }
            .map { s -> SeedRow in
                let working = SetTags.isWorkingSet(s.setType)
                let bumped = bump != nil && working
                return row(
                    s.setType == "warmup" ? .warmup : .normal,
                    bumped ? bump : s.weightKg,
                    bumped ? (floor ?? s.reps) : s.reps,
                    seedOf(weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, setType: s.setType),
                    // A template is a shape, not a memory — it carries no date,
                    // so there is no session for a Previous column to be about.
                    nil,
                    bumped
                )
            }
        if !tplRows.isEmpty {
            return SeedExercise(name: name, source: .template, seededFrom: nil, rows: tplRows)
        }

        // ── TIER 3: the program's cold start ─────────────────────────────────
        _ = program
        return SeedExercise(
            name: name, source: .program, seededFrom: nil,
            rows: (0..<Swift.max(0, prescribed)).map { _ in
                // ── A MISSING SEED LOAD IS NIL, NOT ZERO ────────────────────
                // `wk1Kg` is nil for a bodyweight or timed movement, and nil
                // there means "the program prescribes no load" — not "0 kg".
                // The deck renders the two differently, and `Epley`, double
                // progression and every "0 kg × 17" label turn on the same
                // distinction. Each client coerces at its own boundary.
                row(.normal, bump ?? plan.wk1Kg, floor, nil, nil, bump != nil)
            }
        )
    }

    /// The working rows, filled by INDEX against the program's count.
    ///
    /// Short history (you did two sets, the program asks for three) repeats the
    /// last known LOAD at the rep FLOOR — the honest proposal for a set with no
    /// precedent, and what `addSet` already does in the logger. Long history is
    /// truncated: the deck is the plan, and a fourth set is added in the moment,
    /// not proposed.
    ///
    /// A `ready` verdict rewrites every working row to the suggested load at the
    /// floor, which is what makes the rating go stale and the chip appear.
    private static func workingRows(
        _ history: [SeedSet], prescribed: Int, floor: Int?, bump: Double?
    ) -> [SeedRow] {
        var out: [SeedRow] = []
        for i in 0..<Swift.max(0, prescribed) {
            guard let src = i < history.count ? history[i] : history.last else { break }
            let carried = i >= history.count
            out.append(row(
                .normal,
                bump ?? src.weightKg,
                // A timed hold has no rep floor to fall back to; repeat what
                // was held.
                bump != nil || carried ? (floor ?? src.reps) : src.reps,
                seedOf(weightKg: src.weightKg, reps: src.reps, rpe: src.rpe, setType: src.setType),
                previousLabel(weightKg: src.weightKg, reps: src.reps),
                bump != nil
            ))
        }
        return out
    }

    /// The RPE seed a source row leaves behind. Warm-ups are never rated.
    private static func seedOf(weightKg: Double, reps: Int, rpe: Double?, setType: String?) -> RpeSeed? {
        guard let rpe, rpe.isFinite, SetTags.isWorkingSet(setType) else { return nil }
        return RpeSeed(rpe: rpe, weightKg: weightKg, reps: Double(reps))
    }

    /// A seeded row, with the rating resolved against the numbers it opens on.
    private static func row(
        _ kind: SeedRow.Kind, _ weightKg: Double?, _ reps: Int?,
        _ seed: RpeSeed?, _ previous: String?, _ progressed: Bool
    ) -> SeedRow {
        let resolved = RpeMemory.resolveSeededRpe(seed, weightKg: weightKg ?? 0, reps: Double(reps ?? 0))
        return SeedRow(
            kind: kind, weightKg: weightKg, reps: reps,
            rpe: resolved.rpe, rpeStale: resolved.stale,
            previous: previous, progressed: progressed
        )
    }

    private static func canon(_ name: String) -> String {
        ExerciseAliases.canonicalName(name)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }
}
