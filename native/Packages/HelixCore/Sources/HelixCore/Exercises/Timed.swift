import Foundation

/// Time-based movements record a HOLD in seconds, not reps. Matched by name —
/// a port of `src/lib/exercises/timed.ts`, regex for regex.
public enum TimedExercise {
    private static let pattern = try! NSRegularExpression(
        pattern: #"\b(plank|hollow\s*hold|hold|dead\s*hang|wall\s*sit|l-?sit|carry)\b"#,
        options: .caseInsensitive
    )

    public static func isTimed(_ name: String?) -> Bool {
        guard let name, !name.isEmpty else { return false }
        return pattern.firstMatch(in: name, range: NSRange(location: 0, length: (name as NSString).length)) != nil
    }
}
