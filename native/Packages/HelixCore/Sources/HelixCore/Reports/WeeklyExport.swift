import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// "Export Week" — a dense, DRY-DATA payload of one training week. A port of
// `src/lib/reports/weeklyExport.ts`, byte for byte.
//
// Deterministic and pure. Missing data is `—`, never omitted and never a zero.
// Every number is one the app measured; nothing above the Derived heading is
// computed (pace is the one arithmetic allowed — two exported facts). Day Score
// and Battery are not exported: they are HELIX's opinions.
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

    static func plural(_ count: Int, _ word: String) -> String { "\(count) \(word)\(count == 1 ? "" : "s")" }

    static func weighIn(_ kg: Double?, _ skipReason: String?) -> String {
        if let kg, kg.isFinite { return "weight \(n(kg, 1)) kg" }
        return "weight \(dash) [Skip: \(WeighIn.skipReason(skipReason))]"
    }

    static func cardioLabel(_ kind: String) -> String {
        kind.isEmpty ? "Cardio" : kind.prefix(1).uppercased() + kind.dropFirst()
    }

    /// `+70` / `−70` / `0`.
    static func signed(_ v: Double) -> String { v > 0 ? "+\(js(v))" : v < 0 ? "−\(js(abs(v)))" : "0" }

    static func weekdayOf(_ date: String, _ days: [ExportDay]) -> String {
        days.first { $0.date == date }?.weekdayLabel ?? ""
    }

    /// en-GB short month names as Node prints them ("Sept", not "Sep").
    static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]

    static func month(_ iso: String) -> String {
        guard iso.count >= 7, let m = Int(iso.dropFirst(5).prefix(2)), (1...12).contains(m) else { return "" }
        return months[m - 1]
    }

    /// "Sun 16, Mon 17, Tue 18 & Wed 19 Aug" — the month once at the end unless the run crosses one.
    static func dayRangeLabel(_ dates: [String], _ days: [ExportDay]) -> String {
        if dates.isEmpty { return dash }
        let spans = Set(dates.map(month)).count > 1
        let parts = dates.map { iso -> String in
            let day = Int(iso.count >= 10 ? String(iso.dropFirst(8).prefix(2)) : "") ?? 0
            let wd = weekdayOf(iso, days)
            return "\(wd) \(day)\(spans ? " \(month(iso))" : "")".trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let joined = parts.count == 1 ? parts[0] : "\(parts.dropLast().joined(separator: ", ")) & \(parts[parts.count - 1])"
        return spans ? joined : "\(joined) \(month(dates[dates.count - 1]))"
    }

    /// "7h 20m".
    static func sleepLong(_ min: Double?) -> String {
        guard let min, min.isFinite else { return dash }
        let h = (min / 60).rounded(.down)
        return "\(js(h))h \(pad2(js(jsRound(min - h * 60))))m"
    }

    static func signedC(_ v: Double?) -> String {
        guard let v, v.isFinite else { return dash }
        return "\(v > 0 ? "+" : "")\(jsToFixed(v, 1))°C"
    }

    /// "7h32" — the compact form for the summary.
    static func sleep(_ min: Double?) -> String {
        guard let min else { return dash }
        return "\(js((min / 60).rounded(.down)))h\(pad2(js(jsRound(min.truncatingRemainder(dividingBy: 60)))))"
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

    /// Whole days between two ISO dates. Nil when either is missing.
    static func daysBetween(_ from: String?, _ to: String) -> Double? {
        guard let from, !from.isEmpty, let a = ISODate.dayNumber(from), let b = ISODate.dayNumber(to) else { return nil }
        return Double(b - a)
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
        var ratedSets = 0, workingSets = 0
        for s in input.sessions { for ex in s.exercises { for set in ex.sets {
            if set.isWarmup || set.isGhost { continue }
            workingSets += 1
            if let r = set.rpe, r.isFinite { ratedSets += 1 }
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
        var filled = measured
        if filled.count > 1 {
            for i in 1..<filled.count where filled[i] == nil { filled[i] = filled[i - 1] }
            for i in stride(from: filled.count - 2, through: 0, by: -1) where filled[i] == nil { filled[i] = filled[i + 1] }
        }
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

    static let zoneWord: [VolumeZone: String] = [.under: "UNDER", .building: "building", .optimal: "on target", .over: "OVER", .na: "—"]

    // MARK: - The document

    public static func build(_ input: WeeklyExportInput) -> String {
        let days = input.days, sessions = input.sessions
        var L: [String] = []

        L.append("# WEEK \(input.weekStart) → \(input.weekEnd)\(input.weekLabel.map { $0.isEmpty ? "" : " · \($0)" } ?? "")")
        L.append("")
        L.append("**Program:** \(input.programLabel)")
        if let phase = input.phaseLabel?.trimmingCharacters(in: .whitespacesAndNewlines), !phase.isEmpty { L.append("**Phase:** \(phase)") }

        let ranges = Context.rangesIn(days.map { StampedDay(date: $0.date, exception: $0.nutritionException) })
        for r in ranges { L.append("**Context:** \(Context.rangeLabel(r))") }
        L.append("")

        L.append("## Targets & Levers")
        L.append("")
        let periods = input.targetPeriods ?? []
        if !periods.isEmpty {
            for (i, p) in periods.enumerated() {
                let g = p.goals
                L.append("- **\(p.label)** — \(n(g.calorie)) kcal · \(n(g.protein))P / \(n(g.carbs))C / \(n(g.fat))F · \(n(g.steps)) steps")
                L.append("    - **\(p.label) was active on \(dayRangeLabel(p.dates, days))** — \(plural(p.dates.count, "day")).")
                if i > 0 {
                    let prev = periods[i - 1]
                    L.append("    - Changed from **\(prev.label)** on \(weekdayOf(p.dates[0], days)) \(p.dates[0]) (\(signed(g.calorie - prev.goals.calorie)) kcal, \(signed((g.steps ?? 0) - (prev.goals.steps ?? 0))) steps)")
                }
            }
            if periods.count == 1 { L.append("- Unchanged all week.") }
        } else {
            L.append("- **Targets:** \(n(input.calorieGoal)) kcal · \(n(input.proteinGoalG)) g protein · \(n(input.stepsGoal)) steps")
        }
        let unchanged = periods.count > 1 ? " — unchanged all week" : ""
        L.append("- Sleep target: \(n(input.sleepGoalHours, 1)) h\(unchanged)")
        if let water = input.waterGoalMl { L.append("- Water target: \(n(water / 1000, 1)) L\(unchanged)") }
        L.append("")

        var labelsByDate: [String: [String]] = [:]
        var sessionsByDate: [String: [ExportSession]] = [:]
        for s in sessions { labelsByDate[s.date, default: []].append(s.label); sessionsByDate[s.date, default: []].append(s) }
        var bodyByDate: [String: ExportBodyComp] = [:]
        for b in input.bodyComp ?? [] { bodyByDate[b.date] = b }
        var cardioByDate: [String: [ExportCardio]] = [:]
        for c in input.cardio ?? [] { cardioByDate[c.date, default: []].append(c) }

        // ── Weekly summary ──
        do {
            let w = summary(input)
            let dLabel = ["none", "mild", "moderate", "severe"]
            L.append("## Weekly summary")
            L.append("")
            L.append("- Sleep (avg): \(sleep(w.avgSleepMin))")
            L.append("- Resting HR (avg): \(n(w.avgRestingHr, 1))\(w.avgRestingHr != nil ? " bpm" : "")")
            L.append("- HRV (avg): \(n(w.avgHrvMs, 1))\(w.avgHrvMs != nil ? " ms" : "")")
            L.append("- Cardio: \(n(w.cardioMinutes)) min across \(plural(w.cardioSessions, "session")) · \(n(w.cardioActiveKcal)) active kcal")
            L.append("- Average workout effort: \(w.avgSessionRpe != nil ? "\(n(w.avgSessionRpe, 1))/10 CR10 across \(plural(w.ratedSessions, "rated session"))" : "not rated")")
            L.append("- Per-set effort coverage: \(w.ratedSets) of \(plural(w.workingSets, "working set")) rated")
            if let p = w.peakDoms {
                L.append("- Highest DOMS: \(p.muscle) — \(severityWord(p.severity, dLabel)) (\(p.date))")
            } else {
                L.append("- Highest DOMS: none reported")
            }
            L.append("")
        }

        // ── Days ──
        L.append("## Days")
        L.append("")
        for d in days {
            let performed = labelsByDate[d.date]
            let offPlan = performed != nil && !d.isTrainingDay
            let workout = performed?.joined(separator: " + ") ?? (d.isTrainingDay ? "not logged" : nil)
            let carbsCell = d.trackCarbs == false ? "\(n(d.carbsG))C (untracked)" : "\(n(d.carbsG))C"
            let fatCell = d.trackFat == false ? "\(n(d.fatG))F (untracked)" : "\(n(d.fatG))F"
            let macros = [d.proteinG, d.carbsG, d.fatG].contains { $0 != nil } ? " (\(n(d.proteinG))P / \(carbsCell) / \(fatCell))" : ""
            let shapeTag = d.targetProfile.map { $0.isEmpty ? "" : " [\($0)]" } ?? ""

            L.append("- **\(d.weekdayLabel) \(d.date)** · \(performed != nil || d.isTrainingDay ? "Workout" : "Rest")\(offPlan ? " (off-plan / swapped)" : "")\(workout.map { " · \($0)" } ?? "")")

            L.append("    - Sleep & Vitals: Sleep: \(sleepLong(d.sleepMin)) · HRV: \(n(d.hrvMs)) ms · Resting HR: \(n(d.restingHr)) bpm"
                + " · Wrist Temp: \(signedC(d.wristTempDeltaC))"
                + " · Blood O2: \(d.bloodOxygenPct != nil ? "\(n(d.bloodOxygenPct))%" : dash)"
                + " · Avg HR (daytime): \(d.avgHr != nil ? "\(n(d.avgHr)) bpm" : dash)"
                + " · Respiratory Rate: \(d.respiratoryRate != nil ? "\(n(d.respiratoryRate, 1)) br/min" : dash)"
                + " · VO2 Max: \(d.vo2max != nil ? "\(n(d.vo2max, 1)) ml/kg/min" : dash)")

            L.append("    - Sleep Stages: Deep: \(sleepLong(d.deepMin)) · REM: \(sleepLong(d.remMin)) · Core: \(sleepLong(d.coreMin)) · Awake: \(sleepLong(d.awakeMin))"
                + " · Bed: \(clock(d.bedTime)) · Wake: \(clock(d.wakeTime))"
                + " · Onset: \(d.sleepOnsetTrouble == nil ? dash : d.sleepOnsetTrouble! ? "hard to fall asleep" : "normal")")

            L.append("    - Macros: \(n(d.calories)) kcal\(macros)\(shapeTag)\(ExceptionDay.tag(d.nutritionException))\(ExceptionDay.estimatedTag(d.nutritionEstimated))"
                + " · water \(n(d.waterMl.map { $0 / 1000 }, 1)) L")

            L.append("    - Nutrients: \(nutrientLine(food: d.nutrientsFood, stack: d.nutrientsStack))")
            L.append("    - Activity: \(n(d.steps)) steps"
                + (d.distanceM != nil ? " · \(n(d.distanceM! / 1000, 2)) km" : "")
                + (d.trainingMin != nil ? " · \(n(d.trainingMin)) min training" : "")
                + " · Exercise: \(d.exerciseMin != nil ? "\(n(d.exerciseMin)) min" : dash)"
                + " · Stand: \(d.standHours != nil ? "\(n(d.standHours)) h" : dash)"
                + (d.standMin != nil ? " (\(n(d.standMin)) min)" : "")
                + " · Daylight: \(d.daylightMin != nil ? "\(n(d.daylightMin)) min" : dash)")

            do {
                let log = d.supplementsLog ?? []
                let taken: Double? = d.supplementsTaken ?? (log.isEmpty ? nil : Double(log.count))
                let count = "\(taken != nil ? n(taken) : dash) of \(d.supplementsPlanned != nil ? n(d.supplementsPlanned) : dash) taken"
                var order: [String] = []
                var byTime: [String: [String]] = [:]
                for i in log {
                    let t = i.time ?? "—"
                    if byTime[t] == nil { order.append(t) }
                    byTime[t, default: []].append(i.key)
                }
                let items = byTime.isEmpty ? "" : " · " + order.sorted { icuCompare($0, $1) < 0 }.map { "\($0) \(byTime[$0]!.joined(separator: ", "))" }.joined(separator: " · ")
                let skipped = (d.supplementsSkipped?.isEmpty == false) ? " · SKIPPED: \(d.supplementsSkipped!.joined(separator: ", "))" : ""
                L.append("    - Supplements: \(count)\(items)\(skipped)")
            }

            if let b = bodyByDate[d.date], let w = b.weightKg, w.isFinite {
                L.append("    - Weight Data: Weight: \(n(w, 1)) kg · BMI: \(n(b.bmi, 1))"
                    + " · Body Fat Percentage: \(n(b.bodyFatPct, 1))% · Fat Mass: \(n(b.fatMassKg, 1)) kg"
                    + " · Muscle Percentage: \(n(b.musclePercent, 1))%"
                    + " · Muscle Mass (Lean Soft Tissue): \(n(b.muscleMassKg, 1)) kg"
                    + " · Water Percentage: \(n(b.waterPercent, 1))% · Body Water Mass: \(n(b.waterMassKg, 1)) kg"
                    + " · Protein Percentage: \(n(b.proteinPercent, 1))% · Protein Mass: \(n(b.proteinMassKg, 1)) kg"
                    + " · Bone Mineral Percentage: \(n(b.boneMineral, 1))%"
                    + " · Bone Mineral Content: \(n(b.boneMineralKg, 2)) kg"
                    + " · Skeletal Muscle Mass: \(n(b.skeletalMuscleMassKg, 1)) kg"
                    + " · Visceral Fat Rating: \(n(b.visceralFat))"
                    + " · Basal Metabolic Rate: \(n(b.bmr))"
                    + " · Estimated Waist to Hip Ratio: \(n(b.estimatedWaistToHipRatio, 2))"
                    + " · Fat-free body weight: \(n(b.fatFreeMassKg, 1)) kg.")
            } else {
                L.append("    - Weight Data: \(weighIn(d.weightKg, d.weighInSkipReason))")
            }

            for s in sessionsByDate[d.date] ?? [] {
                L.append("")
                L.append("    - **Session\(s.sessionNumber != nil ? " #\(js(s.sessionNumber!))" : ""): \(s.label)**")
                let window = (s.startedAt?.isEmpty == false)
                    ? "Started: \(clock(s.startedAt))\((s.endedAt?.isEmpty == false) ? " · Ended: \(clock(s.endedAt))" : "") · "
                    : ""
                L.append("        - Session Metadata: \(window)Duration: \(n(s.durationMin)) Minutes"
                    + " · Volume: \(exact(s.volumeKg)) kg"
                    + " · Sets: \(n(s.setCount))\((s.failureSets ?? 0) != 0 ? " (\(n(s.failureSets)) to failure)" : "")"
                    + " · Calories: \(n(s.caloriesBurned)) kcal\(s.caloriesEstimated == true ? " [Estimated]" : "")"
                    + " · Avg HR: \(s.avgBpm != nil ? "\(n(s.avgBpm))\(s.avgBpmEstimated == true ? " [Estimated]" : "")" : dash)"
                    + " · PRs: \(s.prs.count)"
                    + " · Effort: \(s.sessionRpe != nil ? "\(n(s.sessionRpe, 1))/10 CR10" : "Not reported")")
                for e in s.exercises {
                    let restNote = (e.restTargetSec != nil && e.restPlanSec != nil && e.restTargetSec != e.restPlanSec)
                        ? " · rest \(js(e.restTargetSec!))s (adjusted from \(js(e.restPlanSec!))s)" : ""
                    L.append("        - **\(e.name)**\(e.repWindow.map { $0.isEmpty ? "" : " _(target \($0))_" } ?? "")\(restNote):")
                    for line in setDetail(e.sets, exerciseName: e.name) { L.append("            - \(line)") }
                }
                if !s.prs.isEmpty {
                    L.append("        - PRs:")
                    let dayContext = Context.fromDayLabel(d.nutritionException)
                    let tag = dayContext == .normal ? "" : " _(under \(Context.meta[dayContext]!.label))_"
                    for p in s.prs {
                        let timed = TimedExercise.isTimed(p.name)
                        let axes = p.axes.map { a -> String in
                            let label = PrEngine.axisLabel(a, timed: timed)
                            if a == .volume, let v = p.volumeKg { return "\(label): \(exact(v)) kg" }
                            if a == .e1rm, let e = p.e1rmKg { return "\(label): \(n(e, 2)) kg" }
                            return label
                        }
                        L.append("            - **\(p.name)** \(SetFormat.format(weightKg: p.weightKg, reps: p.reps, timed: timed))\(axes.isEmpty ? "" : " — \(axes.joined(separator: ", "))")\(tag)")
                    }
                }
            }

            for c in cardioByDate[d.date] ?? [] {
                let pace = CardioMetrics.paceMinPerKm(distanceM: c.distanceM, durationMin: c.durationMin)
                let bits = [
                    "time \(c.durationMin != nil ? "\(n(c.durationMin)) min" : dash)",
                    "distance \(c.distanceM != nil ? "\(n(c.distanceM! / 1000, 2)) km" : dash)",
                    "pace \(pace != nil ? CardioMetrics.formatPace(pace) : dash)",
                    "active \(c.kcal != nil ? "\(n(c.kcal)) kcal" : dash)",
                    "total \(c.totalKcal != nil ? "\(n(c.totalKcal)) kcal" : dash)",
                    "avg HR \(c.avgHr != nil ? n(c.avgHr) : dash)",
                    "effort \(c.effort != nil ? "\(n(c.effort, 1))/10" : dash)",
                ].joined(separator: " · ")
                L.append("")
                L.append("    - Cardio: \(cardioLabel(c.kind)) · \(bits) **(Already accounted for in daily steps and calories — do NOT add to the day.)**")
            }
            L.append("")
        }

        // ── Sets Targets ──
        L.append("## Sets Targets")
        L.append("")
        for m in input.volumeByMuscle {
            let status = m.target <= 0 ? "—" : zoneWord[VolumeZone.of(weeklySets: m.sets, target: m.target, directSets: m.directSets ?? m.sets)]!
            let split = (m.indirectSets ?? 0) > 0 && m.directSets != nil ? " (\(js(m.directSets!)) direct + \(js(m.indirectSets!)) indirect)" : ""
            L.append("- \(m.muscle): \(js(m.sets))/\(js(m.target))\(split) — \(status)")
        }
        L.append("")
        L.append("_A set credits 1.0 to each muscle a movement directly trains and 0.5 to each it assists. Half sets are real and are not rounded away. Targets are DIRECT-set landmarks, so the verdict is asymmetric on purpose: assistance can lift a muscle out of UNDER, but only direct work can put one OVER._")
        L.append("")

        // ── DOMS ──
        do {
            let label = ["none", "mild", "moderate", "severe"]
            L.append("## DOMS (soreness, 0–3)")
            L.append("")
            var byDate: [String: [ExportDoms]] = [:]
            for r in input.doms { byDate[r.date, default: []].append(r) }
            for day in days {
                let rows = byDate[day.date] ?? []
                if rows.isEmpty { L.append("- \(day.weekdayLabel) \(day.date): not logged"); continue }
                let parts = rows.map { r -> String in
                    let sev = "\(r.muscle): \(js(r.severity)) (\(severityWord(r.severity, label)))"
                    guard let source = r.sourceLabel, !source.isEmpty else { return sev }
                    let out = daysBetween(r.sourceDate, r.date)
                    var when = ""
                    if let sd = r.sourceDate, !sd.isEmpty {
                        let wd = weekdayOf(sd, days)
                        when = ", \(wd.isEmpty ? sd : "\(wd) \(sd)")\(out != nil ? " (\(js(out!)) day\(out! == 1 ? "" : "s") out)" : "")"
                    }
                    return "\(sev) — from \(source)\(when)"
                }
                L.append("- \(day.weekdayLabel) \(day.date): \(parts.joined(separator: " · "))")
            }
            L.append("")
        }

        // ── Fatigue ──
        do {
            L.append("## Fatigue (self-reported, not scored)")
            L.append("")
            var byDate: [String: [String: ExportFatigue]] = [:]
            for f in input.fatigue ?? [] { byDate[f.date, default: [:]][f.slot] = f }
            for day in days {
                let rows = byDate[day.date]
                let parts = fatigueLabels(isTrainingDay: day.isTrainingDay).map { slot in "\(slot) \(rows?[slot].map { $0.label.lowercased() } ?? dash)" }
                var cost = ""
                if day.isTrainingDay, let pre = rows?["Before training"]?.level, let post = rows?["After training"]?.level {
                    let d = post - pre
                    cost = " · cost \(d > 0 ? "+" : d < 0 ? "−" : "±")\(js(abs(d)))"
                }
                L.append("- \(day.weekdayLabel) \(day.date): \(parts.joined(separator: " · "))\(cost)")
            }
            L.append("")
            L.append("_Three slots a day, every day. A training day asks Waking / Before training / After training; a rest day asks Waking / Midday / Night._")
            L.append("_`cost` is the after-training level minus the before-training one — how much the session took, in scale steps. `—` means the question was not answered, which is a fact about the week and not a neutral reading._")
            L.append("")
        }

        if let stack = input.supplementProtocol, !stack.isEmpty {
            L.append("## Supplements protocol")
            L.append("")
            for s in consolidateSupplements(stack) { L.append("- \(s)") }
            L.append("")
        }

        if let ledger = input.ledger, !ledger.isEmpty {
            let label = input.weekLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            L.append("## Week-over-Week Trends (\(input.programLabel)\(label.isEmpty ? "" : " · \(label)"))")
            L.append("")
            L.append(contentsOf: trendLedger(ledger))
            L.append("")
            L.append("_Every week of the programme, oldest first. Averages skip days with no entry rather than counting them as zero; volume and cardio are totals, so a short week is genuinely a smaller number. Δ is the change in average bodyweight from the row above, and the arrow shows direction only — whether a move is progress depends on the phase._")
            L.append("")
        }

        L.append("## Weekly aggregates")
        L.append("")

        do {
            let tonnage = input.tonnageByMuscle ?? []
            if let totalVolume = sumOf(sessions.map(\.volumeKg)) {
                L.append("### Total volume")
                L.append("")
                L.append("- **Total volume:** \(exact(totalVolume)) kg across \(plural(sessions.count, "session"))")
                L.append("")
                if !tonnage.isEmpty {
                    L.append("### Volume by muscle group (kg)")
                    L.append("")
                    for t in tonnage {
                        let assisted = (t.directKg != nil && t.directKg! < t.volumeKg) ? " (\(exact(t.directKg)) direct)" : ""
                        L.append("- \(t.muscle): \(exact(t.volumeKg)) kg\(assisted)")
                    }
                    L.append("")
                    L.append("_These rows sum to MORE than the total above: the same kilogram is counted against every muscle that moved it. Unilateral pairs are scored at the weaker side, identically to the session total._")
                    L.append("")
                }
            }
        }

        do {
            let energy = energyBalance(days)
            if let balance = energy.balanceKcal {
                let deficit = balance < 0
                L.append("### Energy balance")
                L.append("")
                L.append("- **Energy balance (estimated):** \(n(abs(balance))) kcal \(deficit ? "DEFICIT" : "SURPLUS") over \(plural(energy.daysCounted, "day")) · \(n(abs(energy.avgBalanceKcal ?? 0))) kcal/day \(deficit ? "under" : "over") maintenance")
                L.append("    - Intake \(n(energy.intakeKcal)) kcal vs expenditure \(n(energy.expenditureKcal)) kcal (\(Energy.tdeeBreakdown(bmr: energy.avgBmrKcal ?? 0, active: energy.avgActiveKcal ?? 0, tef: energy.avgTefKcal ?? 0)) kcal/day, averaged)")
                let counted = Set(energy.countedDates)
                let skipped = days.filter { !counted.contains($0.date) }
                if !skipped.isEmpty {
                    L.append("    - Excluded: \(skipped.map { "\($0.weekdayLabel) \($0.date)" }.joined(separator: ", ")) — no intake, or no Apple Watch active energy, or both. A day missing either side is not a balance.")
                }
                L.append("    - _ESTIMATE, not a measurement. Only days holding both an intake and an expenditure are counted."
                    + " TEF is the thermic effect of food, \(js(jsRound(Energy.tefFactor * 1000) / 10))% of intake —"
                    + " the energy spent digesting it, which is expenditure like any other."
                    + (energy.bmrCarried ? " BMR is a scale reading and exists only on weigh-in days; days without one inherit the nearest reading (it moves ~2 kcal a week)." : "")
                    + "_")
                L.append("")
            }
        }

        do {
            let stepDays = days.filter { $0.steps?.isFinite == true }
            L.append("### Steps & daily shape")
            L.append("")
            L.append("- **Steps (avg/day):** \(n(meanOf(days.map(\.steps)))) across \(plural(stepDays.count, "day")) with a logged count (every such day counts, cardio session or not)")
            var volByDate: [String: Double] = [:]
            for s in sessions { if let v = s.volumeKg, v.isFinite { volByDate[s.date, default: 0] += v } }
            let volSpark = sparkline(days.map { volByDate[$0.date] ?? 0 })
            let stepSpark = sparkline(days.map(\.steps))
            let dayLetters = days.map { $0.weekdayLabel.first.map(String.init) ?? "?" }.joined()
            if !volSpark.isEmpty || !stepSpark.isEmpty {
                L.append("- **Daily shape** (\(dayLetters), scaled from zero · `\(sparkGap)` = not logged):")
                if !volSpark.isEmpty { L.append("    - Volume: `\(volSpark)`") }
                if !stepSpark.isEmpty { L.append("    - Steps:  `\(stepSpark)`") }
            }
            L.append("")
        }

        // ── Derived ──
        do {
            let d = Derived.week(input)
            L.append("## Derived (computed by HELIX — not measured)")
            L.append("")
            L.append("_Everything above this heading is a measurement. Everything below it is arithmetic over those measurements — stated so it can be audited, or ignored. No figure here reaches for data the document has not already shown you, and a metric with no evidence prints `—` rather than a zero._")
            L.append("")

            if d.deltas.contains(where: { $0.delta != nil }) {
                L.append("### Week over week")
                L.append("")
                func fmt(_ v: Double?, _ x: WeekDelta) -> String { x.exact ? exact(v) : n(v, x.digits) }
                for x in d.deltas {
                    guard let delta = x.delta else {
                        L.append("- \(x.label): \(fmt(x.current, x)) this week · \(fmt(x.previous, x)) previous — no comparison")
                        continue
                    }
                    let pct = x.pct != nil ? ", \(x.pct! > 0 ? "+" : "−")\(n(abs(x.pct!), 1))%" : ""
                    let dir = delta > 0 ? "+" : delta < 0 ? "−" : ""
                    L.append("- \(x.label): \(fmt(x.previous, x)) → \(fmt(x.current, x)) \(x.unit) (\(dir)\(fmt(abs(delta), x))\(pct))")
                }
                L.append("")
                L.append("_Against the most recent EARLIER week in the ledger, which is not always the calendar week before if a week was not trained._")
                L.append("")
            }

            L.append("### Training load")
            L.append("")
            L.append("- Mean working-set effort: \(d.meanWorkingSetRpe != nil ? "\(n(d.meanWorkingSetRpe, 2)) RPE across \(plural(d.ratedSets, "rated set"))" : dash)")
            L.append("- Working sets: \(d.workingSets) · mean per session: \(n(d.meanSetsPerSession, 1)) · mean tonnage per session: \(exact(d.meanVolumePerSessionKg)) kg")
            L.append("- Sets taken to failure: \(d.failureSetShare != nil ? "\(n(d.failureSetShare, 1))% of working sets" : dash)")
            L.append("- Technique flags: \(plural(d.flaggedSets, "set")) flagged\(d.quality.isEmpty ? "" : " — \(d.quality.map { "\($0.label) ×\($0.count)" }.joined(separator: ", "))")")
            L.append("")

            if !d.progression.isEmpty {
                L.append("### Top-set movement within the week")
                L.append("")
                for e in d.progression {
                    let arrow = e.deltaKg > 0 ? "+" : e.deltaKg < 0 ? "−" : "±"
                    L.append("- \(e.name): \(exact(e.firstKg)) → \(exact(e.lastKg)) kg (\(arrow)\(exact(abs(e.deltaKg)))) across \(e.sessions) sessions")
                }
                L.append("")
                L.append("_Only movements trained more than ONCE inside this week, compared first-to-last. It is not progression against the last time the movement was performed — that session may fall outside this payload, and this section never reaches for data the document has not shown._")
                L.append("")
            }

            L.append("### Adherence & coverage")
            L.append("")
            if let taken = d.supplementsTaken, let planned = d.supplementsPlanned, planned != 0 {
                L.append("- Supplements: \(n(taken)) of \(n(planned)) doses (\(n((taken / planned) * 100))%)")
            } else {
                L.append("- Supplements: \(dash)")
            }
            L.append("- Fatigue: \(d.fatigueReadings) of \(d.fatigueSlots) slots answered")
            L.append("- Soreness: logged on \(d.domsDaysLogged) of \(days.count) days")
            L.append("- Intake: logged on \(d.intakeDaysLogged) of \(days.count) days")
            L.append("- Weigh-ins: \(d.weighInDays) of \(days.count) days")
            L.append("- Per-set effort: \(d.ratedSets) of \(d.workingSets) working sets rated")
            L.append("")

            L.append("### Sleep composition")
            L.append("")
            L.append("- Deep: \(d.meanDeepPct != nil ? "\(n(d.meanDeepPct, 1))% of time asleep" : dash) · REM: \(d.meanRemPct != nil ? "\(n(d.meanRemPct, 1))%" : dash) · Awake (avg): \(d.meanAwakeMin != nil ? "\(n(d.meanAwakeMin)) min" : dash)")
            L.append("")
            L.append("_Shares, because the minutes are already above: 39 minutes of deep sleep is a different night after 9h than after 5h30._")
            L.append("")

            if d.trainingDayKcal != nil || d.restDayKcal != nil {
                L.append("### Intake by day type")
                L.append("")
                L.append("- Training days: \(d.trainingDayKcal != nil ? "\(n(d.trainingDayKcal)) kcal" : dash) · Rest days: \(d.restDayKcal != nil ? "\(n(d.restDayKcal)) kcal" : dash)")
                L.append("")
            }
        }

        let flagged = flaggedNutrients(days)
        if !flagged.isEmpty {
            L.append("---")
            L.append("")
            L.append("⚠ **Implausible micronutrient readings this week:** \(flagged.joined(separator: " · ")).")
            L.append("")
            L.append("_These are printed exactly as stored. `nutrition_entries` keeps one aggregate row per day with no item breakdown, so neither this document nor the app can identify what contributed them — the duplicate is upstream, in the Health source. Treat a flagged figure as unmeasured rather than as a day that went badly._")
            L.append("")
        }

        L.append("---")
        L.append("")
        L.append(unilateralVolumeNote)
        L.append("")
        L.append(epleyNote)
        L.append("")
        L.append(appleWatchDisclaimer)
        L.append("")
        L.append(priorReportNote(input.weekLabel))
        return L.joined(separator: "\n")
    }

    /// `label[severity] ?? severity` — the word for an integral 0–3, else the number.
    static func severityWord(_ severity: Double, _ labels: [String]) -> String {
        if severity == severity.rounded(), severity >= 0, Int(severity) < labels.count { return labels[Int(severity)] }
        return js(severity)
    }

    public static func priorReportNote(_ weekLabel: String?) -> String {
        let label = weekLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let week = label.isEmpty ? "The previous week's" : label
        return "*Note: \(week) report is provided manually for reference and comparison.*"
    }

    public static let unilateralVolumeNote =
        "*Note: Unilateral (single-arm / single-leg) work is logged per side and scored ONCE at the WEAKER side: min(weight) × min(reps)."
        + " \"L 5 kg × 10 · R 5 kg × 14\" is 50 kg of volume, not 70 and not 100 — crediting the strong side's extra reps to the weak one would inflate the"
        + " trend without the work being there, and doubling it would make the same physical set weigh twice as much purely for having been recorded per side."
        + " Each side keeps its own failure tag, and the pair counts as ONE set.*"

    public static let epleyNote =
        "*Note: every \"1RM\" here is an ESTIMATE from the Epley formula (weight × (1 + reps/30)), not a lift that was performed. Hevy estimates it "
        + "differently, so the two will not agree exactly. Unloaded work has no 1RM estimate at all and shows none.*"

    public static let appleWatchDisclaimer =
        "*Note: Heart rate, calories, and steps data are sourced from the Apple Watch and may not be entirely accurate.*"

    /// The stack as one chronological list, deduped by name.
    public static func consolidateSupplements(_ items: [ExportSupplement]) -> [String] {
        var order: [String] = []
        var byName: [String: (time: String, line: String)] = [:]
        for s in items {
            let name = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty { continue }
            let key = name.lowercased()
            if byName[key] != nil { continue }
            let trimmedTime = s.time?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let time = trimmedTime.isEmpty ? "—" : trimmedTime
            let dose: String
            if let t = s.trainingDose, let r = s.restDose, !t.isEmpty, !r.isEmpty, t != r {
                dose = "\(t) on training days / \(r) on rest days"
            } else {
                dose = s.dose.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            var parts = ["\(time) · \(name) — \(dose)"]
            if s.trainingOnly == true { parts.append("(training days only)") }
            if let notes = s.notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty { parts.append("· \(notes)") }
            order.append(key)
            byName[key] = (time, parts.joined(separator: " "))
        }
        return order.map { byName[$0]! }.sorted { icuCompare($0.time, $1.time) < 0 }.map(\.line)
    }
}
