import SwiftUI
import OnyxData
import OnyxUI

/// What the backfill sheet reads. Fed by `AppEnvironment.runBackfill`, which
/// hops every `BackfillProgress` the coordinator emits onto the main actor.
@MainActor
@Observable
final class BackfillModel {
    var progress: BackfillProgress?
    /// The coordinator's error, once the run has stopped. The sheet offers
    /// Retry; nothing retries on its own.
    var error: String?
}

/// The first-launch backfill (§7.2): full screen, non-dismissable, one row per
/// table in the order they come down, a count as each lands, and the clock.
///
/// It closes itself. Cancel is sign-out — there is no app to show without the
/// history, so the only honest way out is the way in.
struct BackfillSheet: View {
    @Environment(AppEnvironment.self) private var environment
    let model: BackfillModel

    @State private var isCancelling = false

    var body: some View {
        ScrollView {
            VStack(spacing: OnyxSpace.xl) {
                header
                if let progress = model.progress {
                    summary(progress)
                    tables(progress)
                } else {
                    ProgressView().controlSize(.large).padding(.top, OnyxSpace.xl)
                }
                if let error = model.error { failure(error) }
            }
            .padding(OnyxSpace.l)
        }
        .onyxScreen(.train)
        .interactiveDismissDisabled()
        .safeAreaInset(edge: .bottom) {
            Button("Cancel", role: .destructive) { isCancelling = true }
                .font(.footnote)
                .foregroundStyle(Color.onyx.textTertiary)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(.ultraThinMaterial)
        }
        .confirmationDialog("Stop and sign out?", isPresented: $isCancelling, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await environment.signOut() } }
        } message: {
            Text("The download starts again from the top next time you sign in.")
        }
        .sensoryFeedback(.success, trigger: model.progress?.isFinished ?? false) { _, done in done }
        .sensoryFeedback(.error, trigger: model.error) { _, error in error != nil }
    }

    private var header: some View {
        VStack(spacing: OnyxSpace.s) {
            OnyxMark(size: 32, opacity: 1)
            Text(model.progress?.isFinished == true ? "History ready" : "Building your history")
                .font(.title2.weight(.semibold))
                .foregroundStyle(Color.onyx.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("Every session since 10 March 2026 comes down once. This screen closes on its own.")
                .font(.footnote)
                .foregroundStyle(Color.onyx.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, OnyxSpace.xl)
    }

    private func summary(_ progress: BackfillProgress) -> some View {
        HStack {
            Text("\(progress.tablesLanded) of \(progress.tables.count) tables")
            Spacer()
            Text("\(progress.rowsLanded.formatted()) rows")
            Spacer()
            // Ticks once a second; only this `Text` redraws.
            TimelineView(.periodic(from: progress.startedAt, by: 1)) { context in
                Text(Self.elapsed(from: progress.startedAt, to: progress.finishedAt ?? context.date))
                    .monospacedDigit()
            }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(Color.onyx.textSecondary)
        .padding(.horizontal, OnyxSpace.m)
        .accessibilityElement(children: .combine)
    }

    private func tables(_ progress: BackfillProgress) -> some View {
        // The row being pulled is the first one still waiting.
        let current = progress.isFinished ? nil : progress.tables.first { $0.rows == nil && $0.error == nil }?.name
        return VStack(spacing: 0) {
            ForEach(progress.tables) { table in
                HStack {
                    Text(Self.title(table.name))
                        .font(.subheadline)
                        .foregroundStyle(table.rows == nil ? Color.onyx.textTertiary : Color.onyx.textPrimary)
                    Spacer()
                    if let error = table.error {
                        Image(systemName: "exclamationmark.circle")
                            .foregroundStyle(Color.onyx.danger)
                            .accessibilityLabel("Failed: \(error)")
                    } else if let rows = table.rows {
                        Text(rows.formatted())
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(Color.onyx.textSecondary)
                    } else if table.name == current {
                        ProgressView().controlSize(.small).tint(Color.onyx.textSecondary)
                    } else {
                        Text("—").foregroundStyle(Color.onyx.textTertiary)
                    }
                }
                .frame(minHeight: 36)
                .padding(.horizontal, OnyxSpace.m)
                .accessibilityElement(children: .combine)
                if table.id != progress.tables.last?.id {
                    Divider().overlay(Color.onyx.hairline)
                }
            }
        }
        .onyxGlass(.tile)
    }

    private func failure(_ error: String) -> some View {
        VStack(spacing: OnyxSpace.m) {
            Text(error)
                .font(.footnote)
                .foregroundStyle(Color.onyx.danger)
                .multilineTextAlignment(.center)
            Button("Retry") { environment.retryBackfill(model) }
                .buttonStyle(.borderedProminent)
                .tint(OnyxDomain.train.accent)
                .foregroundStyle(Color.onyx.base)
        }
    }

    /// `workout_sets` → "Workout sets".
    static func title(_ table: String) -> String {
        table.replacingOccurrences(of: "_", with: " ").prefix(1).uppercased()
            + table.replacingOccurrences(of: "_", with: " ").dropFirst()
    }

    static func elapsed(from start: Date, to now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(start)))
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

#if DEBUG
extension BackfillModel {
    /// Halfway through: the shape worth photographing.
    static var preview: BackfillModel {
        let model = BackfillModel()
        var tables = SyncCoordinator.backfillOrder.map { BackfillProgress.Table(name: $0) }
        let landed = [1, 1, 60, 112, 2_277, 155, 67, 159, 1, 154]
        for (index, rows) in landed.enumerated() { tables[index].rows = rows }
        model.progress = BackfillProgress(tables: tables, startedAt: Date(timeIntervalSinceNow: -41))
        return model
    }
}

#Preview("Backfill") {
    BackfillSheet(model: .preview).environment(AppEnvironment.preview)
}
#endif
