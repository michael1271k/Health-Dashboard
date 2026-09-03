import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// What a set WAS (its tag) and how it WENT (its quality) — two axes, one
// vocabulary each. A port of `src/lib/training/setTags.ts` minus colours.
//
// "Not a working set" used to be `setType !== 'warmup'` in twenty places;
// adding GHOST — a set that happened and does not count — by hand meant
// finding all twenty. So the question has a name, `isWorkingSet`, and a future
// tag is one line here.
//
// Quality is a second nullable column and changes NO arithmetic: a momentum
// set still counts its tonnage and can still set a record, because it
// happened. Null means "not reported", never "clean".
// ─────────────────────────────────────────────────────────────────────────────

public struct SetTag: Codable, Equatable, Sendable {
    /// The single character shown in the badge.
    public var label: String
    /// The whole word, for the tooltip and the export.
    public var full: String
}

public struct SetQuality: Codable, Equatable, Sendable {
    /// Shown on the row, under the numbers. Two words at most.
    public var label: String
    /// The whole sentence.
    public var full: String
}

public struct SetCompositionEntry: Codable, Equatable, Sendable {
    public var label: String
    public var full: String
    public var count: Int
}

public enum SetTags {
    public static let tags: [String: SetTag] = [
        "warmup": SetTag(label: "W", full: "Warm-up"),
        "failure": SetTag(label: "F", full: "Taken to failure"),
        "dropset": SetTag(label: "D", full: "Drop set"),
        "ghost": SetTag(label: "G", full: "Ghost set — logged, not counted"),
    ]

    /// The composition order — stable across sessions.
    private static let tagOrder = ["warmup", "failure", "dropset", "ghost"]

    /// Sets that are RECORDED but do not count as work: warm-ups and ghosts.
    public static func isWorkingSet(_ setType: String?) -> Bool {
        setType != "warmup" && setType != "ghost"
    }

    /// The tag for a stored `set_type`, or nil for a plain working set.
    public static func tag(for setType: String?) -> SetTag? {
        guard let setType, !setType.isEmpty else { return nil }
        return tags[setType]
    }

    /// A session's set composition as counted chips — `2W · 1F · 1D`. Only the
    /// kinds that occurred, in the fixed order.
    public static func composition(_ counts: [String: Int]) -> [SetCompositionEntry] {
        tagOrder.compactMap { key in
            let count = counts[key] ?? 0
            guard count > 0, let t = tags[key] else { return nil }
            return SetCompositionEntry(label: t.label, full: t.full, count: count)
        }
    }

    public static let quality: [String: SetQuality] = [
        "momentum": SetQuality(label: "Momentum", full: "Used body English to move the load"),
        "partial_rom": SetQuality(label: "Short ROM", full: "Cut the range short to finish the set"),
        "form_breakdown": SetQuality(label: "Form broke", full: "The last reps lost position"),
        "needed_warmup": SetQuality(label: "Cold", full: "The first reps were poor — needed a longer warm-up"),
        "assisted": SetQuality(label: "Assisted", full: "A spotter or the other arm helped"),
        "cut_short": SetQuality(label: "Cut short", full: "Stopped before the target for a reason other than failure"),
    ]

    /// Render order — matches the DB CHECK.
    public static let qualityKeys = ["momentum", "partial_rom", "form_breakdown", "needed_warmup", "assisted", "cut_short"]

    /// The quality for a stored value, or nil for a clean (null) set.
    public static func quality(for value: String?) -> SetQuality? {
        guard let value, !value.isEmpty else { return nil }
        return quality[value]
    }

    /// Guards a value arriving from the DB or a draft before it is written back.
    public static func isSetQuality(_ v: String?) -> Bool {
        guard let v else { return false }
        return qualityKeys.contains(v)
    }
}
