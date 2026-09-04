import Foundation
import Observation

/// The seam Track E fills in Wave 2.1.
///
/// ── WHY A PROTOCOL IN THE APP AND NOT AN ACTOR IN `HelixData` ────────────────
/// §7.1 puts the real `SyncCoordinator` in `HelixData`, which Track E owns and
/// is rewriting in the same wave as this screen. Two tracks editing one package
/// is the one thing §10 forbids outright, so Today binds to the SHAPE of the
/// coordinator here.
///
/// ── HOW THE HANDOVER ACTUALLY WORKS, BECAUSE IT IS NOT OBVIOUS ───────────────
/// `HelixData` cannot see this protocol — the app imports the package, never the
/// other way round — so the actor CANNOT declare the conformance where it is
/// written. The conformance is written HERE, in the app target, which can see
/// both. Two lines, once §7.1's actor exists:
///
///     extension SyncCoordinator: SyncCoordinating {}      // in this file
///     environment.coordinator = SyncCoordinator(…)        // at sign-in
///
/// (`coordinator`, not `sync` — `sync` is the `SyncStatus` below and is a `let`.)
/// If the actor's own method signature differs, this file keeps a four-line
/// adapter instead; either way nothing in `Features/` changes.
///
/// ── WHAT THE UI ACTUALLY NEEDS, WHICH IS LESS THAN THE COORDINATOR IS ────────
/// A hairline while it runs, a timestamp when it stops, and something to await
/// on pull-to-refresh. Not the per-table cursors, not the backfill, not the
/// drain order. So the protocol is one method, and the status the screen reads
/// is a separate `@Observable` on the main actor — an `actor`'s own `state` is
/// not readable from a `body`, and making the view `await` for it would put a
/// suspension point in the render path.
protocol SyncCoordinating: Sendable {
    func syncNow(reason: SyncReason) async throws
}

/// Why a sync is running. The reason is not decoration: §7.1 coalesces on it,
/// and `.pull` is the only one the user is watching.
///
/// `Hashable` because coalescing means keying a dictionary by this, and an
/// `if case` chain is what a coordinator writes when the key is not hashable.
enum SyncReason: Hashable, Sendable {
    case launch
    case foreground
    case pull
    case realtime(table: String)
    case healthKit
}

/// What Today draws about the sync — and the only sync state any view reads.
@MainActor
@Observable
final class SyncStatus {

    enum Phase: Equatable {
        case idle
        case running
        /// Kept as a message rather than an `Error`: the view shows it, nothing
        /// retries on it, and a typed error here would be a second error domain
        /// for the same string.
        case failed(String)
    }

    private(set) var phase: Phase = .idle
    /// When the last sync FINISHED, successfully. Nil until one has.
    private(set) var lastSync: Date?

    /// How many syncs are in flight.
    ///
    /// A bool would be wrong the first time two of them overlap — and they do:
    /// pull-to-refresh and a foreground refresh are independent callers. The
    /// first to finish would hide the hairline while the second was still
    /// running, and its `.idle` would erase the other's `.failed`.
    private var running = 0

    func begin() {
        running += 1
        phase = .running
    }

    func finish(error: String?) {
        running = max(0, running - 1)
        if let error {
            // A failure is reported even while another sync continues: the one
            // that failed is the news.
            phase = .failed(error)
            return
        }
        lastSync = .now
        // Only the LAST one out turns the hairline off.
        if running == 0, phase == .running { phase = .idle }
    }

    /// "Synced 2s ago" — or nil when there is nothing honest to say yet.
    ///
    /// Takes `now` rather than reading a clock, so ageing the caption is the
    /// CALLER's redraw and not this object's. The view wraps one `Text` in a
    /// `TimelineView`; an observed `now` property here would instead re-render
    /// every view that reads anything on this object, once a second, forever.
    ///
    /// Deliberately not `RelativeDateTimeFormatter`: it says "in 0 seconds" for
    /// the instant a sync completes, which is the exact moment the caption is
    /// most likely to be read.
    func caption(at now: Date) -> String? {
        switch phase {
        case .running: return "Syncing…"
        case .failed: return "Sync failed"
        case .idle: break
        }
        guard let lastSync else { return nil }
        let seconds = Int(now.timeIntervalSince(lastSync))
        switch seconds {
        case ..<5: return "Synced just now"
        case ..<60: return "Synced \(seconds)s ago"
        case ..<3600: return "Synced \(seconds / 60)m ago"
        case ..<86_400: return "Synced \(seconds / 3600)h ago"
        default: return "Synced \(seconds / 86_400)d ago"
        }
    }

    #if DEBUG
    /// The screenshot loop's one lie, and a small one: a sync that finished
    /// `secondsAgo` ago, so the caption has something true-shaped to say.
    func seedForPreview(secondsAgo: TimeInterval) {
        lastSync = Date(timeIntervalSinceNow: -secondsAgo)
    }
    #endif
}
