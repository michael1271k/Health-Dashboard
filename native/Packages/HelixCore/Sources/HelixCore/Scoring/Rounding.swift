import Foundation

/// JavaScript's `Math.round`, which is **not** Swift's `rounded()`.
///
/// ── THE DIFFERENCE, AND WHY IT IS NOT ACADEMIC ──────────────────────────────
/// `Math.round` rounds a half **towards positive infinity**: `Math.round(2.5)`
/// is 3 and `Math.round(-2.5)` is -2. Swift's default `rounded()` rule is
/// `.toNearestOrAwayFromZero`, so `(-2.5).rounded()` is -3. Every function in
/// this package that mirrors a `Math.round` call must therefore use this, not
/// `rounded()`, or the port silently disagrees with its source on exactly the
/// inputs a test grid is least likely to contain.
///
/// The rest of the arithmetic needs no such treatment: JavaScript numbers and
/// Swift `Double` are both IEEE-754 binary64, so `+`, `-`, `*`, `/` and `cos`
/// agree bit for bit. Rounding is the one place the two languages made
/// different choices, so it is the one place that needs a shim.
@inlinable
public func jsRound(_ x: Double) -> Double {
    // `floor(x + 0.5)` is the specification of Math.round, verbatim.
    (x + 0.5).rounded(.down)
}

/// `Math.round(x * 10) / 10` — one decimal place, JavaScript's rounding rule.
@inlinable
public func jsRound1(_ x: Double) -> Double {
    jsRound(x * 10) / 10
}

/// How JavaScript prints an integral number inside a template string: `70`,
/// never `70.0`. For a value that is not integral this falls back to Swift's
/// shortest round-trip description, which matches JavaScript's for every value
/// the scorer can produce (both are shortest-round-trip algorithms).
public func jsIntegerString(_ x: Double) -> String {
    if x == x.rounded(.towardZero), abs(x) < 1e15 {
        return String(Int64(x))
    }
    return String(x)
}

/// `Number.prototype.toFixed(1)`, which is **not** `String(format: "%.1f")`.
///
/// ── THE DIFFERENCE ───────────────────────────────────────────────────────────
/// Both work from the exact binary value of the double, so `4.05` — really
/// 4.04999999999999982… — prints `4.0` in both. They part on an exact tie:
/// `5.25` is exactly representable, and `toFixed` picks the LARGER candidate
/// (`5.3`) while printf rounds half to even (`5.2`). A sleep alert reading
/// "5.2h" on a night the web app called "5.3h" is the kind of drift the golden
/// vectors exist to catch, so the tie is decided here the ECMAScript way.
///
/// The exact expansion is read off `%.30f`. Thirty places is more than enough:
/// a double near any sleep duration cannot sit within 1e-20 of a tenth-tie
/// without being exactly on it, so the digits after the first decimal are either
/// `5000…` (a tie, round up) or unambiguous.
public func jsToFixed1(_ x: Double) -> String {
    let negative = x < 0
    let expanded = String(format: "%.30f", abs(x))
    let parts = expanded.split(separator: ".", maxSplits: 1)
    var integer = String(parts[0])
    let fraction = Array(parts[1])
    var tenth = Int(String(fraction[0]))!
    // "5" followed by anything is a tie or above it; ECMAScript takes the
    // larger n on a tie. Anything below "5" rounds down.
    if fraction[1] >= "5" {
        tenth += 1
        if tenth == 10 {
            tenth = 0
            integer = String(Int(integer)! + 1)
        }
    }
    return (negative ? "-" : "") + integer + "." + String(tenth)
}
