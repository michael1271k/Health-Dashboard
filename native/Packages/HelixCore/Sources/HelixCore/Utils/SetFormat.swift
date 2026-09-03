import Foundation

/// How one logged set reads, everywhere — a port of `src/lib/utils/setFormat.ts`.
///
/// An unloaded set's record IS its rep count or its duration, so that is what
/// gets rendered: `60kg × 12` · `17 reps` · `58 sec`. Never "0kg × 17".
public enum SetFormat {
    /// True when the set carries no external load.
    public static func isUnloaded(_ weightKg: Double?) -> Bool {
        guard let w = weightKg, w.isFinite else { return true }
        return w <= 0
    }

    /// One set as text. `timed` means `reps` carries SECONDS; `bare` drops the
    /// unit words for a column that already names them.
    /// `toDisplay` is the unit conversion the caller injects (kg → lb); a nil result prints as JS does, "null".
    public static func format(weightKg: Double?, reps: Double?, timed: Bool = false, unit: String = "kg", bare: Bool = false, toDisplay: ((Double) -> Double?)? = nil) -> String {
        let n = reps ?? 0
        let ns = jsIntegerString(n)
        if timed { return bare ? "\(ns)s" : "\(ns) sec" }
        if isUnloaded(weightKg) { return bare ? ns : "\(ns) rep\(n == 1 ? "" : "s")" }
        let w: Double? = toDisplay.map { $0(weightKg!) } ?? weightKg
        return "\(w.map(jsIntegerString) ?? "null")\(unit) × \(ns)"
    }
}
