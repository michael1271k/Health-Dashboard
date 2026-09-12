import SwiftUI
import OnyxUI
import OnyxCore

/// The 9:16 card that leaves the phone.
///
/// ── WHY IT IS A SEPARATE VIEW AND NOT THE SCREEN, RENDERED ──────────────────
/// A screenshot of the wrap-up screen would carry a navigation bar, a scroll
/// position, a toggle and a share button — chrome that means something inside
/// the app and nothing at all in a photo library. It would also be whatever
/// aspect ratio the phone happens to be, which is not the shape anything
/// shares.
///
/// ── AND WHY IT IS FLAT ──────────────────────────────────────────────────────
/// Every other surface in this app is material: `ultraThinMaterial`, blur that
/// samples what is behind it, a mesh bleed. `ImageRenderer` has no render
/// server, so it composites none of that — a material tile renders as a grey
/// rectangle. That is the reason the review loop boots a simulator instead.
///
/// This card is drawn in flat fills and gradients precisely so the off-screen
/// pass is the TRUTH here: nothing on it needs compositing, so nothing on it
/// can be lied about by the renderer.
///
/// ── AND WHY IT STILL USES THE TOKENS ────────────────────────────────────────
/// The first draft spelled its own point sizes and greys, on the argument that
/// a fixed 540 × 960 composition must not reflow. That argument is about
/// SCALING, and `dynamicTypeSize(.large)` below already settles it — the roles
/// render at their standard size and stay there. Spelling the values as well
/// bought nothing and cost the one rule the native design system enforces:
/// a view names meanings, and the meanings live in one file.
/// (`native-token-discipline` is what caught it.)
///
/// ── NOTHING PRIVATE UNLESS ASKED ────────────────────────────────────────────
/// Bodyweight is the one figure here that a person might not want in a photo
/// they post, and it is off unless the toggle is on. Off is the only default
/// that cannot leak something by being forgotten — the opposite default leaks
/// on the first share where somebody did not think to check.
struct WeeklyShareCard: View {
    let summary: WeeklyWrap.Summary
    let program: Program
    let showBodyweight: Bool

    /// 1080 × 1920 at scale 1, which is what every social surface wants and
    /// what the renderer's `scale` multiplies up from.
    private let size = CGSize(width: 540, height: 960)

    var body: some View {
        // ── THREE BLOCKS, TWO GAPS ──────────────────────────────────────────
        // The first draft put a `Spacer` between every part, which distributes
        // the slack evenly and is exactly wrong for a poster: the card came out
        // top-heavy, bottom-heavy, and hollow through the middle, with the
        // figures floating unattached to the title they belong to.
        //
        // The title and its figures are ONE statement and sit together. The top
        // set and the movers are the body. The mark is the footer. Slack goes
        // between the blocks, not inside them.
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: OnyxSpace.xl) {
                header
                figures
            }
            Spacer(minLength: OnyxSpace.xl)
            VStack(alignment: .leading, spacing: OnyxSpace.l) {
                if let top = summary.topSet { topSet(top) }
                movements
            }
            Spacer(minLength: OnyxSpace.xl)
            footer
        }
        .padding(OnyxSpace.xl + OnyxSpace.m)
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .background {
            // A flat vertical gradient in the TRAIN accent, which is what the
            // app's own screens bleed behind their titles — the same identity
            // without the material that cannot survive the render.
            LinearGradient(
                colors: [OnyxDomain.train.accent.opacity(0.34), Color.onyx.base],
                startPoint: .top, endPoint: .center
            )
            .background(Color.onyx.base)
        }
        // The card is a fixed composition at a fixed size and is never read at
        // an accessibility text size — it is an image. Letting Dynamic Type
        // into it would reflow a 540-point layout off its own edges.
        .dynamicTypeSize(.large)
        .environment(\.colorScheme, .dark)
    }

    // MARK: - Parts

    private var header: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            Text("WEEK OF \(Swap.shortDayLabel(summary.weekStart).uppercased())")
                .onyxMicro()
            Text(summary.isDeload ? "Deload week" : "Week wrapped")
                .onyxType(.clock).fontWeight(.bold)
                .foregroundStyle(Color.onyx.textPrimary)
        }
    }

    private var figures: some View {
        HStack(alignment: .top, spacing: OnyxSpace.l) {
            figure("\(summary.sessions)", "SESSIONS", delta: nil)
            figure(OnyxFormat.volume(summary.tonnageKg), "KG LIFTED", delta: summary.tonnageDeltaKg)
            if summary.prCount > 0 {
                figure("\(summary.prCount)", "PRs", delta: nil, tint: Color.onyx.record)
            }
        }
    }

    private func figure(_ value: String, _ label: String, delta: Double?, tint: Color = .white) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .onyxType(.hero).onyxNumeral().fontWeight(.bold)
                .foregroundStyle(tint)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text(label)
                .onyxMicro()
            if let delta, delta != 0 {
                Text("\(delta > 0 ? "+" : "−")\(OnyxFormat.volume(abs(delta)))")
                    .onyxType(.caption).onyxNumeral().fontWeight(.semibold)
                    .foregroundStyle(delta > 0 ? Color.onyx.good : Color.onyx.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func topSet(_ movement: WeeklyWrap.Movement) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("HEAVIEST SET").onyxMicro()
            Text(movement.name)
                .onyxType(.display).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text("\(OnyxFormat.kg(movement.weightKg)) kg × \(jsIntegerString(movement.reps))")
                .onyxType(.body).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.l)
        .background(RoundedRectangle(cornerRadius: OnyxSpace.l).fill(.white.opacity(0.07)))
    }

    /// Five rows at most. A share card that lists eleven movements is a
    /// spreadsheet nobody reads at thumbnail size, and the ones that moved most
    /// are the ones worth the space — `movements(_:)` already sorts by
    /// magnitude.
    @ViewBuilder
    private var movements: some View {
        // Sorted BEFORE the prefix. Each list is individually ordered by
        // magnitude, but concatenating three of them and taking the first five
        // is CATEGORY order — so a week with five progressions dropped every
        // regression from the card that leaves the phone, which is the half a
        // reader is owed most.
        let rows = (summary.progressions + summary.deloaded + summary.regressions)
            .sorted { abs($0.change ?? 0) > abs($1.change ?? 0) }
            .prefix(5)
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                ForEach(rows) { movement in
                    let verdict = WeeklyWrap.verdict(movement, isDeload: summary.isDeload)
                    HStack(spacing: OnyxSpace.s) {
                        Text(movement.name)
                            .onyxType(.secondary)
                            .foregroundStyle(Color.onyx.textPrimary)
                            .lineLimit(1).minimumScaleFactor(0.75)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let change = movement.change {
                            Text("\(change > 0 ? "+" : "−")\(jsIntegerString(jsRound(abs(change) * 100)))%")
                                .onyxType(.secondary).onyxNumeral().fontWeight(.semibold)
                                .foregroundStyle(tint(verdict))
                        }
                    }
                }
            }
        }
    }

    private func tint(_ verdict: WeeklyWrap.Verdict) -> Color {
        switch verdict {
        case .progressed: Color.onyx.good
        case .regressed: Color.onyx.danger
        case .deloaded, .held: .white.opacity(0.5)
        }
    }

    @ViewBuilder
    private var footer: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            if showBodyweight, let kg = summary.bodyweightKg {
                HStack(spacing: OnyxSpace.xs) {
                    Text("\(OnyxFormat.kg(kg)) kg")
                        .onyxType(.secondary).onyxNumeral().fontWeight(.semibold)
                        .foregroundStyle(Color.onyx.textPrimary)
                    if let delta = summary.bodyweightDeltaKg, delta != 0 {
                        Text("\(delta > 0 ? "+" : "−")\(OnyxFormat.kg(abs(delta))) kg")
                            .onyxType(.caption).onyxNumeral()
                            .foregroundStyle(Color.onyx.textSecondary)
                    }
                }
            }
            HStack(spacing: OnyxSpace.s) {
                OnyxMark(size: 18, opacity: 0.5)
                Text(program.label.isEmpty ? "Onyx" : program.label)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
        }
    }
}
