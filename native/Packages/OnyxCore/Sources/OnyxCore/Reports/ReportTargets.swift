import Foundation

/// What the last report told you to do next week.
///
/// ── THIS HALF OF THE READER PORTS, THE OTHER HALF DOES NOT ──────────────────
/// A Sentinel-7 report is rendered as HTML inside a `WKWebView` — decision 7 of
/// the migration plan — because 950 lines of markdown drawing has no business
/// being re-implemented in Swift. But `parseTargets` is not drawing. It reads a
/// PRESCRIPTION out of the document: the load ladder, the hydration line, the
/// step target, the macro triple. Those feed the LOGGER, which puts last week's
/// instruction on the card you are about to lift against, and the logger is
/// native. So this part crosses and the renderer does not.
///
/// ── EVERY FIELD IS OPTIONAL, INDEPENDENTLY ──────────────────────────────────
/// Same discipline as the rest of the reader: a report with a hydration line and
/// no load ladder yields a hydration target and nothing else — never an error,
/// and never a zero. A consumer that receives `nil` renders nothing for that
/// field, because a prescription nobody wrote is not a prescription of zero.
public struct TargetExercise: Codable, Equatable, Sendable {
    /// As written in the report, then run through the catalogue's alias table.
    public var name: String
    public var loadKg: Double?
    public var repsLow: Int?
    public var repsHigh: Int?

    public init(name: String, loadKg: Double?, repsLow: Int?, repsHigh: Int?) {
        self.name = name
        self.loadKg = loadKg
        self.repsLow = repsLow
        self.repsHigh = repsHigh
    }
}

public struct WaterTarget: Codable, Equatable, Sendable {
    public var minL: Double
    public var maxL: Double
    public init(minL: Double, maxL: Double) { self.minL = minL; self.maxL = maxL }
}

public struct MacroTarget: Codable, Equatable, Sendable {
    public var kcal: Double?
    public var proteinG: Double?
    public var carbsG: Double?
    public var fatG: Double?
    public init(kcal: Double?, proteinG: Double?, carbsG: Double?, fatG: Double?) {
        self.kcal = kcal
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
    }
}

public struct ReportTargets: Codable, Equatable, Sendable {
    public var exercises: [TargetExercise]
    public var water: WaterTarget?
    public var steps: Int?
    public var macros: MacroTarget?
    /// Instruction sentences from the same sections, for the dashboard. At most
    /// four — a report writes plenty of prose and only the first few sentences
    /// of a directive section are the directive.
    public var notes: [String]

    public init(
        exercises: [TargetExercise] = [], water: WaterTarget? = nil, steps: Int? = nil,
        macros: MacroTarget? = nil, notes: [String] = []
    ) {
        self.exercises = exercises
        self.water = water
        self.steps = steps
        self.macros = macros
        self.notes = notes
    }

    /// Is there anything here worth showing? An all-empty result is none.
    public var isEmpty: Bool {
        exercises.isEmpty && water == nil && steps == nil && macros == nil && notes.isEmpty
    }
}

/// A pipe table the reader found.
public struct ParsedTable: Codable, Equatable, Sendable {
    public var columns: [String]
    public var rows: [[String]]
    public init(columns: [String], rows: [[String]]) {
        self.columns = columns
        self.rows = rows
    }
}

// MARK: - Reading

public enum ReportReader {

    /// Does this text look like an FMT v2 audit?
    ///
    /// A regex on the BODY, not a column and not the report's `type`. A `weekly`
    /// row whose text says "FMT v2" is a v2 report and is read as one.
    public static func isFmtV2(_ md: String?) -> Bool {
        guard let md, !md.isEmpty else { return false }
        return md.range(of: #"\bFMT\s*v?2\b"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// `a | b | c` → `["a","b","c"]`, or nil when the line is not a pipe row.
    ///
    /// Two pipes minimum and three cells minimum: one pipe is also the shape of
    /// an ordinary sentence that happens to contain one.
    static func pipeCells(_ line: String) -> [String]? {
        guard line.filter({ $0 == "|" }).count >= 2 else { return nil }
        var body = line
        if let leading = body.range(of: #"^\s*\|"#, options: .regularExpression) {
            body.removeSubrange(leading)
        }
        if let trailing = body.range(of: #"\|\s*$"#, options: .regularExpression) {
            body.removeSubrange(trailing)
        }
        let cells = body.split(separator: "|", omittingEmptySubsequences: false)
            .map { $0.trimmingCharacters(in: .whitespaces) }
        return cells.count >= 3 ? cells : nil
    }

    /// The first pipe table in a run of lines. Separator rows are dropped.
    ///
    /// A blank line ends the table; prose BETWEEN rows does not — reports
    /// annotate their own tables and the annotation is not the end of the data.
    public static func parseTable(_ lines: [String]) -> ParsedTable? {
        var columns: [String]?
        var rows: [[String]] = []
        for line in lines {
            guard let cells = pipeCells(line) else {
                if columns != nil, line.trimmingCharacters(in: .whitespaces).isEmpty { break }
                continue
            }
            // A real GFM separator row, when the author happened to write one.
            if cells.allSatisfy({ $0.range(of: #"^:?-{2,}:?$"#, options: .regularExpression) != nil }) {
                continue
            }
            if columns == nil { columns = cells; continue }
            rows.append(cells)
        }
        guard let columns, !rows.isEmpty else { return nil }
        return ParsedTable(columns: columns, rows: rows)
    }

    /// A number, or nil.
    ///
    /// The explicit digit test is load-bearing: in the TypeScript, `Number('')`
    /// is 0 rather than NaN, so a stripped-out prose cell ("felt heavy" → "")
    /// arrived as a perfectly plausible zero and got plotted. Swift's
    /// `Double("")` is nil, but the digit test is kept so the two implementations
    /// reject the same inputs for the same reason.
    static func numOf(_ raw: String) -> Double? {
        let cleaned = raw.replacingOccurrences(of: #"[,\s]"#, with: "", options: .regularExpression)
        guard cleaned.range(of: #"\d"#, options: .regularExpression) != nil else { return nil }
        guard let n = Double(cleaned), n.isFinite else { return nil }
        return n
    }

    /// `8-10`, `8–10`, `× 12`, `x8` — a rep window or a single number.
    static func repsIn(_ text: String) -> (low: Int?, high: Int?) {
        let windowPatterns = [
            #"(?:[×x]\s*|\breps?\s*[:=]?\s*)(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})"#,
            #"(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})\s*reps?\b"#,
        ]
        for pattern in windowPatterns {
            if let groups = capture(pattern, in: text), groups.count >= 3,
               let low = groups[1].flatMap(numOf), let high = groups[2].flatMap(numOf) {
                return (Int(low), Int(high))
            }
        }
        if let groups = capture(#"(?:[×x]\s*(\d{1,3})\b)|(?:\b(\d{1,3})\s*reps?\b)"#, in: text) {
            let raw = groups.count > 1 ? (groups[1] ?? (groups.count > 2 ? groups[2] : nil)) : nil
            if let value = raw.flatMap(numOf) {
                let n = Int(value)
                return (n, n)
            }
        }
        return (nil, nil)
    }

    /// Leading bullet glyphs the reports use, stripped before display.
    private static let bullet = #"^\s*(?:[-*•▸▪◆◇→⚑>]|\d+[.)])\s+"#
    /// Box-drawing, rules, and other pure decoration — never an instruction.
    private static let decoration = #"^[\s─━═╔╚║╠▓▒░#|+=_.·—–-]*$"#

    /// One line of a directive section, or nil when the line is not prose.
    public static func cleanInstruction(_ raw: String, maxLen: Int = 140) -> String? {
        var line = raw.trimmingCharacters(in: .whitespaces)
        if line.isEmpty { return nil }
        if line.range(of: decoration, options: .regularExpression) != nil { return nil }
        if line.contains("|") { return nil }                       // a table row is data
        line = line.replacingOccurrences(of: bullet, with: "", options: .regularExpression)
        if line.range(of: #"^#{1,6}\s"#, options: .regularExpression) != nil { return nil }
        line = line.replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "`", with: "")
            .trimmingCharacters(in: .whitespaces)
        if line.count < 12 { return nil }
        // A SHOUTED line is a heading the section split missed — a real
        // instruction is written as a sentence.
        if line == line.uppercased(),
           line.range(of: #"[A-Z]{4}"#, options: .regularExpression) != nil {
            return nil
        }
        guard line.count > maxLen else { return line }
        let cut = String(line.prefix(maxLen - 1)).trimmingCharacters(in: .whitespaces)
        return cut + "…"
    }

    /// What the report asked for, in the shapes the app can act on.
    ///
    /// The exercise ladder is read from a pipe table when there is one and from
    /// inline `Name → 49.5 kg × 8-10` lines when there is not, because reports
    /// have been written both ways and neither shape is the contract.
    public static func parseTargets(_ lines: [String]) -> ReportTargets {
        var exercises: [TargetExercise] = []
        var seen = Set<String>()

        func push(_ name: String, _ loadKg: Double?, _ reps: (low: Int?, high: Int?)) {
            var clean = name
                .replacingOccurrences(of: #"^[\s·—–>-]+"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"[\s·—–:>-]+$"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: "**", with: "")
            clean = clean.trimmingCharacters(in: .whitespaces)
            guard clean.count >= 3,
                  clean.range(of: #"[a-z]"#, options: [.regularExpression, .caseInsensitive]) != nil
            else { return }
            let key = clean.lowercased()
            guard !seen.contains(key) else { return }
            seen.insert(key)
            exercises.append(TargetExercise(
                name: clean, loadKg: loadKg, repsLow: reps.low, repsHigh: reps.high
            ))
        }

        if let table = parseTable(lines) {
            let loadIndex = table.columns.firstIndex {
                $0.range(of: #"\b(kg|load|weight|target)\b"#, options: [.regularExpression, .caseInsensitive]) != nil
            }
            let repsIndex = table.columns.firstIndex {
                $0.range(of: #"\breps?\b|\brange\b|\bwindow\b"#, options: [.regularExpression, .caseInsensitive]) != nil
            }
            // `> 0`, not `>= 0`: the first column is the NAME, so a table whose
            // load column is column zero is not a load ladder.
            if let loadIndex, loadIndex > 0 {
                for cells in table.rows {
                    let loadCell = loadIndex < cells.count ? cells[loadIndex] : ""
                    let load = numOf(loadCell.replacingOccurrences(
                        of: #"[^\d.,]"#, with: "", options: .regularExpression
                    ))
                    let repsCell = repsIndex.map { $0 < cells.count ? cells[$0] : "" } ?? ""
                    push(cells.first ?? "", load, repsIn(repsCell))
                }
            }
        }

        // Lines already read as a NUMBER are not also read as prose. Without
        // this the notes fill up with the load ladder restated in words, and the
        // one sentence the report actually wrote to you falls off the end.
        var consumed = Set<Int>()

        for (index, raw) in lines.enumerated() {
            if raw.contains("|") { continue }
            let line = raw
                .replacingOccurrences(of: bullet, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            // A load line needs a NAME and a kg figure, separated. Requiring the
            // separator is what stops "Volume dropped to 24 kg per set on
            // Tuesday" being read as a prescription for an exercise called
            // "Volume dropped to".
            guard let groups = capture(
                #"^(.{2,64}?)\s*(?:[→⇒:·•]|[—–-]{1,2}|\bat\b|\bto\b|\bhold\b)\s*(\d[\d.,]*)\s*kg\b(.*)$"#,
                in: line
            ), groups.count >= 4, let name = groups[1], let loadRaw = groups[2] else { continue }
            guard let load = numOf(loadRaw), load > 0 else { continue }
            push(name, load, repsIn(groups[3] ?? ""))
            consumed.insert(index)
        }

        var water: WaterTarget?
        var steps: Int?
        var macros: MacroTarget?
        var notes: [String] = []

        for (index, raw) in lines.enumerated() {
            let line = raw
                .replacingOccurrences(of: bullet, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)

            if water == nil,
               line.range(of: #"water|hydrat|h₂o|h2o|fluid"#, options: [.regularExpression, .caseInsensitive]) != nil {
                let range = capture(#"(\d[\d.]*)\s*(?:[-–—]|to)\s*(\d[\d.]*)\s*(?:L\b|litre|liter)"#, in: line)
                let single = capture(#"(\d[\d.]*)\s*(?:L\b|litre|liter)"#, in: line)
                let low = range?[1].flatMap(numOf) ?? single?[1].flatMap(numOf)
                let high = range?[2].flatMap(numOf) ?? low
                // A "3.2 L" that is really 3,200 ml written oddly, or a stray
                // year, is not a hydration target. Bounds, not trust.
                if let low, let high, low >= 0.5, high <= 12 {
                    water = WaterTarget(minL: low, maxL: high)
                    consumed.insert(index)
                }
            }

            if steps == nil,
               line.range(of: #"\bsteps?\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
                let thousands = capture(#"(\d[\d.]*)\s*k\b"#, in: line)?[1].flatMap(numOf)
                let plain = capture(#"(\d[\d,]{2,})"#, in: line)?[1].flatMap(numOf)
                let value = thousands.map { $0 * 1000 } ?? plain
                if let value, value >= 1000, value <= 60000 {
                    steps = Int(jsRound(value))
                    consumed.insert(index)
                }
            }

            if macros == nil,
               line.range(of: #"kcal|calorie"#, options: [.regularExpression, .caseInsensitive]) != nil {
                let kcal = capture(#"(\d[\d,]{2,})\s*(?:kcal|cal)"#, in: line)?[1].flatMap(numOf)
                func grams(_ letter: String) -> Double? {
                    capture(#"(\d{1,3})\s*(?:g\s*)?\#(letter)\b"#, in: line)?[1].flatMap(numOf)
                        ?? capture(#"\#(letter)[a-z]*\s*[:=]?\s*(\d{1,3})\s*g?\b"#, in: line)?[1].flatMap(numOf)
                }
                if let kcal {
                    macros = MacroTarget(
                        kcal: kcal, proteinG: grams("P"), carbsG: grams("C"), fatG: grams("F")
                    )
                    consumed.insert(index)
                }
            }

            if notes.count < 4, !consumed.contains(index), let note = cleanInstruction(raw) {
                notes.append(note)
            }
        }

        return ReportTargets(
            exercises: exercises, water: water, steps: steps, macros: macros, notes: notes
        )
    }

    /// Fold several sections' targets into one.
    ///
    /// First non-nil wins per field, so a later section repeating LAST week's
    /// hydration line cannot overwrite this week's; exercises accumulate,
    /// deduplicated by name.
    public static func merge(_ all: [ReportTargets]) -> ReportTargets {
        var out = ReportTargets()
        var seen = Set<String>()
        for targets in all {
            for exercise in targets.exercises {
                let key = exercise.name.lowercased()
                guard !seen.contains(key) else { continue }
                seen.insert(key)
                out.exercises.append(exercise)
            }
            if out.water == nil { out.water = targets.water }
            if out.steps == nil { out.steps = targets.steps }
            if out.macros == nil { out.macros = targets.macros }
            for note in targets.notes where out.notes.count < 4 && !out.notes.contains(note) {
                out.notes.append(note)
            }
        }
        return out
    }

    // MARK: - Matching a report's name to a catalogue exercise

    /// ── THE ALIAS TABLE IS THE ONLY RESOLVER ────────────────────────────────
    /// A report writes movement names the way a person says them ("seated row",
    /// "SA lateral raise") and the catalogue has one canonical row per
    /// movement. That mapping already exists in `ExerciseAliases` and this must
    /// never grow a second one: catalogue merges are a loud bug and catalogue
    /// SPLITS are a silent one — Seated Cable Row is two rows by grip on
    /// purpose — so a fuzzy matcher that decided two names were "close enough"
    /// would quietly re-merge them in the one place nobody looks: a chip on a
    /// card.
    ///
    /// Matching is exact after canonicalisation and case folding, with one
    /// deliberate relaxation: punctuation and repeated whitespace are ignored,
    /// because "Incline DB Press" and "Incline DB Press." are the same
    /// instruction.
    static func fold(_ name: String) -> String {
        ExerciseAliases.canonicalName(name)
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    /// The report's instruction for one exercise, or nil if it named another.
    public static func target(
        for exerciseName: String?, in targets: ReportTargets?
    ) -> TargetExercise? {
        guard let targets, let exerciseName else { return nil }
        let want = fold(exerciseName)
        guard !want.isEmpty else { return nil }
        return targets.exercises.first { fold($0.name) == want }
    }

    /// `49.5 kg × 8–10`, `49.5 kg`, `× 8–10` — whatever the report gave.
    public static func format(_ target: TargetExercise) -> String? {
        let load = target.loadKg.map { "\(trimZero($0)) kg" }
        var reps: String?
        if let low = target.repsLow {
            if let high = target.repsHigh, high != low {
                reps = "\(low)–\(high)"
            } else {
                reps = "\(low)"
            }
        }
        if let load, let reps { return "\(load) × \(reps)" }
        if let load { return load }
        return reps.map { "× \($0)" }
    }

    private static func trimZero(_ n: Double) -> String {
        if n == n.rounded(), abs(n) < 1e15 { return String(Int(n)) }
        return String(jsRound(n * 100) / 100)
    }

    // MARK: - Regex

    /// Capture groups of the first match, `nil` per group that did not
    /// participate.
    ///
    /// `NSRegularExpression` rather than a `Regex` literal: every other ported
    /// module in this package uses it, the patterns are carried across from
    /// JavaScript verbatim so they read the same in both files, and a literal
    /// cannot be built from an interpolated letter the way `grams(_:)` needs.
    static func capture(_ pattern: String, in text: String) -> [String?]? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(
                  in: text, range: NSRange(text.startIndex..., in: text)
              )
        else { return nil }

        return (0..<match.numberOfRanges).map { index in
            let range = match.range(at: index)
            guard range.location != NSNotFound, let swiftRange = Range(range, in: text) else {
                return nil
            }
            return String(text[swiftRange])
        }
    }
}
