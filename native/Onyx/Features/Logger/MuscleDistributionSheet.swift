import SwiftUI
import OnyxUI
import OnyxCore

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
    /// Weighted credit per landmark, and the count of sets that produced it.
    ///
    /// Two plain values rather than a `LoggerModel`, because the same picture is
    /// what a FINISHED session's muscle-focus card opens onto (§5.4). A sheet
    /// bound to the live logger could only ever be shown while one was running.
    let sets: [LandmarkMuscle: Double]
    let physicalSets: Int

    init(sets: [LandmarkMuscle: Double], physicalSets: Int) {
        self.sets = sets
        self.physicalSets = physicalSets
    }

    init(model: LoggerModel) {
        self.init(sets: model.muscleSets, physicalSets: model.physicalSets)
    }

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
                VStack(spacing: OnyxSpace.l) {
                    counts

                    AtlasFigure(worked: MuscleCredit.worked(from: sets))
                        .frame(maxHeight: 300)

                    if ranked.isEmpty {
                        ContentUnavailableView(
                            "Nothing logged yet",
                            systemImage: "figure.strengthtraining.traditional",
                            description: Text("Tick a set and the body fills in.")
                        )
                    } else {
                        legend
                    }

                    Text("Direct work counts 1.0, assistance 0.5. Warm-ups count; unticked sets do not.")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(OnyxSpace.l)
            }
            .onyxScreen(.train)
            .navigationTitle("Muscle distribution")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        // Without this a drag on the list at the `.medium` detent grows the
        // sheet instead of scrolling it.
        .presentationContentInteraction(.scrolls)
    }

    /// Two totals, side by side, and the second one is why.
    ///
    /// Weighted sets sum well ABOVE the deck's own set count by design — every
    /// compound pays two or three muscles. Without the physical figure beside
    /// it, this panel reads as a second, disagreeing tally of the same thing.
    private var counts: some View {
        HStack(spacing: OnyxSpace.grid) {
            countTile(OnyxFormat.sets(Double(physicalSets)), "Physical sets", Color.onyx.textPrimary)
            countTile(OnyxFormat.sets(weightedTotal), "Weighted sets", Color.onyx.accent(.train))
        }
    }

    private func countTile(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            Text(value)
                .onyxHero()
                .foregroundStyle(color)
            Text(label)
                .onyxMicro()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.m)
        .onyxGlass(.tile)
        .accessibilityElement(children: .combine)
    }

    private var legend: some View {
        VStack(spacing: 0) {
            ForEach(ranked, id: \.muscle) { entry in
                row(entry)
                if entry.muscle != ranked.last?.muscle {
                    Divider().overlay(Color.onyx.hairline)
                }
            }
        }
        .padding(.horizontal, OnyxSpace.m)
        .onyxGlass(.tile)
    }

    private func row(_ entry: (muscle: LandmarkMuscle, sets: Double)) -> some View {
        let tint = Color.onyx.muscle(entry.muscle)
        return HStack(spacing: OnyxSpace.grid) {
            Circle().fill(tint).frame(width: 8, height: 8)
            Text(entry.muscle.displayName)
                .onyxType(.body)
                .foregroundStyle(Color.onyx.textPrimary)
            Spacer(minLength: OnyxSpace.s)
            // The bar is the ranking, drawn. A column of numbers makes you
            // compare digits; a column of bars makes you compare lengths, which
            // is the comparison being asked for. It is decorative — the number
            // beside it is the reading — so it is hidden from VoiceOver and the
            // row speaks as one element.
            share(entry.sets, tint: tint)
            Text(OnyxFormat.sets(entry.sets))
                .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(Color.onyx.textPrimary)
                .frame(width: 30, alignment: .trailing)
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    private func share(_ value: Double, tint: Color) -> some View {
        let peak = ranked.first?.sets ?? value
        return GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.onyx.hairline)
                Capsule()
                    .fill(tint)
                    .frame(width: proxy.size.width * (peak > 0 ? value / peak : 0))
            }
        }
        .frame(width: 72, height: 4)
        .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("Distribution") {
    MuscleDistributionSheet(model: .previewUpperB(logged: true))
}
#endif
