import Foundation
import ActivityKit

/// The shape of a running workout, on the Lock Screen and in the Dynamic Island.
///
/// ── THIS FILE IS IN TWO TARGETS, AND IT HAS TO BE ───────────────────────────
/// `HelixNative` and `HelixNativeWidgets`. ActivityKit matches the app's
/// `Activity.request` to the extension's `ActivityConfiguration` **by the
/// attributes type**, and two identically-named structs compiled into two
/// modules are two different types. Getting this wrong does not fail to build:
/// the activity starts, and nothing draws.
///
/// `project.yml` lists `Shared/` as a source of both targets, which is the
/// generated-project equivalent of ticking two boxes — and the reason the
/// project file is generated at all.
///
/// ── AND WHY THIS ONE CROSSES A LINE `HelixSnapshot` CANNOT ──────────────────
/// App Groups are a PAID capability, which is why the Capacitor widgets fetch
/// their own data over HTTP rather than reading anything the app wrote. That
/// constraint is about SHARED STORAGE, and a Live Activity uses none: the
/// content travels through ActivityKit itself, from `Activity.update` in the
/// app to the extension's view body, with no container in between. Nothing is
/// persisted, nothing is fetched, and there is no token to keep fresh.
struct HelixWorkoutAttributes: ActivityAttributes {

    /// ── WHY ALMOST EVERY FIELD IS A STRING ──────────────────────────────────
    /// The consumer is a SwiftUI view whose whole job is to draw text, and the
    /// producer already owns the formatting rules — a cable stack really is
    /// 13.75 kg and rounding it to 13.8 on a Lock Screen means the number you
    /// read is not the number you logged. Re-deriving those rules on the far
    /// side of ActivityKit would be a second implementation allowed to
    /// disagree with the first.
    struct ContentState: Codable, Hashable {
        /// The movement you are walking towards. "Seated Cable Row (Wide Grip)".
        var exercise: String
        /// Which set of it, already composed: "Set 3 of 4".
        var setLabel: String
        /// THIS set's load, pre-formatted: "42.5 kg × 12".
        ///
        /// The card LEADS with this. History used to be the largest thing on
        /// the face while the set you were standing in front of went unnamed —
        /// history is context for a decision, not the decision itself. Empty
        /// while the row is blank, and weight-only while the reps are still
        /// being typed, which is the state the card is in during every set.
        var load: String
        /// THIS set's effort: "RPE 8". Empty until it is rated.
        var rpe: String
        /// What you did on this set number last time: "40 kg × 12". Empty when
        /// the movement is new — a Lock Screen has no room to say "no data"
        /// politely.
        var lastTime: String
        /// Live session tonnage, formatted. "1 074 kg".
        var volume: String
        /// Working sets ticked, and what the deck prescribes.
        ///
        /// ── WHY TWO INTEGERS AND NOT ONE STRING ─────────────────────────────
        /// Every other field here is pre-formatted because the card only ever
        /// draws it. These two are the exception on purpose: the card draws a
        /// PROGRESS — "9 of 22", a ring, a bar — and a progress needs the two
        /// numbers apart to divide them. "12" arriving as text was why the Lock
        /// Screen could say how much you had done and never how much was left.
        var setsDone: Int
        var setsPlanned: Int
        /// Records claimed in THIS session. Zero renders as NOTHING: a permanent
        /// gold zero is how gold stops meaning a personal record.
        var prsThisSession: Int
        /// When the current rest period ends, so the card can count it down
        /// itself with a `Text(_:style:)` timer. `nil` means not resting, which
        /// is not the same as a timer at zero.
        var restEndsAt: Date?
        /// Cumulative session tonnage after each completed set, oldest first.
        ///
        /// The one non-scalar field, and the exception earns itself: a
        /// sparkline is a SHAPE and a shape cannot be pre-rendered into text
        /// the way a load can. Capped at 12 points by the producer —
        /// ActivityKit budgets updates by payload size as well as by frequency,
        /// and a chart that grew without bound would cost more the longer the
        /// session ran, which is exactly backwards.
        var spark: [Double]
        /// The workout's own day key — "cb_b", "legs_a".
        ///
        /// ── WHY A KEY AND NOT A COLOUR ──────────────────────────────────────
        /// It used to be `ProgramDay.accent`, a raw `0xRRGGBB` from the Phase-1
        /// palette, sent so the card and the deck header could not drift. They
        /// drifted anyway the moment Onyx re-keyed the day colours (§3.2): the
        /// deck read `Color.helix.day(key)` and the Lock Screen still carried
        /// last year's orange. Sending the KEY and letting both sides resolve it
        /// through the one token function is what actually makes drift
        /// impossible — the colour has exactly one definition again.
        var dayKey: String
    }

    /// The workout's name — fixed for the life of the activity, which is
    /// exactly what `ActivityAttributes` (as opposed to `ContentState`) is for.
    var title: String
    var startedAt: Date
}
