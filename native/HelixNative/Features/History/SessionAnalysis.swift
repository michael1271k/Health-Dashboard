import Foundation
import HelixCore
import HelixData

/// Rows in, HelixCore results out — the glue between the ledger and the
/// Workout Analysis screens. NO arithmetic lives here: every number is
/// `SessionVolume`, `PrEngine`, `SessionDetail`, `Ceilings`, `MuscleCredit` or
/// `Epley`, each of which is held to the TypeScript by golden vectors. What
/// this file decides is which rows go in and in what order, which is the part
/// `src/lib/sessions/save.ts` and `useSessionDetail.ts` get right and a
/// re-implementation would get wrong.
///
/// ── HOW PR DETECTION SELECTS ROWS (mirrors `save.ts`) ───────────────────────
/// The KEY is the exercise id. Baselines are every earlier set of the session's
/// own exercises, carrying `set_type`, `side`, `pair_id` and the stored
/// `est_1rm_kg`; the rep floor is the programmed window for THIS session's
/// day key; `floorFor` is `PrTruth.floor(for:)` through the canonical name;
/// `isTimed` is `TimedExercise.isTimed` through the same name. Candidates are
/// the session's sets in performed order with `date`, `exerciseName` and
/// `setNumber` so `PrSeed` can find an asserted record. Sides are mapped
/// `left`/`right` → `L`/`R` at the boundary (`HistorySetRow.lr`).
enum SessionAnalysis {

    // MARK: - Shapes

    struct Summary: Identifiable, Sendable {
        let id: String
        let date: String
        let dayKey: String?
        let durationMin: Double?
        /// Working sets, a unilateral pair counted once.
        let sets: Int
        let tonnageKg: Double
        let prCount: Int
    }

    struct ExerciseReport: Identifiable {
        var id: String { detail.exerciseId }
        let detail: DetailExercise
        let canonical: String
        let timed: Bool
        let rows: [RowWithPrev]
        let prevDate: String?
        let cue: ProgressionCue?
        let stats: ExerciseStats
        /// "10–12" / "55s", or nil when the program does not prescribe it.
        let window: String?
        /// Working sets that reached the programmed ceiling, and how many there
        /// were. `2/3 @ ceiling` on the ledger header — the reading the
        /// double-progression rule is actually about.
        let atCeiling: Int
        /// Session-best estimated 1RM across every session of this movement,
        /// oldest first — the 40×16 sparkline in the header. Values only: a
        /// sparkline has no axis, so carrying the dates would invite a label.
        let spark: [Double]
    }

    struct TrailSeries: Identifiable {
        let id: String
        let points: [(date: String, kg: Double)]
    }

    struct Report {
        let session: WorkoutSession
        let exercises: [ExerciseReport]
        /// Weighted sets per landmark, descending, untrained muscles absent.
        let muscles: [(muscle: LandmarkMuscle, sets: Double)]
        let cardio: [CardioLogRow]
        let prCount: Int
        /// Every set that was performed, ghosts excluded, a unilateral pair
        /// counted once — the denominator the muscle sheet's weighted total is
        /// read against. NOT `sets`, which is working sets only: warm-ups earn
        /// muscle credit and would otherwise make the two figures disagree.
        let physicalSets: Int
        var tonnageKg: Double { jsRound(exercises.reduce(0) { $0 + $1.detail.volumeKg }) }
        var sets: Int { exercises.reduce(0) { $0 + Int($1.detail.workingSets) } }
    }

    // MARK: - The list

    /// One summary per session, newest first. PR counts come from replaying
    /// the ledger in order, so a record beaten last month still shows on the
    /// session that set it — `personal_records` is a current-best table and
    /// would not.
    // ponytail: baselines are rebuilt per session from that session's
    // exercises' history — O(sessions × their history). Fine at a few thousand
    // rows; an incremental index if the ledger ever reaches six figures.
    static func summaries(_ sessions: [WorkoutSession], ledger: [HistorySetRow]) -> [Summary] {
        let bySession = Dictionary(grouping: ledger, by: \.sessionId)
        var history: [String: [HistorySetRow]] = [:]
        var out: [Summary] = []
        for session in sessions.reversed() {   // oldest first
            let rows = bySession[session.id] ?? []
            let groups = grouped(rows)
            let prior = groups.flatMap { history[$0.exerciseId] ?? [] }
            let pr = detect(groups: groups, prior: prior, dayKey: session.dayKey, date: session.date)
            for g in groups { history[g.exerciseId, default: []] += g.sets }
            let working = rows.filter { SetTags.isWorkingSet($0.setType) }
            out.append(Summary(
                id: session.id, date: session.date, dayKey: session.dayKey, durationMin: session.durationMin,
                sets: SessionDetail.toRows(working.map(detailSet)).filter { $0.num != nil }.count,
                tonnageKg: SessionVolume.sessionVolumeKg(working.map(volumeSet)),
                prCount: pr.prCount
            ))
        }
        return out.reversed()
    }

    // MARK: - The report

    static func report(_ session: WorkoutSession, rows: [HistorySetRow], history: [HistorySetRow], cardio: [CardioLogRow]) -> Report {
        let groups = grouped(rows)
        // The ledger is in performed order, so "prior" is everything before
        // this session's first row — a same-day session is ordered by start.
        let cut = history.firstIndex { $0.sessionId == session.id } ?? history.endIndex
        let prior = Array(history[..<cut])
        let priorByEx = Dictionary(grouping: prior, by: \.exerciseId)
        let pr = detect(groups: groups, prior: prior, dayKey: session.dayKey, date: session.date)

        var exercises: [ExerciseReport] = []
        var i = 0   // index into pr.perSet, which is in `groups` order
        for (order, g) in groups.enumerated() {
            let canonical = ExerciseAliases.canonicalName(g.name)
            let timed = TimedExercise.isTimed(canonical)
            var sets: [DetailSet] = []
            for r in g.sets {
                let d = pr.perSet[i]; i += 1
                var s = detailSet(r)
                s.isPr = !d.axes.isEmpty
                s.est1rmKg = d.est1rm
                s.prAxes = d.axes.map(\.rawValue)
                sets.append(s)
            }
            let working = sets.filter { SetTags.isWorkingSet($0.setType) }
            let detail = CoreBridge.detailExercise(
                exerciseId: g.exerciseId, name: canonical, order: Double(order), sets: sets,
                workingSets: Double(SessionDetail.toRows(working).count),
                topKg: working.map(\.weightKg).max() ?? 0,
                volumeKg: jsRound(SessionVolume.sessionVolumeKg(working.map { VolumeSet(weightKg: $0.weightKg, reps: $0.reps, side: $0.side, pairId: $0.pairId, setType: $0.setType) })),
                bestEst1rm: working.compactMap(\.est1rmKg).max(),
                prAxes: pr.axesByKey.first { $0.key == g.exerciseId }?.axes.map(\.rawValue)
            )

            // The previous time this movement was trained: its working sets,
            // one entry per PHYSICAL set (a pair is two entries), which is what
            // `rowsWithPrev` consumes.
            let prevSession = priorByEx[g.exerciseId]?.last?.sessionId
            let prevRows = (priorByEx[g.exerciseId] ?? []).filter { $0.sessionId == prevSession && SetTags.isWorkingSet($0.setType) }
            let prev = prevRows.map { HistorySet(weightKg: $0.weightKg, reps: Double($0.reps), rpe: $0.rpe, setType: $0.setType, side: $0.lr, pairId: $0.pairId) }

            // Double progression over the last two sessions, newest LAST.
            let ladder = [prevRows, g.sets.filter { SetTags.isWorkingSet($0.setType) }]
                .filter { !$0.isEmpty }
                .map { $0.map { WorkingSet(weightKg: $0.weightKg, reps: Double($0.reps)) } }
            let verdict: ProgressionVerdict
            let window: String?
            if timed {
                let target = Ceilings.holdTarget(for: canonical, dayKey: session.dayKey)
                verdict = Ceilings.timedProgressionVerdict(ladder, targetSec: target)
                window = target.map { "\(jsIntegerString($0))s" }
            } else {
                let w = Ceilings.repWindow(for: canonical, dayKey: session.dayKey)
                verdict = Ceilings.progressionVerdict(ladder, ceiling: w?.ceiling)
                window = w.map { "\(jsIntegerString($0.floor))–\(jsIntegerString($0.ceiling))" }
            }
            let cue = SessionDetail.progressionCue(
                CoreBridge.cueProgression(state: verdict.state.rawValue, ceiling: verdict.ceiling, suggestKg: verdict.suggestKg),
                timed: timed, unit: "kg", toDisplay: { $0 }
            )

            // The ceiling this session's sets were judged against — the same
            // number `verdict` used, so the header and the cue cannot disagree.
            let ceiling: Double? = timed
                ? Ceilings.holdTarget(for: canonical, dayKey: session.dayKey)
                : Ceilings.repWindow(for: canonical, dayKey: session.dayKey)?.ceiling
            let workingRows = g.sets.filter { SetTags.isWorkingSet($0.setType) }
            let atCeiling = ceiling.map { c in workingRows.filter { Double($0.reps) >= c }.count } ?? 0

            exercises.append(ExerciseReport(
                detail: detail, canonical: canonical, timed: timed,
                rows: SessionDetail.rowsWithPrev(SessionDetail.toRows(sets), prev: prev),
                prevDate: prevRows.first?.date,
                cue: cue, stats: SessionDetail.exerciseStats(detail), window: window,
                atCeiling: atCeiling,
                spark: sessionBestE1rm((priorByEx[g.exerciseId] ?? []) + g.sets).map(\.kg)
            ))
        }

        // Muscle focus: warm-ups count, ghosts do not, a pair is one set.
        let credit = MuscleCredit.weightedSets(groups.map { g in
            MuscleCredit.Contribution(physicalSets: physicalSets(g.sets), movers: MuscleMap.resolveMovers(g.name))
        })
        var muscles: [(muscle: LandmarkMuscle, sets: Double)] = []
        for (muscle, value) in credit {
            let sets = jsRound(value * 10) / 10
            if sets > 0 { muscles.append((muscle: muscle, sets: sets)) }
        }
        muscles.sort { a, b in a.sets != b.sets ? a.sets > b.sets : a.muscle.rawValue < b.muscle.rawValue }

        // ── NO MULTI-SERIES TRAIL, AND NO HIGHLIGHTS LIST ───────────────────
        // Wave 7 drew a six-series est-1RM chart at the bottom of this report
        // and a "Records" list above it. §5.4 deletes both: the per-exercise
        // trail is now a 40×16 sparkline in each ledger header (`spark`, above),
        // where it sits beside the sets it describes instead of asking the
        // reader to match six colours to six names; and a record is a gold row
        // in the ledger with the previous set printed under it, which answers
        // "what did it beat" in place rather than in a second list.
        return Report(
            session: session, exercises: exercises,
            muscles: muscles, cardio: cardio, prCount: pr.prCount,
            physicalSets: groups.reduce(0) { $0 + physicalSets($1.sets) }
        )
    }

    // MARK: - Exercise history

    /// Session-best estimated 1RM per day, oldest first, over WORKING sets —
    /// `useCharts.collapseToSessionBest`. A stored 0 is "missing" (`||`), and a
    /// row without a stored value is estimated; an unloaded set has none and
    /// simply does not plot.
    static func sessionBestE1rm(_ rows: [HistorySetRow]) -> [(date: String, kg: Double)] {
        var best: [String: Double] = [:]
        for r in rows where SetTags.isWorkingSet(r.setType) {
            let stored = r.est1rmKg.flatMap { $0 > 0 ? $0 : nil }
            guard let kg = stored ?? Epley.oneRepMax(weight: r.weightKg, reps: Double(r.reps)) else { continue }
            best[r.date] = max(best[r.date] ?? 0, kg)
        }
        return best.keys.sorted().map { (date: $0, kg: best[$0]!) }
    }

    // MARK: - Row selection

    struct Group {
        let exerciseId: String
        let name: String
        let sets: [HistorySetRow]
    }

    /// One session's rows by exercise, exercises in first-seen order, sets in
    /// performed order within each.
    static func grouped(_ rows: [HistorySetRow]) -> [Group] {
        var order: [String] = []
        var by: [String: [HistorySetRow]] = [:]
        for r in rows {
            if by[r.exerciseId] == nil { order.append(r.exerciseId) }
            by[r.exerciseId, default: []].append(r)
        }
        return order.map { id in
            let sets = by[id]!.sorted { ($0.setIndex, $0.foldOrder) < ($1.setIndex, $1.foldOrder) }
            return Group(exerciseId: id, name: sets[0].exerciseName, sets: sets)
        }
    }

    /// `buildBaselines` over the prior rows + `detectSessionPrs` over the
    /// session, exactly as `save.ts` feeds them. `perSet` comes back in
    /// `groups`-flattened order.
    static func detect(groups: [Group], prior: [HistorySetRow], dayKey: String?, date: String) -> SessionPrResult {
        var nameByEx: [String: String] = [:]
        for g in groups { nameByEx[g.exerciseId] = ExerciseAliases.canonicalName(g.name) }
        func name(_ key: String) -> String { nameByEx[key] ?? "" }
        func floor(_ key: String) -> Double? { Ceilings.repWindow(for: name(key), dayKey: dayKey)?.floor }

        let baselines = PrEngine.buildBaselines(
            prior.map {
                BaselineSetRow(
                    key: $0.exerciseId, weightKg: $0.weightKg, reps: Double($0.reps), est1rm: $0.est1rmKg,
                    setType: $0.setType, repFloor: floor($0.exerciseId), pairId: $0.pairId, side: $0.lr
                )
            },
            isTimed: { TimedExercise.isTimed(name($0)) },
            floorFor: { PrTruth.floor(for: name($0)) }
        )
        let candidates = groups.flatMap { g in
            g.sets.map { s in
                PrCandidateSet(
                    key: s.exerciseId, weightKg: s.weightKg, reps: Double(s.reps), setType: s.setType,
                    timed: TimedExercise.isTimed(name(s.exerciseId)), repFloor: floor(s.exerciseId),
                    pairId: s.pairId, side: s.lr, date: date, exerciseName: name(s.exerciseId), setNumber: s.setIndex
                )
            }
        }
        return PrEngine.detectSessionPrs(candidates, baselines)
    }

    /// Ghosts excluded, a pair once.
    static func physicalSets(_ sets: [HistorySetRow]) -> Int {
        var seen = Set<String>()
        var n = 0
        for s in sets where s.setType != "ghost" {
            if let p = s.pairId, !p.isEmpty {
                if !seen.insert(p).inserted { continue }
            }
            n += 1
        }
        return n
    }

    static func detailSet(_ r: HistorySetRow) -> DetailSet {
        CoreBridge.detailSet(
            setNumber: Double(r.setIndex), weightKg: r.weightKg, reps: Double(r.reps), rpe: r.rpe,
            est1rmKg: r.est1rmKg, setType: r.setType, side: r.lr, pairId: r.pairId
        )
    }

    static func volumeSet(_ r: HistorySetRow) -> VolumeSet {
        VolumeSet(weightKg: r.weightKg, reps: Double(r.reps), side: r.lr, pairId: r.pairId, setType: r.setType)
    }

    /// "Legs A" for a day key, the key itself tidied when the program does not
    /// know it (a Helix-4 or PPL session).
    static func dayLabel(_ dayKey: String?) -> String? {
        guard let dayKey, !dayKey.isEmpty else { return nil }
        return Program.helix5.day(key: dayKey)?.label
            ?? dayKey.split(separator: "_").map(\.capitalized).joined(separator: " ")
    }
}
