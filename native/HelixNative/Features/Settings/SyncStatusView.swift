import SwiftUI
import GRDB
import HelixUI
import HelixCore
import HelixData

/// What the sync actually did, table by table (§5.8, decision 14).
///
/// ── WHY A SCREEN AND NOT A SPINNER ──────────────────────────────────────────
/// Today already carries the reassuring half — a hairline while it runs and
/// "Synced 2s ago" when it stops. That is enough for the good case and useless
/// for every other one. §2.3 is a list of failures this app shipped WITH a
/// green tick on screen: a 90-day window that silently hid older rows, a
/// PostgREST `select` with no `range` that truncated at the server's row cap,
/// an outbox with no caller at all. Each was invisible because the only thing
/// the UI could say was "synced".
///
/// So this screen says three things a spinner cannot:
///
///   · **when** each table last heard from the server, from the `sync_status`
///     ledger, which survives relaunch — an in-memory timestamp says "never"
///     every cold start and that is not the same fact;
///   · **how much** of each table this device actually holds, counted locally
///     rather than reported by the thing under suspicion;
///   · **what has not left yet** — the outbox depth, and separately anything
///     that has already failed, because those are different news.
///
/// Nothing here writes. The two buttons are the ordinary sync and the backfill,
/// both through `AppEnvironment` so the hairline and the caption on Today move
/// with them.
struct SyncStatusView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied by the screenshot harness so the shot has a steady ledger.
    var seeded: Snapshot?

    @State private var snapshot: Snapshot?
    @State private var confirmingBackfill = false

    /// One row of the table list, and the whole thing this screen shows.
    struct Snapshot: Equatable, Sendable {
        struct Table: Identifiable, Equatable, Sendable {
            var id: String { name }
            let name: String
            /// From the `sync_status` ledger. Nil = this device has never
            /// pulled it, which is a real state and not "0 seconds ago".
            let syncedAt: Date?
            /// Counted locally, right now.
            let rows: Int
        }

        var tables: [Table] = []
        /// Queued and in flight — everything written here that the server has
        /// not accepted.
        var pending = 0
        /// Rows the push gave up on. Counted apart: a queue that is draining
        /// and a queue that is stuck look identical as one number.
        var failed = 0

        /// The newest thing in the ledger — "nothing here is older than this
        /// is wrong", so the OLDEST table is the honest floor and is shown on
        /// its own row instead.
        var lastSync: Date? { tables.compactMap(\.syncedAt).max() }
        /// The staleness of the *least* recently pulled table that has ever
        /// been pulled. A full sync is only as fresh as its slowest table.
        var oldestSync: Date? { tables.compactMap(\.syncedAt).min() }
        var neverSynced: Int { tables.filter { $0.syncedAt == nil }.count }
        var totalRows: Int { tables.reduce(0) { $0 + $1.rows } }
    }

    var body: some View {
        Form {
            summary
            if let snapshot, !snapshot.tables.isEmpty { tables(snapshot) }
            actions
        }
        .helixFormBackground(.body)
        .navigationTitle("Sync status")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog(
            "Download the whole history again?",
            isPresented: $confirmingBackfill,
            titleVisibility: .visible
        ) {
            Button("Re-run backfill") {
                environment.rerunBackfill()
                // The sheet takes over from here; leaving this screen up behind
                // it means the counts are re-read the moment it drops.
                Task { await load() }
            }
        } message: {
            Text("Every table is read again from \(SyncStatusView.historyStart). Nothing on this device is deleted — each row is re-checked against the server — but it is a few thousand rows over the network.")
        }
    }

    /// What the backfill actually reaches back to. Stated rather than implied:
    /// "the whole history" is a promise, and this is the date it means.
    static let historyStart = "March 2026"

    // MARK: - Summary

    @ViewBuilder
    private var summary: some View {
        Section {
            // A `TimelineView` for the same reason Today's caption uses one:
            // the age has to tick without re-rendering everything that reads
            // the environment once a second.
            TimelineView(.periodic(from: .now, by: 1)) { context in
                LabeledContent("Last sync", value: environment.sync.caption(at: context.date) ?? "Never")
            }
            if let snapshot {
                LabeledContent("Oldest table", value: Self.age(snapshot.oldestSync) ?? "Never pulled")
                LabeledContent("Rows on this device", value: snapshot.totalRows.formatted())
                LabeledContent("Waiting to send", value: snapshot.pending.formatted())
                if snapshot.failed > 0 {
                    LabeledContent("Failed to send") {
                        Text(snapshot.failed.formatted())
                            .foregroundStyle(Color.helix.danger)
                    }
                }
            }
        } header: {
            HelixSectionHeader("This device", .body)
        } footer: {
            if case .failed(let message) = environment.sync.phase {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.helix.danger)
            } else if let snapshot, snapshot.pending > 0 {
                Text("Changes queue locally and go out on the next sync, so the app works with no signal at all.")
            } else {
                Text("Everything written on this device has reached the server.")
            }
        }
    }

    // MARK: - Tables

    private func tables(_ snapshot: Snapshot) -> some View {
        Section {
            ForEach(snapshot.tables) { table in
                LabeledContent {
                    Text(table.rows.formatted())
                        .helixNumeral()
                        .foregroundStyle(Color.helix.textSecondary)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(table.name)
                            .foregroundStyle(Color.helix.textPrimary)
                        Text(Self.age(table.syncedAt) ?? "Never pulled")
                            .helixType(.caption)
                            .foregroundStyle(table.syncedAt == nil ? Color.helix.textTertiary : Color.helix.textSecondary)
                    }
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(table.name), \(Self.age(table.syncedAt) ?? "never pulled"), \(table.rows) rows")
            }
        } header: {
            HelixSectionHeader("Tables", .body)
        } footer: {
            Text(snapshot.neverSynced == 0
                 ? "Row counts are read from this device, not reported by the sync."
                 : "\(snapshot.neverSynced) of \(snapshot.tables.count) tables have never been pulled on this device. Re-run the backfill below.")
        }
    }

    // MARK: - Actions

    private var actions: some View {
        Section {
            Button("Sync now") {
                Task {
                    await environment.syncNow(reason: .pull)
                    await load()
                }
            }
            .disabled(environment.sync.phase == .running)

            Button("Re-run backfill") { confirmingBackfill = true }
                .disabled(environment.backfill != nil)
        } footer: {
            Text("A sync pulls what changed since each table was last read. The backfill ignores those markers and reads everything.")
        }
    }

    // MARK: - Loading

    /// `2s ago` / `4h ago` / `Never pulled`.
    ///
    /// Same shape as `SyncStatus.caption` and deliberately not
    /// `RelativeDateTimeFormatter`, which says "in 0 seconds" for the instant a
    /// pull lands — the exact moment somebody is most likely to be reading it.
    static func age(_ date: Date?, now: Date = .now) -> String? {
        guard let date else { return nil }
        let seconds = max(0, Int(now.timeIntervalSince(date)))
        switch seconds {
        case ..<5: return "just now"
        case ..<60: return "\(seconds)s ago"
        case ..<3600: return "\(seconds / 60)m ago"
        case ..<86_400: return "\(seconds / 3600)h ago"
        default: return "\(seconds / 86_400)d ago"
        }
    }

    private func load() async {
        if let seeded {
            snapshot = seeded
            return
        }
        // The ledger read goes through the actor because that is who owns the
        // user id the rows are keyed by; the counts are a plain read.
        let ledger = (try? await environment.coordinator?.lastSync()) ?? [:]
        let database = environment.database
        snapshot = await Task.detached(priority: .userInitiated) {
            Self.build(database: database, ledger: ledger)
        }.value
    }

    /// Counted off the main actor: this is one `count(*)` per mirrored table.
    private nonisolated static func build(database: AppDatabase, ledger: [String: Date]) -> Snapshot {
        // ── THE NAMES ARE THE CATALOGUE'S, NOT A STRING FROM ANYWHERE ────────
        // `backfillOrder` is generated from `MirrorCatalogue`, so these are
        // compile-time identifiers rather than anything a user or a server can
        // influence — which is what makes interpolating them into SQL safe. The
        // intersection with `sqlite_master` is not the guard, it is the answer
        // to a catalogue table this schema version does not have yet: skipped
        // rather than counted as a crash.
        let existing: Set<String> = (try? database.read { db in
            try Set(String.fetchAll(db, sql: "SELECT name FROM sqlite_master WHERE type = 'table'"))
        }) ?? []

        var out = Snapshot()
        out.tables = SyncCoordinator.backfillOrder.filter(existing.contains).map { name in
            let rows = (try? database.read { db in
                try Int.fetchOne(db, sql: "SELECT count(*) FROM \"\(name)\"") ?? 0
            }) ?? 0
            return Snapshot.Table(name: name, syncedAt: ledger[name], rows: rows)
        }

        // Folded to a dictionary INSIDE the read: GRDB's `Row` is not
        // `Sendable` and `AppDatabase.read` hands its result across an
        // isolation boundary, so a `[Row]` cannot leave the closure.
        let queue: [String: Int] = (try? database.read { db in
            var counts: [String: Int] = [:]
            let rows = try Row.fetchAll(db, sql: "SELECT status, count(*) AS n FROM outbox GROUP BY status")
            for row in rows {
                counts[row["status"] ?? "", default: 0] += row["n"] ?? 0
            }
            return counts
        }) ?? [:]
        for (status, n) in queue {
            // A row is deleted the moment the server accepts it, so everything
            // still in the table is unsent. `failed` is called out separately.
            if status == OutboxItem.Status.failed.rawValue { out.failed += n } else { out.pending += n }
        }
        return out
    }
}

#if DEBUG
extension SyncStatusView.Snapshot {
    /// A device three weeks into the block: everything pulled, one edit still
    /// queued, and `fatigue_logs` never seen because nothing has written one.
    static let preview: Self = {
        var out = Self()
        let now = Date()
        let seed: [(String, TimeInterval?, Int)] = [
            ("user_goals", 2, 1), ("plans", 2, 3), ("exercises", 3, 128),
            ("workout_sessions", 3, 61), ("workout_sets", 4, 1_586),
            ("daily_logs", 2, 412), ("daily_scores", 5, 178),
            ("nutrition_entries", 9, 934), ("water_intake", 9, 402),
            ("body_composition", 61, 24), ("sleep_sessions", 61, 171),
            ("cardio_logs", 240, 38), ("doms_logs", 1_920, 46),
            ("fatigue_logs", nil, 0), ("personal_records", 5, 21),
        ]
        out.tables = seed.map { name, ago, rows in
            Table(name: name, syncedAt: ago.map { now.addingTimeInterval(-$0) }, rows: rows)
        }
        out.pending = 3
        return out
    }()
}

#Preview("Sync status") {
    NavigationStack { SyncStatusView(seeded: .preview) }
        .environment(AppEnvironment.preview)
}
#endif
