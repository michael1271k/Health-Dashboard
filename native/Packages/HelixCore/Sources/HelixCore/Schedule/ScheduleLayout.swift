import Foundation

/// The permanent weekday layout of a plan — a port of `src/lib/schedule/layout.ts`.
/// A layout is `dayKey → weekday` (0 = Sunday … 6 = Saturday); an absent key
/// means "wherever the program put it". Insertion order is kept because the TS
/// object is iterated in insertion order and `moveDay` finds the occupant that way.
public struct DayLayout: Sendable, Equatable {
    public private(set) var keys: [String] = []
    public private(set) var values: [String: Int] = [:]

    public init() {}
    public init(_ pairs: [(String, Int)]) { for (k, v) in pairs { self[k] = v } }

    public subscript(key: String) -> Int? {
        get { values[key] }
        set {
            if let v = newValue {
                if values[key] == nil { keys.append(key) }
                values[key] = v
            } else if values.removeValue(forKey: key) != nil {
                keys.removeAll { $0 == key }
            }
        }
    }

    public var pairs: [(String, Int)] { keys.map { ($0, values[$0]!) } }
    public var isEmpty: Bool { keys.isEmpty }
}

public enum ScheduleLayout {
    static func isValidWeekday(_ n: Int?) -> Bool {
        guard let n = n else { return false }
        return n >= 0 && n <= 6
    }

    /// Read a stored payload into a layout, dropping anything malformed. TOTAL by
    /// design. A duplicate weekday is dropped (first key wins). `raw` is the
    /// decoded JSON: a dictionary in its ORIGINAL key order as `pairs`, or
    /// anything else (array, string, null) which yields an empty layout.
    public static func parse(_ raw: [(String, Any?)]?) -> DayLayout {
        guard let entries = raw else { return DayLayout() }
        var out = DayLayout()
        var taken = Set<Int>()
        for (key, value) in entries {
            guard !key.isEmpty, let weekday = integerWeekday(value), !taken.contains(weekday) else { continue }
            out[key] = weekday
            taken.insert(weekday)
        }
        return out
    }

    /// `typeof n === 'number' && Number.isInteger(n) && 0 <= n <= 6`.
    static func integerWeekday(_ value: Any?) -> Int? {
        if let i = value as? Int { return isValidWeekday(i) ? i : nil }
        if let d = value as? Double, d.isFinite, d == d.rounded(.towardZero) {
            let i = Int(d); return isValidWeekday(i) ? i : nil
        }
        return nil
    }

    /// Where a day actually sits: the layout's answer, else the authored weekday.
    public static func effectiveWeekday(_ day: ProgramDay, _ layout: DayLayout) -> Int {
        if let mapped = layout[day.key], isValidWeekday(mapped) { return mapped }
        return day.weekday
    }

    /// Which day owns a weekday under this layout, or nil when that day rests.
    public static func dayKey(for weekday: Int, program: Program, layout: DayLayout) -> String? {
        program.days.first { effectiveWeekday($0, layout) == weekday }?.key
    }

    /// The COMPLETE layout — every day named explicitly, in program order.
    public static func full(_ program: Program, _ layout: DayLayout) -> DayLayout {
        var out = DayLayout()
        for d in program.days { out[d.key] = effectiveWeekday(d, layout) }
        return out
    }

    /// Move `dayKey` to `weekday`, as an EXCHANGE. Always returns the full layout.
    public static func moveDay(_ program: Program, _ layout: DayLayout, dayKey: String, weekday: Int) -> DayLayout {
        var next = full(program, layout)
        guard isValidWeekday(weekday), let from = next[dayKey] else { return next }
        if from == weekday { return next }
        let occupant = next.keys.first { $0 != dayKey && next[$0] == weekday }
        next[dayKey] = weekday
        if let o = occupant { next[o] = from }
        return next
    }

    /// True when the layout says nothing the authored plan does not already say.
    public static func isAuthored(_ program: Program, _ layout: DayLayout) -> Bool {
        program.days.allSatisfy { effectiveWeekday($0, layout) == $0.weekday }
    }

    /// Key-order-independent serialisation: `JSON.stringify(sortedKeys.map(k => [k, v]))`.
    /// JS sorts keys by UTF-16 code unit; the keys here are ASCII so `<` agrees.
    public static func canonical(_ layout: DayLayout) -> String {
        let parts = layout.keys.sorted().map { "[\(jsonString($0)),\(layout[$0]!)]" }
        return "[" + parts.joined(separator: ",") + "]"
    }

    static func jsonString(_ s: String) -> String {
        var out = "\""
        for ch in s.unicodeScalars {
            switch ch {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if ch.value < 0x20 { out += String(format: "\\u%04x", ch.value) } else { out.unicodeScalars.append(ch) }
            }
        }
        return out + "\""
    }
}
