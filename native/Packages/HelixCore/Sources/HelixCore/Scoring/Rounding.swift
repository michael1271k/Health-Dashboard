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
