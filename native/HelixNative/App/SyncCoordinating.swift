import Foundation
import Observation
import HelixData

/// The shape Today binds to; `HelixData`'s `SyncCoordinator` is the one
/// conformance.
///
/// ── WHY THE PROTOCOL LIVES IN THE APP ────────────────────────────────────────
/// Track U wrote Today against this seam while Track E was writing the actor in
/// the same wave, and §10 forbids two tracks in one package. `HelixData` cannot
/// see this protocol — the app imports the package, never the other way round —
/// so the conformance is declared HERE, where both are visible. Wave 2.1 filled
/// it: the actor's own `syncNow(reason:)` matches, so no adapter.
///
/// The UI needs less than the coordinator has: a hairline while it runs, a
/// timestamp when it stops, something to await on pull-to-refresh. Not the
/// per-table cursors, not the drain order. The status the screen reads is the
/// separate `@Observable` below — an `actor`'s `state` is not readable from a
/// `body` without a suspension point in the render path.
protocol SyncCoordinating: Sendable {
    func syncNow(reason: SyncReason) async throws
}

extension SyncCoordinator: SyncCoordinating {}

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
