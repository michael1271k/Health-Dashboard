import Foundation

/// Bringing a bout in from Apple Health without logging it twice.
///
/// PURE, and here rather than beside the HealthKit reader, because the rule
/// that decides "this is the walk you already have" writes over a row the user
/// may have typed by hand. That is the one piece of this feature that can
/// destroy something, so it is the piece that gets a golden test and no
/// framework import.
public enum CardioImport {

    /// The kinds the app both imports and offers by hand.
    ///
    /// Strings rather than an enum because `cardio_logs.kind` is a text column
    /// shared with the web app, which writes its own vocabulary into it. A
    /// closed enum here would turn a row written by the other client into a
    /// decode failure — a bout that exists and cannot be read — where a string
    /// is merely a kind this build has no glyph for.
    public static let walk = "walk"
    public static let run = "run"
    public static let cycling = "cycling"
    public static let rowing = "rowing"
    public static let elliptical = "elliptical"
    public static let hiit = "hiit"

    /// Display order. Walk and run lead because they are the two the founder
    /// logs; the rest follow in descending likelihood rather than alphabetically,
    /// which would put `cycling` above the two that matter.
    public static let offered = [walk, run, cycling, rowing, elliptical, hiit]

    /// How close two bouts must start to be the same bout: five minutes.
    ///
    /// A window and not an equality test because the same walk reaches Health
    /// from a watch and a phone with starts that differ by seconds, and because
    /// a bout typed by hand is typed to the nearest minute.
    public static let duplicateWindow: TimeInterval = 5 * 60

    /// One `cardio_logs` row, reduced to what the duplicate rule reads.
    public struct Existing: Sendable, Equatable {
        public let id: String
        public let date: String
        public let kind: String
        public let durationMin: Double?
        /// For an IMPORTED row this is the bout's own start — see
        /// `matchingRow(for:kind:start:durationMin:date:in:)` for why the column
        /// carries two meanings and how they are told apart.
        public let createdAt: Date?
        public let fromHealthkit: Bool

        public init(
            id: String, date: String, kind: String, durationMin: Double?,
            createdAt: Date?, fromHealthkit: Bool
        ) {
            self.id = id
            self.date = date
            self.kind = kind
            self.durationMin = durationMin
            self.createdAt = createdAt
            self.fromHealthkit = fromHealthkit
        }
    }

    /// The row an incoming bout should OVERWRITE, or nil to insert a new one.
    ///
    /// ── WHY `created_at` CARRIES THE START, AND ONLY SOMETIMES ──────────────
    /// `cardio_logs` has no start-time column and is not getting one: the table
    /// is shared with the web app and adding a column is a paste-into-the-SQL-
    /// editor step this machine cannot perform. `created_at` already exists, is
    /// read by exactly one query (`ORDER BY created_at`, the session page's
    /// bout list), and for an imported row the bout's start is a STRICTLY
    /// BETTER value for that ordering than the instant the import happened —
    /// bouts come back in the order they were performed.
    ///
    /// So an imported row stores the bout's start there. A hand-typed row still
    /// stores the moment it was typed, because that is all it knows.
    ///
    /// ── WHICH GIVES TWO RULES, AND THE SAFE ONE IS THE FUZZY ONE ────────────
    ///   · Against another IMPORTED row, `created_at` is a start on both sides,
    ///     so the founder's five-minute window is applied exactly as asked.
    ///   · Against a HAND-TYPED row, `created_at` is an insertion instant and
    ///     comparing it to a start is meaningless — a walk done at 08:00 and
    ///     typed up at 21:00 is thirteen hours from itself. There, the match is
    ///     same day, same kind, and a duration within the same five minutes.
    ///
    /// ponytail: the fuzzy rule cannot tell two hand-typed 30-minute walks on
    /// one day apart, and will overwrite the first. Given no start column that
    /// is the closest honest reading of "within a 5-minute window", and the
    /// alternative — never matching a manual row — leaves the founder with a
    /// duplicate every time they type a bout up before Health syncs it. A
    /// `started_at` column retires this whole branch.
    ///
    /// Nil `durationMin` on either side never matches: unknown is not equal.
    public static func matchingRow(
        kind: String,
        start: Date,
        durationMin: Double?,
        date: String,
        in existing: [Existing]
    ) -> Existing? {
        let sameBout = existing.filter { $0.date == date && $0.kind == kind }

        // The precise rule first: an imported row can be matched on its start,
        // and the closest one wins so a day of hourly walks maps one-to-one.
        let imported = sameBout
            .filter(\.fromHealthkit)
            .compactMap { row -> (Existing, TimeInterval)? in
                guard let at = row.createdAt else { return nil }
                let delta = abs(at.timeIntervalSince(start))
                return delta <= duplicateWindow ? (row, delta) : nil
            }
            .min { $0.1 < $1.1 }
        if let imported { return imported.0 }

        // Then the fuzzy one, over rows a person typed.
        guard let incoming = durationMin else { return nil }
        return sameBout
            .filter { !$0.fromHealthkit }
            .compactMap { row -> (Existing, Double)? in
                guard let stored = row.durationMin else { return nil }
                let delta = abs(stored - incoming)
                return delta <= duplicateWindow / 60 ? (row, delta) : nil
            }
            .min { $0.1 < $1.1 }?.0
    }
}
