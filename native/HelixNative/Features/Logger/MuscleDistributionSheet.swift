import SwiftUI
import HelixUI
import HelixCore

/// Where the session you are logging is actually landing.
///
/// ── WHY IT IS A SHEET AND NOT A PANEL ───────────────────────────────────────
/// The logger is a data-entry surface and every pixel it spends on analysis is
/// a pixel not spent on the set you are about to log. A thumbnail beside the
/// set count is enough to notice the whole session is on one side of the body;
/// this is where you look once you have noticed.
///
/// `.presentationDetents([.medium, .large])` is the whole of it. That single
/// modifier replaces `ui/Sheet.tsx` + `ui/overlay.tsx` — 472 lines of
/// hand-rolled drag-to-dismiss with its own rubber-banding — and it gets the
/// interruptible grab, the velocity handoff and the detent snapping for free,
/// because they are the system's.
struct MuscleDistributionSheet: View {
    let model: LoggerModel

    private var sets: [LandmarkMuscle: Double] { model.muscleSets }

    /// Ranked, heaviest first. Ties break on the landmark's own order so the
    /// list cannot reshuffle under the reader between two redraws.
    private var ranked: [(muscle: LandmarkMuscle, sets: Double)] {
        LandmarkMuscle.allCases
            .compactMap { muscle in
                guard let value = sets[muscle], value > 0 else { return nil }
                return (muscle, value)
            }
            .sorted { $0.sets == $1.sets ? indexOf($0.muscle) < indexOf($1.muscle) : $0.sets > $1.sets }
    }

    private func indexOf(_ muscle: LandmarkMuscle) -> Int {
        LandmarkMuscle.allCases.firstIndex(of: muscle) ?? 0
    }

    private var weightedTotal: Double { sets.values.reduce(0, +) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    counts

                    AtlasFigure(worked: MuscleCredit.worked(from: sets))
                        .frame(maxHeight: 300)
                        .padding(.vertical, 4)

                    if ranked.isEmpty {
                        ContentUnavailableView(
                            "Nothing logged yet",
                            systemImage: "figure.strengthtraining.traditional",
                            description: Text("Tick a set and the body fills in.")
                        )
                        .padding(.top, 20)
                    } else {
                        legend
                    }

                    Text("Direct work counts 1.0, assistance 0.5. Warm-ups count; unticked sets do not.")
                        .helixText(.small)
                        .foregroundStyle(HelixPalette.dim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(18)
            }
            .background(HelixPalette.obsidian)
            .navigationTitle("Muscle distribution")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HelixPalette.obsidian)
    }

    /// Two totals, side by side, and the second one is why.
    ///
    /// Weighted sets sum well ABOVE the deck's own set count by design — every
    /// compound pays two or three muscles. Without the physical figure beside
    /// it, this panel reads as a second, disagreeing tally of the same thing.
    private var counts: some View {
        HStack(spacing: 10) {
            countTile(HelixFormat.sets(Double(model.physicalSets)), "PHYSICAL SETS", HelixPalette.platinum)
            countTile(HelixFormat.sets(weightedTotal), "WEIGHTED SETS", HelixPalette.ember)
        }
    }

    private func countTile(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .helixText(.fluid2XL, weight: .bold, leading: .none)
                .helixNumber()
                .foregroundStyle(color)
            Text(label)
                .helixText(.label, weight: .semibold, leading: .none)
                .foregroundStyle(HelixPalette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .helixCard()
    }

    private var legend: some View {
        VStack(spacing: 0) {
            ForEach(ranked, id: \.muscle) { entry in
                HStack(spacing: 10) {
                    Circle()
                        .fill(HelixPalette.muscle(entry.muscle))
                        .frame(width: 8, height: 8)
                    Text(entry.muscle.displayName)
                        .helixText(.fluidBase, leading: .none)
                        .foregroundStyle(HelixPalette.text)
                    Spacer(minLength: 8)
                    // The bar is the ranking, drawn. A column of numbers makes
                    // you compare digits; a column of bars makes you compare
                    // lengths, which is the comparison being asked for.
                    HelixBar(
                        value: entry.sets,
                        goal: ranked.first?.sets,
                        color: HelixPalette.muscle(entry.muscle),
                        height: 4
                    )
                    .frame(width: 72)
                    Text(HelixFormat.sets(entry.sets))
                        .helixText(.fluidBase, weight: .semibold, leading: .none)
                        .helixNumber()
                        .foregroundStyle(HelixPalette.text)
                        .frame(width: 30, alignment: .trailing)
                }
                .padding(.vertical, 9)
                if entry.muscle != ranked.last?.muscle {
                    Divider().overlay(HelixPalette.cardBorder)
                }
            }
        }
        .padding(.horizontal, 14)
        .helixCard()
    }
}

#if DEBUG
#Preview("Distribution") {
    MuscleDistributionSheet(model: .previewUpperB(logged: true))
}
#endif
