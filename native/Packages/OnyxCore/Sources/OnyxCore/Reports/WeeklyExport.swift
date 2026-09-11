import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// "Export Week" — a dense, DRY-DATA payload of one training week. A port of
// `src/lib/reports/weeklyExport.ts`, byte for byte.
//
// EXPORT v3, THE TOKEN GRAMMAR. A `#` line is a heading, and a `##` heading
// carries its section's column legend after the heading word. Every data line
// is fields joined by ` · `, so `split(" · ")` is the whole parser. A missing
// value is `—` — never blank, never 0, never an omitted field. A list field
// joins its items with `;` and each item's parts with `:` (or `@` for a time).
//
// Deterministic and pure. Every number is one the app measured; the only
// derived figures live under `## DERIVED`, below every measurement they are
// built from, behind a heading that says so. Pace is the one exception in the
// raw body: arithmetic over two exported facts, and the unit a run is read in.
//
// `setDetail`, `nutrientLine` and `sparkline` are v2's prose renderers. v3's
// document no longer calls them; they stay because the golden vectors pin them.
// `markdownTable` survives inside `trendLedger`, which v3 still prints.
// ─────────────────────────────────────────────────────────────────────────────

public struct WeeklySummary: Codable, Equatable, Sendable {
    public struct PeakDoms: Codable, Equatable, Sendable { public var muscle: String; public var severity: Double; public var date: String }
    public var avgSleepMin: Double?
    public var avgRestingHr: Double?
    public var avgHrvMs: Double?
    public var cardioMinutes: Double?
    public var cardioActiveKcal: Double?
    public var cardioSessions: Int
    public var peakDoms: PeakDoms?
    public var avgSessionRpe: Double?
    public var ratedSessions: Int
    public var ratedSets: Int
    public var workingSets: Int
}

public struct EnergyBalance: Codable, Equatable, Sendable {
    public var daysCounted: Int
    public var intakeKcal: Double?
    public var expenditureKcal: Double?
    public var balanceKcal: Double?
    public var avgBalanceKcal: Double?
    public var avgBmrKcal: Double?
    public var avgActiveKcal: Double?
    public var avgTefKcal: Double?
    public var bmrCarried: Bool
    public var countedDates: [String]
}

public enum WeeklyExport {
    static let dash = "—"

    /// `v.toFixed(digits)`, or `—`.
    static func n(_ v: Double?, _ digits: Int = 0) -> String {
        guard let v, v.isFinite else { return dash }
        return jsToFixed(v, digits)
    }

    /// A number at FULL precision, snapped at 1e-6 against float noise.
    static func exact(_ v: Double?) -> String {
        guard let v, v.isFinite else { return dash }
        return jsIntegerString(jsRound(v * 1e6) / 1e6)
    }

    static func js(_ v: Double) -> String { jsIntegerString(v) }

    static func pad2(_ s: String) -> String { var t = s; while t.count < 2 { t = "0" + t }; return t }

    static func cardioLabel(_ kind: String) -> String {
        kind.isEmpty ? "Cardio" : kind.prefix(1).uppercased() + kind.dropFirst()
    }

    static func weekdayOf(_ date: String, _ days: [ExportDay]) -> String {
        days.first { $0.date == date }?.weekdayLabel ?? ""
    }

    /// en-GB short month names as Node prints them ("Sept", not "Sep"). v3
    /// prints no month name; `Format.dayAndMonth` is the one reader left.
    static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]

    static func month(_ iso: String) -> String {
        guard iso.count >= 7, let m = Int(iso.dropFirst(5).prefix(2)), (1...12).contains(m) else { return "" }
        return months[m - 1]
    }

    public static let fatigueSlotLabels = ["Waking", "Midday", "Before training", "After training", "Night"]
    public static let fatigueLabelsTraining = ["Waking", "Before training", "After training"]
    public static let fatigueLabelsRest = ["Waking", "Midday", "Night"]

    public static func fatigueLabels(isTrainingDay: Bool) -> [String] {
        isTrainingDay ? fatigueLabelsTraining : fatigueLabelsRest
    }

    private static let clockPattern = try! NSRegularExpression(pattern: #"T(\d{2}:\d{2})"#)

    /// "21:27" from a timestamp, in the log's own local wall clock. (The web
    /// falls back to a local-time `Date` parse for non-ISO strings; nothing
    /// this app stores is non-ISO, so that branch reads `—` here.)
    static func clock(_ ts: String?) -> String {
        guard let ts, !ts.isEmpty else { return dash }
        let ns = ts as NSString
        guard let m = clockPattern.firstMatch(in: ts, range: NSRange(location: 0, length: ns.length)) else { return dash }
        return ns.substring(with: m.range(at: 1))
    }

    // MARK: - Nutrients

    static let implausibleFloorMultiple = 2.5

    static func implausible(_ t: NutrientTarget, food: Double, stack: Double) -> Bool {
        if t.kind == .ceiling { return false }
        if stack > 0 { return false }
        return t.target > 0 && food > t.target * implausibleFloorMultiple
    }

    /// One micronutrient line: every target every day, provenance split only when both sides are non-zero.
    public static func nutrientLine(food: [String: Double]?, stack: [String: Double]?) -> String {
        NutrientTargets.all.map { t -> String in
            let f = food?[t.key], k = stack?[t.key]
            let hasF = f.map { $0.isFinite && $0 > 0 } ?? false
            let hasK = k.map { $0.isFinite && $0 > 0 } ?? false
            let total = (hasF ? f! : 0) + (hasK ? k! : 0)
            let tags = [t.kind == .ceiling ? "ceiling" : nil, t.fromStack && !hasF ? "stack" : nil].compactMap { $0 }.joined(separator: ", ")
            let suffix = tags.isEmpty ? "" : " (\(tags))"
            if !hasF && !hasK { return "\(t.label): \(dash)/\(exact(t.target)) \(t.unit)\(suffix)" }
            let split = hasF && hasK ? " (\(exact(f)) food + \(exact(k)) stack)" : ""
            let flag = implausible(t, food: hasF ? f! : 0, stack: hasK ? k! : 0) ? "⚠ " : ""
            return "\(t.label): \(flag)\(exact(total))/\(exact(t.target)) \(t.unit)\(suffix)\(split)"
        }.joined(separator: " · ")
    }

    /// Every "<Micro> <value> <unit> on <date>" the week flagged.
    public static func flaggedNutrients(_ days: [ExportDay]) -> [String] {
        var out: [String] = []
        for d in days {
            for t in NutrientTargets.all {
                let food = d.nutrientsFood?[t.key].map { $0 > 0 ? $0 : 0 } ?? 0
                let stack = d.nutrientsStack?[t.key].map { $0 > 0 ? $0 : 0 } ?? 0
                if implausible(t, food: food, stack: stack) { out.append("\(t.label) \(exact(food)) \(t.unit) on \(d.date)") }
            }
        }
        return out
    }

    // MARK: - Sets

    /// "RPE 8.5 — Hard".
    static func rpeText(_ rpe: Double) -> String { "RPE \(js(rpe)) — \(Effort.rpeLabel(rpe))" }

    /// One display row: a bilateral set, or the two halves of a unilateral one.
    struct SetRow { var left: ExportSet?; var right: ExportSet?; var single: ExportSet? }

    /// Group an exercise's rows for display, deciding PER SET.
    static func toSetRows(_ sets: [ExportSet]) -> [SetRow] {
        var rows: [SetRow] = []
        var byPair: [String: Int] = [:]
        for s in sets {
            if let p = s.pairId, !p.isEmpty {
                let idx: Int
                if let i = byPair[p] { idx = i } else { rows.append(SetRow()); idx = rows.count - 1; byPair[p] = idx }
                if s.side == "R" { rows[idx].right = s } else { rows[idx].left = s }
                continue
            }
            rows.append(SetRow(single: s))
        }
        return rows
    }

    /// Render one exercise's sets — ONE LINE PER SET.
    public static func setDetail(_ sets: [ExportSet], exerciseName: String? = nil) -> [String] {
        if sets.isEmpty { return [dash] }
        let anyRated = sets.contains { !$0.isWarmup && !$0.isGhost && $0.rpe != nil }
        let noneRated = !anyRated && sets.contains { !$0.isWarmup && !$0.isGhost }
        let notReported = "RPE not reported"
        let timed = TimedExercise.isTimed(exerciseName)

        func value(_ w: Double, _ reps: Double) -> String {
            timed ? "\(js(reps)) sec" : SetFormat.isUnloaded(w) ? "\(js(reps)) reps" : "\(js(w)) kg × \(js(reps))"
        }
        func notes(_ s: ExportSet) -> String {
            var bits: [String] = []
            if let r = s.rpe { bits.append(rpeText(r)) }
            else if anyRated && !s.isWarmup && !s.isGhost { bits.append(notReported) }
            if s.isWarmup { bits.append("warm-up") }
            else if s.failure && Effort.rpeLabel(s.rpe).lowercased() != "failure" { bits.append("to failure") }
            if s.dropset == true { bits.append("drop set") }
            if let q = s.quality, let quality = SetTags.quality[q] { bits.append("Set Quality: \(quality.label)") }
            return bits.isEmpty ? "" : " (\(bits.joined(separator: ", ")))"
        }

        var num = 0
        var lines: [String] = []
        for row in toSetRows(sets) {
            if let s = row.single {
                if s.isGhost { lines.append("Skipped: \(value(s.weightKg, s.reps)) (planned)"); continue }
                if s.isWarmup { lines.append("Warm-up: \(value(s.weightKg, s.reps))\(notes(s))"); continue }
                num += 1
                lines.append("Set \(num): \(value(s.weightKg, s.reps))\(notes(s))")
                continue
            }
            let halves = [
                row.left.map { "L \(value($0.weightKg, $0.reps))\(notes($0))" },
                row.right.map { "R \(value($0.weightKg, $0.reps))\(notes($0))" },
            ].compactMap { $0 }
            let lead = row.left ?? row.right
            if lead?.isGhost == true { lines.append("Skipped: \(halves.joined(separator: " · ")) (planned)"); continue }
            if lead?.isWarmup == true { lines.append("Warm-up: \(halves.joined(separator: " · "))"); continue }
            num += 1
            lines.append("Set \(num): \(halves.joined(separator: " · "))")
        }
        return noneRated ? lines + ["_(\(notReported) for any working set)_"] : lines
    }

    // MARK: - Aggregates

    public static func summary(_ input: WeeklyExportInput) -> WeeklySummary {
        let cardio = input.cardio ?? []
        var peak: WeeklySummary.PeakDoms?
        for d in input.doms where d.severity > 0 {
            if peak == nil || d.severity > peak!.severity { peak = .init(muscle: d.muscle, severity: d.severity, date: d.date) }
        }
        let rated = input.sessions.filter { $0.sessionRpe?.isFinite == true }
        // A UNILATERAL PAIR IS ONE SET HERE, as it is everywhere else — the
        // same `toSetRows` the token and prose renderers share, so the fourth
        // caller agrees by construction. A pair counts as RATED when EITHER
        // side carries a rating: the set was rated even if only one arm's
        // effort was recorded. A ghost is not an unrated working set.
        var ratedSets = 0, workingSets = 0
        for s in input.sessions { for ex in s.exercises { for row in toSetRows(ex.sets) {
            let sides = [row.single, row.left, row.right].compactMap { $0 }
            if sides.isEmpty { continue }
            if sides.contains(where: { $0.isWarmup || $0.isGhost }) { continue }
            workingSets += 1
            if sides.contains(where: { $0.rpe?.isFinite == true }) { ratedSets += 1 }
        } } }
        return WeeklySummary(
            avgSleepMin: meanOf(input.days.map(\.sleepMin)),
            avgRestingHr: meanOf(input.days.map(\.restingHr)),
            avgHrvMs: meanOf(input.days.map(\.hrvMs)),
            cardioMinutes: sumOf(cardio.map(\.durationMin)),
            cardioActiveKcal: sumOf(cardio.map(\.kcal)),
            cardioSessions: cardio.count,
            peakDoms: peak,
            avgSessionRpe: meanOf(rated.map(\.sessionRpe)),
            ratedSessions: rated.count,
            ratedSets: ratedSets,
            workingSets: workingSets
        )
    }

    static let sparkBars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
    static let sparkGap = "·"

    /// An eight-level sparkline scaled from ZERO; a missing day is `·`.
    public static func sparkline(_ values: [Double?]) -> String {
        let present = values.compactMap { $0 }.filter(\.isFinite)
        if present.isEmpty { return "" }
        let max = Swift.max(present.max()!, 0)
        return values.map { v -> String in
            guard let v, v.isFinite else { return sparkGap }
            if max <= 0 { return sparkBars[0] }
            let i = Int(jsRound((v / max) * Double(sparkBars.count - 1)))
            return sparkBars[Swift.max(0, Swift.min(sparkBars.count - 1, i))]
        }.joined()
    }

    public static func trendTotals(days: [ExportDay], sessions: [ExportSession], cardio: [ExportCardio] = []) -> TrendTotals {
        TrendTotals(
            avgKcal: meanOf(days.map(\.calories)),
            totalVolumeKg: sumOf(sessions.map(\.volumeKg)),
            avgSteps: meanOf(days.map(\.steps)),
            cardioMinutes: sumOf(cardio.map(\.durationMin)),
            avgWaterMl: meanOf(days.map(\.waterMl)),
            avgWeightKg: meanOf(days.map(\.weightKg))
        )
    }

    /// The week's energy balance — an ESTIMATE. Both sides per day or neither;
    /// BMR carried across gaps forwards then backwards; TEF rides on the intake.
    public static func energyBalance(_ days: [ExportDay]) -> EnergyBalance {
        let empty = EnergyBalance(daysCounted: 0, intakeKcal: nil, expenditureKcal: nil, balanceKcal: nil, avgBalanceKcal: nil, avgBmrKcal: nil, avgActiveKcal: nil, avgTefKcal: nil, bmrCarried: false, countedDates: [])
        let measured: [Double?] = days.map { $0.bmrKcal?.isFinite == true ? $0.bmrKcal : nil }
        // `bmrCarry` is the ONE implementation of the carry; the `## DERIVED
        // tdee` row reads the same array, so the footer cannot disagree.
        let filled = bmrCarry(days)
        var intake = 0.0, burn = 0.0, bmrSum = 0.0, activeSum = 0.0, tefSum = 0.0
        var counted = 0
        var carried = false
        var countedDates: [String] = []
        for (i, d) in days.enumerated() {
            guard let kcal = d.calories, kcal.isFinite, let bmr = filled[i], let active = d.activeKcal, active.isFinite else { continue }
            if measured[i] == nil { carried = true }
            let tef = kcal * Energy.tefFactor
            intake += kcal
            burn += bmr + active + tef
            bmrSum += bmr; activeSum += active; tefSum += tef
            counted += 1
            countedDates.append(d.date)
        }
        if counted == 0 { return empty }
        let c = Double(counted)
        return EnergyBalance(
            daysCounted: counted, intakeKcal: jsRound(intake), expenditureKcal: jsRound(burn), balanceKcal: jsRound(intake - burn),
            avgBalanceKcal: jsRound((intake - burn) / c), avgBmrKcal: jsRound(bmrSum / c), avgActiveKcal: jsRound(activeSum / c),
            avgTefKcal: jsRound(tefSum / c), bmrCarried: carried, countedDates: countedDates
        )
    }

    public enum Align: String, Codable, Sendable { case left, right, center }

    /// A padded markdown table; widths count CODE POINTS.
    public static func markdownTable(header: [String], body: [[String]], align: [Align]) -> [String] {
        let all = [header] + body
        let width = header.indices.map { c in all.map { r in c < r.count ? r[c].unicodeScalars.count : 0 }.max() ?? 0 }
        func pad(_ s: String, _ c: Int) -> String {
            // A cell past the header's width has no column: the web pads it by
            // NaN, which is to say not at all.
            guard c < width.count else { return s }
            let gap = Swift.max(0, width[c] - s.unicodeScalars.count)
            switch align[c] {
            case .left: return s + String(repeating: " ", count: gap)
            case .right: return String(repeating: " ", count: gap) + s
            case .center:
                let left = gap / 2
                return String(repeating: " ", count: left) + s + String(repeating: " ", count: gap - left)
            }
        }
        func line(_ cells: [String]) -> String {
            "| " + cells.indices.map { pad(cells[$0], $0) }.joined(separator: " | ") + " |"
        }
        let rule = "|" + width.indices.map { c -> String in
            let dashes = String(repeating: "-", count: width[c])
            switch align[c] {
            case .left: return ":\(dashes)-"
            case .right: return "-\(dashes):"
            case .center: return ":\(dashes):"
            }
        }.joined(separator: "|") + "|"
        return [line(header), rule] + body.map(line)
    }

    static func directionGlyph(_ cur: Double?, _ prev: Double?) -> String {
        guard let cur, let prev else { return dash }
        let d = cur - prev
        return abs(d) < 1e-9 ? "→" : d > 0 ? "↑" : "↓"
    }

    /// THE CUMULATIVE LEDGER — one row per week, oldest at the top.
    public static func trendLedger(_ weeks: [LedgerWeek]) -> [String] {
        func kcal(_ v: Double?) -> String { v == nil ? dash : n(v) }
        func kg(_ v: Double?) -> String { v == nil ? dash : n(v, 1) }
        func kgExact(_ v: Double?) -> String { v == nil ? dash : exact(jsRound(v! * 100) / 100) }
        func litres(_ v: Double?) -> String { v == nil ? dash : n(v! / 1000, 2) }
        let header = ["Week", "Kcal/day", "Volume kg", "Steps/day", "Cardio min", "Water L/day", "Weight kg", "Δ kg", ""]
        let align: [Align] = [.left, .right, .right, .right, .right, .right, .right, .right, .center]
        let body = weeks.enumerated().map { i, w -> [String] in
            let prev = i > 0 ? weeks[i - 1].totals.avgWeightKg : nil
            let cur = w.totals.avgWeightKg
            let delta: String
            if let cur, let prev {
                delta = abs(cur - prev) < 1e-9 ? "0.00" : "\(cur > prev ? "+" : "−")\(jsToFixed(abs(cur - prev), 2))"
            } else { delta = dash }
            return [w.label, kcal(w.totals.avgKcal), kgExact(w.totals.totalVolumeKg), kcal(w.totals.avgSteps), kcal(w.totals.cardioMinutes), litres(w.totals.avgWaterMl), kg(cur), delta, directionGlyph(cur, prev)]
        }
        return markdownTable(header: header, body: body, align: align)
    }

    // MARK: - v3, the dense token grammar

    /// Every data line is fields joined by this. No value may contain `·`.
    static let sep = " · "

    /// One data line. Nil/empty renders `—`; `0` renders `0`, which is a fact.
    static func fields(_ cells: [String?]) -> String {
        cells.map { $0 == nil || $0!.isEmpty ? dash : $0! }.joined(separator: sep)
    }

    /// A list field: items joined by `;`. Empty renders `—`.
    static func items(_ xs: [String]) -> String { xs.isEmpty ? dash : xs.joined(separator: ";") }

    /// Minutes, whole. EVERY duration in v3 is minutes — one unit, no suffixes.
    static func minutes(_ v: Double?) -> String { n(v, 0) }

    /// Metres → km, 2 dp.
    static func kmOf(_ m: Double?) -> String {
        guard let m, m.isFinite else { return dash }
        return n(m / 1000, 2)
    }

    /// Millilitres → litres, 2 dp.
    static func litresOf(_ ml: Double?) -> String {
        guard let ml, ml.isFinite else { return dash }
        return n(ml / 1000, 2)
    }

    /// A signed weight change, 2 dp. ASCII `-`, like every other v3 figure —
    /// `n()` is `toFixed`, so the document spells one sign one way.

    /// BMR carried across the days that have none — ONE implementation, read by
    /// `energyBalance` and by the `## DERIVED tdee` row, so the document cannot
    /// disagree with its own footer.
    public static func bmrCarry(_ days: [ExportDay]) -> [Double?] {
        var filled: [Double?] = days.map { $0.bmrKcal?.isFinite == true ? $0.bmrKcal : nil }
        if filled.count > 1 {
            for i in 1..<filled.count where filled[i] == nil { filled[i] = filled[i - 1] }
            for i in stride(from: filled.count - 2, through: 0, by: -1) where filled[i] == nil { filled[i] = filled[i + 1] }
        }
        return filled
    }

    /// One set as a token: `75×12@9.5F`, or `L5×15@8|R5×17@9` for a pair. An
    /// absent `@` means the set was NOT RATED, which is why `@—` never appears.
    static func setToken(_ s: ExportSet, timed: Bool) -> String {
        let flags = "\(s.isWarmup ? "W" : "")\(s.isGhost ? "G" : "")\(s.dropset == true ? "D" : "")\(s.failure ? "F" : "")"
        var quality = ""
        if let q = s.quality, !q.isEmpty, SetTags.quality[q] != nil { quality = "Q:\(q)" }
        let rpe = s.rpe?.isFinite == true ? "@\(js(s.rpe!))" : ""
        return "\(exact(s.weightKg))×\(exact(s.reps))\(timed ? "t" : "")\(rpe)\(flags)\(quality)"
    }

    /// An exercise's sets in order, pairs collapsed onto one token.
    static func setTokens(_ ex: ExportExercise) -> [String] {
        let timed = TimedExercise.isTimed(ex.name)
        return toSetRows(ex.sets).map { r in
            if let s = r.single { return setToken(s, timed: timed) }
            return [
                r.left.map { "L\(setToken($0, timed: timed))" },
                r.right.map { "R\(setToken($0, timed: timed))" },
            ].compactMap { $0 }.joined(separator: "|")
        }
    }

    /// `s.replace(/:+$/, '')` — a DOMS token drops the parts nothing filled.
    static func stripTrailingColons(_ s: String) -> String {
        var t = Substring(s)
        while t.last == ":" { t = t.dropLast() }
        return String(t)
    }

    // MARK: - The document

    public static func build(_ input: WeeklyExportInput) -> String {
        let days = input.days, sessions = input.sessions
        let cardio = input.cardio ?? []
        let bodyComp = input.bodyComp ?? []
        var L: [String] = []

        // ── HEADER ────────────────────────────────────────────────────────────
        // Everything the week was ASKED for, on one line. A week run under a
        // single lever names it here and prints no `## LEVERS` section at all.
        let periods = input.targetPeriods ?? []
        let rung: String
        if periods.count == 1 {
            let g = periods[0].goals
            rung = "lever=\(periods[0].leverId ?? "custom") \(n(g.calorie))kcal"
                + " \(n(g.protein))P \(n(g.carbs))C"
                + " \(n(g.fat))F \(n(g.steps))st"
        } else {
            rung = periods.count > 1 ? "lever=mixed" : "lever=—"
        }
        let label = input.weekLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let phase = input.phaseLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        L.append(fields([
            "# ONYX \(label.isEmpty ? "WEEK" : label)",
            "\(input.weekStart)→\(input.weekEnd)",
            input.programLabel,
            phase.isEmpty ? dash : phase,
            rung,
            "goals \(n(input.calorieGoal))kcal \(n(input.proteinGoalG))P"
                + " \(n(input.stepsGoal))st \(n(input.sleepGoalHours, 1))h"
                + " \(input.waterGoalMl == nil ? dash : "\(n(input.waterGoalMl))ml")",
        ]))

        // ── LEVERS ────────────────────────────────────────────────────────────
        // Printed ONLY when the week ran under more than one rung.
        if periods.count > 1 {
            L.append("")
            L.append("## LEVERS" + sep + ["id", "label", "kcal", "P", "C", "F", "steps", "dates"].joined(separator: sep))
            for p in periods {
                L.append(fields([
                    p.leverId ?? "custom", p.label, n(p.goals.calorie), n(p.goals.protein),
                    n(p.goals.carbs), n(p.goals.fat), n(p.goals.steps),
                    p.dates.isEmpty ? dash : "\(p.dates[0])…\(p.dates[p.dates.count - 1])",
                ]))
            }
        }

        // ── DAYS ──────────────────────────────────────────────────────────────
        // One line per day, present even when the day is empty: an omitted row
        // lets a gap read as a zero. Every duration is MINUTES, every distance
        // km, every volume litres — one unit per dimension, no suffixes.
        var bodyByDate: [String: ExportBodyComp] = [:]
        for b in bodyComp { bodyByDate[b.date] = b }
        let fatigueRows = input.fatigue ?? []
        L.append("")
        L.append("## DAYS" + sep + [
            "date", "day", "train", "sleep_min", "deep_min", "rem_min", "core_min", "awake_min",
            "bed", "wake", "onset", "hrv_ms", "rhr", "avg_hr", "spo2_pct", "resp_bpm",
            "wrist_temp_c", "vo2max", "daylight_min", "exercise_min", "stand_hours", "stand_min",
            "steps", "dist_km", "training_min", "active_kcal",
            "kcal", "P", "C", "F", "water_l",
            "supp", "supp_log", "supp_skipped",
            "weight_kg", "fat_pct", "smm_kg", "bmr_kcal",
            "fatigue", "doms", "tags",
        ].joined(separator: sep))
        for day in days {
            let bc = bodyByDate[day.date]
            // Each subjective slot NAMED rather than positional: a rest day and
            // a training day ask different questions in the middle slots.
            let fatigue = fatigueLabels(isTrainingDay: day.isTrainingDay).map { slot -> String in
                let hit = fatigueRows.first { $0.date == day.date && $0.slot == slot }
                return "\(slot):\(hit.map { js($0.level) } ?? dash)"
            }
            // Soreness carries its cause where the log recorded one — delayed
            // onset is the whole point of the measurement.
            let doms = input.doms.filter { $0.date == day.date }.map { x in
                stripTrailingColons([x.muscle, js(x.severity), x.sourceLabel ?? "", x.sourceDate ?? ""].joined(separator: ":"))
            }
            // Flags that change how a number on this line should be READ —
            // never flags that discount it. Every aggregate keeps the real figure.
            var tags: [String] = []
            if let e = day.nutritionException, !e.isEmpty { tags.append("except:\(e)") }
            if day.nutritionEstimated { tags.append("estimated") }
            if let p = day.targetProfile, !p.isEmpty { tags.append("profile:\(p)") }
            if day.weightKg == nil { tags.append("skip:\(WeighIn.skipReason(day.weighInSkipReason))") }
            if day.trackCarbs == false { tags.append("untracked:C") }
            if day.trackFat == false { tags.append("untracked:F") }
            // The wearer disputes the night. A TAG and not a column: the flag is
            // false or absent on almost every row, and a column of zeroes with one
            // 1 in it is the shape this grammar reserves for readings, not for
            // exceptions. `tags` is where "read this line differently" lives.
            if day.sleepInaccurate == true { tags.append("sleep:inaccurate") }
            L.append(fields([
                day.date, day.weekdayLabel, day.isTrainingDay ? "1" : "0",
                minutes(day.sleepMin), minutes(day.deepMin), minutes(day.remMin),
                minutes(day.coreMin), minutes(day.awakeMin),
                clock(day.bedTime), clock(day.wakeTime),
                day.sleepOnsetTrouble == nil ? dash : (day.sleepOnsetTrouble! ? "1" : "0"),
                n(day.hrvMs, 1), n(day.restingHr), n(day.avgHr), n(day.bloodOxygenPct),
                // `signedC` appended "°C"; the column is already named `_c`, and a
                // unit inside a cell is the one thing this grammar promised not to
                // do. The SIGN stays — +0.2 and −0.2 are opposite findings.
                n(day.respiratoryRate, 1), n(day.wristTempDeltaC, 1), n(day.vo2max, 1),
                minutes(day.daylightMin), minutes(day.exerciseMin),
                n(day.standHours), minutes(day.standMin),
                n(day.steps), kmOf(day.distanceM), minutes(day.trainingMin), n(day.activeKcal),
                n(day.calories), n(day.proteinG), n(day.carbsG), n(day.fatG), litresOf(day.waterMl),
                day.supplementsPlanned == nil && day.supplementsTaken == nil
                    ? dash : "\(n(day.supplementsTaken))/\(n(day.supplementsPlanned))",
                items((day.supplementsLog ?? []).map { "\($0.key)@\($0.time ?? dash)" }),
                items(day.supplementsSkipped ?? []),
                n(day.weightKg, 1), n(bc?.bodyFatPct, 1), n(bc?.skeletalMuscleMassKg, 1), n(day.bmrKcal),
                items(fatigue), items(doms), items(tags),
            ]))
        }

        // ── SESSIONS ──────────────────────────────────────────────────────────
        // A session line, then one line per exercise indented two spaces, then
        // one per PR. That indent is the only structure left in the document.
        if !sessions.isEmpty {
            L.append("")
            L.append("## SESSIONS" + sep + [
                "date", "day", "label", "session_no", "started", "ended", "duration_min",
                "avg_bpm", "kcal", "srpe", "sets", "failure_sets", "tonnage_kg", "prs", "estimated",
            ].joined(separator: sep))
            L.append("##   exercise" + sep + ["name", "rep_window", "rest_target/plan_s", "top_kg",
                "set…  — set = load×reps[t][@rpe][W|G|D|F][Q:key], `t` = the count is seconds,"
                + " a unilateral pair is Lset|Rset"].joined(separator: sep))
            L.append("##   PR" + sep + ["name", "load×reps", "axes", "volume_kg", "e1rm_kg (Epley,"
                + " weight × (1 + reps/30) — an ESTIMATE, not a lift that happened)"].joined(separator: sep))
            for s in sessions {
                let weekday = weekdayOf(s.date, days)
                L.append(fields([
                    s.date, weekday.isEmpty ? dash : weekday, s.label,
                    s.sessionNumber == nil ? dash : "#\(js(s.sessionNumber!))",
                    clock(s.startedAt), clock(s.endedAt), minutes(s.durationMin),
                    n(s.avgBpm), n(s.caloriesBurned), s.sessionRpe == nil ? dash : js(s.sessionRpe!),
                    n(s.setCount), n(s.failureSets), exact(s.volumeKg), String(s.prs.count),
                    items([s.caloriesEstimated == true ? "kcal" : "", s.avgBpmEstimated == true ? "bpm" : ""].filter { !$0.isEmpty }),
                ]))
                for ex in s.exercises {
                    let tokens = setTokens(ex)
                    L.append("  " + fields([
                        ex.name,
                        ex.repWindow?.isEmpty == false ? "[\(ex.repWindow!)]" : dash,
                        ex.restTargetSec == nil && ex.restPlanSec == nil
                            ? dash : "\(n(ex.restTargetSec))/\(n(ex.restPlanSec))",
                        exact(ex.topKg),
                    ] + (tokens.isEmpty ? [dash] : tokens)))
                }
                for p in s.prs {
                    L.append("  " + fields([
                        "PR", p.name, "\(exact(p.weightKg))×\(exact(p.reps))",
                        items(p.axes.map { PrEngine.axisLabel($0) }),
                        exact(p.volumeKg), exact(p.e1rmKg),
                    ]))
                }
            }
        }

        // ── CARDIO ────────────────────────────────────────────────────────────
        // Pace is the one derived value the raw body is allowed. `active_kcal`
        // here is ALREADY inside the day's own figure and must not be added on
        // top, which is why `total_kcal` sits beside it rather than replacing it.
        if !cardio.isEmpty {
            L.append("")
            L.append("## CARDIO" + sep + ["date", "day", "kind", "duration_min", "dist_km",
                "pace_min_km", "avg_hr", "active_kcal", "total_kcal", "effort_cr10"].joined(separator: sep))
            for c in cardio {
                let weekday = weekdayOf(c.date, days)
                L.append(fields([
                    c.date, weekday.isEmpty ? dash : weekday, cardioLabel(c.kind),
                    n(c.durationMin, 1), kmOf(c.distanceM),
                    CardioMetrics.formatPace(CardioMetrics.paceMinPerKm(distanceM: c.distanceM, durationMin: c.durationMin)),
                    n(c.avgHr), n(c.kcal), n(c.totalKcal),
                    c.effort == nil ? dash : js(c.effort!),
                ]))
            }
        }

        // ── BODY ──────────────────────────────────────────────────────────────
        // Every compartment in ABSOLUTE kg beside its percentage: a percentage
        // of a falling bodyweight can rise while the tissue shrinks.
        if !bodyComp.isEmpty {
            L.append("")
            L.append("## BODY" + sep + ["date", "weight_kg", "bmi", "fat_pct", "muscle_pct",
                "water_pct", "visceral", "bmr_kcal", "smm_kg", "muscle_mass_kg", "ffm_kg",
                "fat_mass_kg", "protein_kg", "protein_pct", "bone_kg", "water_kg", "whr"].joined(separator: sep))
            for b in bodyComp {
                L.append(fields([
                    b.date, n(b.weightKg, 1), n(b.bmi, 1), n(b.bodyFatPct, 1), n(b.musclePercent, 1),
                    n(b.waterPercent, 1), n(b.visceralFat, 1), n(b.bmr), n(b.skeletalMuscleMassKg, 1),
                    n(b.muscleMassKg, 1), n(b.fatFreeMassKg, 1), n(b.fatMassKg, 1), n(b.proteinMassKg, 1),
                    n(b.proteinPercent, 1), n(b.boneMineralKg, 2), n(b.waterMassKg, 1),
                    n(b.estimatedWaistToHipRatio, 2),
                ]))
            }
        }

        // ── NUTRIENTS ─────────────────────────────────────────────────────────
        // Food and stack kept APART on every key: merging the two is how a
        // supplement gets read as a diet.
        let microDays = days.filter { !($0.nutrientsFood?.isEmpty ?? true) || !($0.nutrientsStack?.isEmpty ?? true) }
        if !microDays.isEmpty {
            L.append("")
            L.append("## NUTRIENTS" + sep + "date" + sep
                + "key=food+stack, in NUTRIENT_TARGETS order, each in that target’s own unit;"
                + " a key with no reading on either side is left off the line")
            for day in microDays {
                L.append(fields([day.date] + NutrientTargets.all.compactMap { t -> String? in
                    let food = day.nutrientsFood?[t.key]
                    let stack = day.nutrientsStack?[t.key]
                    if food == nil && stack == nil { return nil }
                    return "\(t.key)=\(exact(food ?? 0))+\(exact(stack ?? 0))"
                }))
            }
            // The doubt, stated once and only when the week actually has one.
            let flagged = flaggedNutrients(days)
            if !flagged.isEmpty { L.append(fields(["##   implausible", items(flagged)])) }
        }

        // ── SUPPS ─────────────────────────────────────────────────────────────
        // The protocol as `custom_supplements` holds it, never from a constant.
        // What was actually TAKEN rides on each day's line.
        let supps = supplementRows(input.supplementProtocol ?? [])
        if !supps.isEmpty {
            L.append("")
            L.append("## SUPPS" + sep + ["time", "name", "dose", "training_dose", "rest_dose",
                "training_only", "notes"].joined(separator: sep))
            for s in supps {
                L.append(fields([s.time, s.name, s.dose, s.trainingDose, s.restDose,
                                 s.trainingOnly ? "1" : "0", s.notes]))
            }
        }

        // ── WEEK ──────────────────────────────────────────────────────────────
        // Means SKIP missing days rather than counting them as zero; the two
        // totals are honest sums, because a rest day really is a zero.
        let totals = trendTotals(days: days, sessions: sessions, cardio: cardio)
        let week = summary(input)
        let energy = energyBalance(days)
        let weights = days.compactMap { $0.weightKg }.filter(\.isFinite)
        L.append("")
        L.append("## WEEK" + sep + ["tonnage_kg", "working_sets", "rated_sets", "sessions",
            "kcal_avg", "P_avg", "C_avg", "F_avg", "water_l_avg", "steps_avg", "sleep_min_avg",
            "rhr_avg", "hrv_avg", "weight_avg_kg", "weight_first_to_last_kg",
            "srpe_avg", "srpe_rated_sessions", "cardio_min", "cardio_kcal"].joined(separator: sep))
        L.append(fields([
            exact(totals.totalVolumeKg), String(week.workingSets), String(week.ratedSets),
            String(sessions.count),
            n(totals.avgKcal), n(meanOf(days.map(\.proteinG))),
            n(meanOf(days.map(\.carbsG))), n(meanOf(days.map(\.fatG))),
            litresOf(totals.avgWaterMl), n(totals.avgSteps), minutes(week.avgSleepMin),
            n(week.avgRestingHr, 1), n(week.avgHrvMs, 1), n(totals.avgWeightKg, 2),
            // Plain `n()`, no leading `+` on a gain: every other signed number in
            // this document comes out of `n()`, and one grammar wants one convention.
            weights.count > 1 ? n(weights[weights.count - 1] - weights[0], 2) : dash,
            // How hard the week's workouts FELT, and across how many ratings — a
            // mean of 9.0 from one session out of five is not the week's
            // character, and the mean alone cannot say which it is.
            n(week.avgSessionRpe, 2), String(week.ratedSessions),
            n(totals.cardioMinutes, 1), n(week.cardioActiveKcal),
        ]))

        // Sets per muscle against the week's target, and the tonnage behind
        // them. The GRADED figure is direct + indirect; the split rides
        // alongside so a reader can see how much was assistance work.
        if !input.volumeByMuscle.isEmpty || !(input.tonnageByMuscle?.isEmpty ?? true) {
            var tonnage: [String: TonnageByMuscle] = [:]
            for t in input.tonnageByMuscle ?? [] where tonnage[t.muscle] == nil { tonnage[t.muscle] = t }
            var muscles: [String] = []
            var seen = Set<String>()
            for m in input.volumeByMuscle.map(\.muscle) + (input.tonnageByMuscle ?? []).map(\.muscle) where seen.insert(m).inserted {
                muscles.append(m)
            }
            L.append("## WEEK.MUSCLE" + sep + ["muscle", "sets", "target", "direct", "indirect",
                "tonnage_kg", "direct_kg"].joined(separator: sep))
            for muscle in muscles {
                let v = input.volumeByMuscle.first { $0.muscle == muscle }
                let t = tonnage[muscle]
                L.append(fields([muscle, n(v?.sets, 1), n(v?.target, 1), n(v?.directSets, 1),
                                 n(v?.indirectSets, 1), exact(t?.volumeKg), exact(t?.directKg)]))
            }
        }

        // ── LEDGER ────────────────────────────────────────────────────────────
        // The one table in the document, and the one place a table is right.
        if let ledger = input.ledger, !ledger.isEmpty {
            L.append("")
            L.append("## LEDGER" + sep + "every week of the programme, oldest first")
            L.append(contentsOf: trendLedger(ledger))
        }

        // ── DERIVED ───────────────────────────────────────────────────────────
        // The fence. Everything above is a measurement; everything here is
        // arithmetic over those measurements, printed so it can be audited.
        let derived = Derived.week(input)
        let bmrs = bmrCarry(days)
        var batteryByDate: [String: BatteryDay] = [:]
        for b in derived.battery where batteryByDate[b.date] == nil { batteryByDate[b.date] = b }
        L.append("")
        L.append("## DERIVED" + sep + "computed by Onyx — not measured" + sep + "key"
            + sep + "then one value per day, in DAYS order")
        func keyRow(_ key: String, _ value: (ExportDay, Int) -> String) {
            L.append(fields([key] + days.enumerated().map { value($1, $0) }))
        }
        keyRow("load") { d, _ in n(d.readiness?.load, 1) }
        keyRow("acwr") { d, _ in n(batteryByDate[d.date]?.acwr ?? d.readiness?.acwr, 3) }
        keyRow("strainZ") { d, _ in n(batteryByDate[d.date]?.strainZ ?? d.readiness?.strainZ, 2) }
        keyRow("wellness") { d, _ in n(batteryByDate[d.date]?.wellness, 2) }
        // The stress index arrives with the E3 engine. Until then the key is
        // present and every day answers `—`; dropping the row would let a reader
        // conclude the app does not compute stress at all.
        keyRow("stress") { _, _ in dash }
        // `Energy.tdee` and not a fourth hand-rolled `bmr + active + tef`:
        // energy.ts is the canonical arithmetic precisely so the Nexus, the
        // dashboard and this document cannot disagree, and it carries the
        // all-or-nothing null rule that keeps a missing active-energy sync
        // from reading as a 400 kcal deficit.
        keyRow("tdee") { d, i in n(Energy.tdee(bmr: bmrs[i], active: d.activeKcal, intakeKcal: d.calories)) }
        // ── DERIVED.WEEK ──────────────────────────────────────────────────────
        // The energy balance, and it lives HERE rather than in `## WEEK`. Intake
        // is measured, but active energy is a watch estimate, BMR is carried
        // across the days that have none and TEF is a coefficient — three of the
        // four are arithmetic, and the heading over `## WEEK` says everything
        // under it was measured. `energy_excluded` names the days that did NOT
        // enter the estimate, so its width is auditable.
        L.append("## DERIVED.WEEK" + sep + ["balance_kcal", "balance_kcal_day", "tdee_avg",
            "bmr_avg", "active_avg", "tef_avg", "bmr_carried", "energy_days", "energy_excluded"].joined(separator: sep))
        L.append(fields([
            n(energy.balanceKcal), n(energy.avgBalanceKcal),
            energy.expenditureKcal == nil ? dash : n(energy.expenditureKcal! / Double(energy.daysCounted)),
            n(energy.avgBmrKcal), n(energy.avgActiveKcal), n(energy.avgTefKcal),
            energy.bmrCarried ? "1" : "0",
            String(energy.daysCounted),
            items(days.filter { !energy.countedDates.contains($0.date) }.map(\.date)),
        ]))

        L.append(fields(["##   how", "tdee = BMR (from the scale, carried across gaps) + Apple Watch"
            + " active energy + intake × \(js(Energy.tefFactor))",
            "load = session RPE × minutes",
            "acwr = EWMA 7:28 of load",
            "strainZ = z of Foster strain against your own rolling normal",
            "wellness = mean of the answered Hooper items, 0–1",
            "heart rate, calories and steps come off the Apple Watch and are estimates"]))

        return L.joined(separator: "\n")
    }

    // MARK: - Supplements

    /// The stack, deduped and ordered — the shape BOTH renderers read. Nothing
    /// about any particular supplement is known here; every field arrives from
    /// `custom_supplements`.
    public struct SupplementRow: Codable, Equatable, Sendable {
        public var time: String
        public var name: String
        public var dose: String
        public var trainingDose: String?
        public var restDose: String?
        public var trainingOnly: Bool
        public var notes: String?
    }

    /// Deduped by NAME, ordered by the scheduled time — the order the day
    /// happens in. Ties keep insertion order, as JavaScript's stable sort does.
    public static func supplementRows(_ stack: [ExportSupplement]) -> [SupplementRow] {
        func trimmed(_ v: String?) -> String? {
            let t = v?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return t.isEmpty ? nil : t
        }
        var order: [String] = []
        var byName: [String: SupplementRow] = [:]
        for s in stack {
            let name = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty { continue }
            let key = name.lowercased()
            if byName[key] != nil { continue }
            order.append(key)
            byName[key] = SupplementRow(
                time: trimmed(s.time) ?? dash,
                name: name,
                dose: s.dose.trimmingCharacters(in: .whitespacesAndNewlines),
                trainingDose: trimmed(s.trainingDose),
                restDose: trimmed(s.restDose),
                trainingOnly: s.trainingOnly == true,
                notes: trimmed(s.notes)
            )
        }
        return order.map { byName[$0]! }.enumerated()
            .sorted { a, b in
                let c = icuCompare(a.element.time, b.element.time)
                return c == 0 ? a.offset < b.offset : c < 0
            }
            .map(\.element)
    }

    /// The stack as ONE chronological list. A dose that differs by day is
    /// stated as the rule it is rather than arbitrarily picking one column.
    public static func consolidateSupplements(_ stack: [ExportSupplement]) -> [String] {
        supplementRows(stack).map { s in
            let dose: String
            if let t = s.trainingDose, let r = s.restDose, t != r {
                dose = "\(t) on training days / \(r) on rest days"
            } else {
                dose = s.dose
            }
            var parts = ["\(s.time) · \(s.name) — \(dose)"]
            if s.trainingOnly { parts.append("(training days only)") }
            if let notes = s.notes { parts.append("· \(notes)") }
            return parts.joined(separator: " ")
        }
    }
}
