import Foundation

/// Readiness Coach — a port of `computeReadiness` in
/// `src/lib/scoring/readiness.ts`.
///
/// Sleep 40%, battery 40%, recovery 20%. `>= 70` train hard, `>= 45` train
/// light, below that rest.
///
/// A null sleep or recovery score falls back to the battery rather than to
/// zero, so a day with no sensor data reads as "we don't know, here is what the
/// battery says" instead of cratering into a false "Rest Today".
public enum Readiness {
    public static func compute(
        sleepScore: Double?,
        recoveryScore: Double?,
        batteryPct: Double
    ) -> ReadinessResult {
        let sleep = sleepScore ?? batteryPct
        let recovery = recoveryScore ?? batteryPct
        let readinessScore = sleep * 0.40 + batteryPct * 0.40 + recovery * 0.20

        if readinessScore >= 70 {
            return ReadinessResult(
                level: .trainHard,
                label: "Train Hard",
                color: "#3E9E7A",
                reason: "Sleep, battery, and recovery are all strong today."
            )
        }
        if readinessScore >= 45 {
            return ReadinessResult(
                level: .trainLight,
                label: "Train Light",
                color: "#D4AF37",
                reason: "Moderate readiness — a lighter session will serve you well."
            )
        }
        return ReadinessResult(
            level: .rest,
            label: "Rest Today",
            color: "#C4514E",
            reason: "Recovery indicators are low — prioritize rest and nutrition."
        )
    }
}
