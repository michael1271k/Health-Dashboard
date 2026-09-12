import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// The week, once the work in it is done.
///
/// ── WHY THIS IS NOT A SUNDAY MODAL ──────────────────────────────────────────
/// The obvious build is a sheet that appears on its own when the week closes.
/// It is also the build nobody reads: a modal between you and the screen you
/// opened gets dismissed by reflex, and once dismissed it is gone — a summary
/// of the week you just trained, shown exactly once, at a moment you did not
/// choose.
///
/// So the This-week tile TRANSFORMS instead. The same panel, in the same place,
/// now saying "Week wrapped" with a chevron. Nothing interrupts, the door is
/// permanent, and a week from March is reachable by the same route as this one.
///
/// ── AND WHY THE WEEK CLOSES ON FRIDAY ───────────────────────────────────────
/// `WeeklyWrap.isWrapped`, not the calendar: on a plan that rests Saturday the
/// training week ends on Friday evening, and a summary that waits for Sunday
/// arrives after you have stopped thinking about the week it describes. Cardio
/// does not gate it — a walk is not something the training week waits for.
struct WeeklyWrapView: View {
    let summary: WeeklyWrap.Summary
    let program: Program

    /// Off by default. A share card is the one surface in this app that leaves
    /// the phone, and the figures on it are the user's to choose — so the
    /// private ones are absent until asked for, which is the only default that
    /// cannot leak something by being forgotten.
    @State private var showBodyweight = false
    /// The rendered card, re-made whenever the toggle changes.
    ///
    /// Held rather than computed in `body`: `ShareLink` needs its item up front,
    /// and rendering a 540×960 composition on every layout pass to supply one
    /// would re-rasterise the card every time the screen scrolls.
    @State private var card: Image?

    @Environment(\.displayScale) private var displayScale

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OnyxSpace.l) {
                headline
                if let top = summary.topSet { topSetCard(top) }
                movementList("Progressed", summary.progressions, tone: .good, symbol: "arrow.up.right")
                movementList("Eased off", summary.deloaded, tone: .textSecondary, symbol: "moon.zzz")
                movementList("Regressed", summary.regressions, tone: .danger, symbol: "arrow.down.right")
                shareSection
            }
            .padding(.horizontal, OnyxSpace.l)
            .padding(.bottom, OnyxSpace.xl)
        }
        .onyxScreen(.train)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        // `task(id:)` and not `onChange`: it also fires on appear, so the card
        // exists before the first tap rather than one render after it.
        .task(id: showBodyweight) {
            // Yield first. `render()` is synchronous and lays out and
            // rasterises a 540 × 960 view at `displayScale` — roughly 18 MB —
            // on the main actor, and without this it does so in the same turn
            // as the navigation push, which is the one frame budget on this
            // screen that is already spent.
            await Task.yield()
            guard !Task.isCancelled else { return }
            card = render()
        }
    }

    private var title: String {
        "Week of \(Swap.shortDayLabel(summary.weekStart))"
    }

    // MARK: - The numbers

    private var headline: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.m) {
            // A deload says so at the top, before any figure is read. The same
            // tonnage means two different things in the two kinds of week, and
            // a reader who learns which one this was AFTER seeing the drops has
            // already had the wrong reaction.
            if summary.isDeload {
                Label("Deload week — lighter by design", systemImage: "moon.zzz")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
            }
            HStack(spacing: OnyxSpace.m) {
                stat("SESSIONS", "\(summary.sessions)", delta: nil)
                // "TONNAGE KG" and not a bare "TONNAGE": the delta beneath it
                // carries its unit, and a figure whose unit is stated one line
                // down but not on itself reads as two different quantities.
                stat("TONNAGE KG", OnyxFormat.volume(summary.tonnageKg), delta: summary.tonnageDeltaKg)
                stat("PRs", "\(summary.prCount)", delta: nil, tint: summary.prCount > 0 ? Color.onyx.record : nil)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.l)
        .onyxGlass(.tile)
    }

    private func stat(_ label: String, _ value: String, delta: Double?, tint: Color? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).onyxMicro()
            Text(value)
                .onyxType(.display).onyxNumeral()
                .foregroundStyle(tint ?? Color.onyx.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.6)
            if let delta, delta != 0 {
                // Signed, always: "+1,240 kg" and "1,240 kg" are different
                // claims and only one of them is a comparison.
                Text("\(delta > 0 ? "+" : "−")\(OnyxFormat.volume(abs(delta))) kg")
                    .onyxType(.micro).onyxNumeral()
                    .foregroundStyle(delta > 0 ? Color.onyx.good : Color.onyx.textSecondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func topSetCard(_ movement: WeeklyWrap.Movement) -> some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            Text("HEAVIEST SET").onyxMicro()
            Text(movement.name)
                .onyxType(.hero)
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(2).minimumScaleFactor(0.7)
            Text("\(OnyxFormat.kg(movement.weightKg)) kg × \(jsIntegerString(movement.reps))")
                .onyxType(.body).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.l)
        .background(alignment: .top) {
            LinearGradient(
                colors: [Color.onyx.day(movement.dayKey).opacity(0.22), .clear],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 72)
        }
        .onyxGlass(.tile)
    }

    // MARK: - The lists

    /// An empty list draws nothing. A "Regressed — none" heading is a heading
    /// that makes the reader check a thing that did not happen.
    @ViewBuilder
    private func movementList(
        _ title: String, _ movements: [WeeklyWrap.Movement], tone: OnyxTone, symbol: String
    ) -> some View {
        if !movements.isEmpty {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                Label(title.uppercased(), systemImage: symbol)
                    .onyxMicro()
                    .foregroundStyle(tone.color)
                ForEach(movements) { movement in
                    HStack(spacing: OnyxSpace.s) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(movement.name)
                                .onyxType(.secondary)
                                .foregroundStyle(Color.onyx.textPrimary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                            Text("\(OnyxFormat.kg(movement.weightKg)) kg × \(jsIntegerString(movement.reps))")
                                .onyxType(.micro).onyxNumeral()
                                .foregroundStyle(Color.onyx.textTertiary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if let change = movement.change {
                            Text("\(change > 0 ? "+" : "−")\(jsIntegerString(jsRound(abs(change) * 100)))%")
                                .onyxType(.caption).onyxNumeral()
                                .foregroundStyle(tone.color)
                        }
                    }
                    .padding(.horizontal, OnyxSpace.m)
                    .frame(minHeight: 48)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onyxGlass(.row)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    /// The four tones this screen uses, named rather than passed as colours, so
    /// a list cannot be drawn in a hue the token table does not sanction — gold
    /// in particular, which §3.2 reserves for a personal record.
    enum OnyxTone {
        case good, danger, textSecondary

        var color: Color {
            switch self {
            case .good: Color.onyx.good
            case .danger: Color.onyx.danger
            case .textSecondary: Color.onyx.textSecondary
            }
        }
    }

    // MARK: - Sharing

    private var shareSection: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            Toggle(isOn: $showBodyweight) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Include bodyweight").onyxType(.secondary)
                    Text("Off by default. The card is going somewhere this app cannot see.")
                        .onyxType(.micro)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
            }
            .tint(OnyxDomain.train.accent)

            if let card {
                ShareLink(
                    item: card,
                    preview: SharePreview(title, image: card)
                ) {
                    Label("Share this week", systemImage: "square.and.arrow.up")
                        .onyxType(.secondary).fontWeight(.semibold)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .onyxGlass(.row)
                }
                .onyxPress(scale: 0.98)
            }
        }
        .padding(OnyxSpace.l)
        .onyxGlass(.tile)
    }

    /// The 9:16 card, rendered off-screen.
    ///
    /// `ImageRenderer` and not a screenshot: this one IS a flat composition —
    /// no material, no blur, nothing the render server has to composite — so
    /// the off-screen pass is the truth here, unlike the review loop, where it
    /// would photograph the layout and lie about the look.
    ///
    /// A SwiftUI `Image` and not a `UIImage`: `Image` is `Transferable`, which
    /// is what `ShareLink` wants. Wrapping a `UIImage` in a
    /// `UIViewControllerRepresentable` around `UIActivityViewController` also
    /// works and does not survive strict concurrency — `[Any]` is not
    /// `Sendable`, and a conformance written to get one call site past the
    /// compiler is the wrong half of this trade.
    @MainActor
    private func render() -> Image? {
        let renderer = ImageRenderer(
            content: WeeklyShareCard(summary: summary, program: program, showBodyweight: showBodyweight)
        )
        renderer.scale = displayScale
        return renderer.uiImage.map { Image(uiImage: $0) }
    }
}
