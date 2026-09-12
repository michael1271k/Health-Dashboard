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
            VStack(alignment: .leading, spacing: 28) {
                header
                figures
            }
            Spacer(minLength: 24)
            VStack(alignment: .leading, spacing: 18) {
                if let top = summary.topSet { topSet(top) }
                movements
            }
            Spacer(minLength: 24)
            footer
        }
        .padding(36)
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .background {
            // A flat vertical gradient in the TRAIN accent, which is what the
            // app's own screens bleed behind their titles — the same identity
            // without the material that cannot survive the render.
            LinearGradient(
                colors: [
                    OnyxDomain.train.accent.opacity(0.34),
                    Color(red: 0.04, green: 0.04, blue: 0.05),
                ],
                startPoint: .top, endPoint: .center
            )
            .background(Color(red: 0.04, green: 0.04, blue: 0.05))
        }
        // The card is a fixed composition at a fixed size and is never read at
        // an accessibility text size — it is an image. Letting Dynamic Type
        // into it would reflow a 540-point layout off its own edges.
        .dynamicTypeSize(.large)
        .environment(\.colorScheme, .dark)
    }

    // MARK: - Parts

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("WEEK OF \(Swap.shortDayLabel(summary.weekStart).uppercased())")
                .font(.system(size: 13, weight: .semibold)).tracking(1.4)
                .foregroundStyle(.white.opacity(0.55))
            Text(summary.isDeload ? "Deload week" : "Week wrapped")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
        }
    }

    private var figures: some View {
        HStack(alignment: .top, spacing: 20) {
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
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundStyle(tint)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text(label)
                .font(.system(size: 11, weight: .semibold)).tracking(1.2)
                .foregroundStyle(.white.opacity(0.5))
            if let delta, delta != 0 {
                Text("\(delta > 0 ? "+" : "−")\(OnyxFormat.volume(abs(delta)))")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(delta > 0 ? Color.onyx.good : .white.opacity(0.5))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func topSet(_ movement: WeeklyWrap.Movement) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("HEAVIEST SET")
                .font(.system(size: 11, weight: .semibold)).tracking(1.2)
                .foregroundStyle(.white.opacity(0.5))
            Text(movement.name)
                .font(.system(size: 22, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text("\(OnyxFormat.kg(movement.weightKg)) kg × \(jsIntegerString(movement.reps))")
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16).fill(.white.opacity(0.07)))
    }

    /// Five rows at most. A share card that lists eleven movements is a
    /// spreadsheet nobody reads at thumbnail size, and the ones that moved most
    /// are the ones worth the space — `movements(_:)` already sorts by
    /// magnitude.
    @ViewBuilder
    private var movements: some View {
        let rows = Array((summary.progressions + summary.deloaded + summary.regressions).prefix(5))
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(rows) { movement in
                    let verdict = WeeklyWrap.verdict(movement, isDeload: summary.isDeload)
                    HStack(spacing: 10) {
                        Text(movement.name)
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                            .foregroundStyle(.white.opacity(0.85))
                            .lineLimit(1).minimumScaleFactor(0.75)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let change = movement.change {
                            Text("\(change > 0 ? "+" : "−")\(jsIntegerString(jsRound(abs(change) * 100)))%")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
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
        VStack(alignment: .leading, spacing: 10) {
            if showBodyweight, let kg = summary.bodyweightKg {
                HStack(spacing: 6) {
                    Text("\(OnyxFormat.kg(kg)) kg")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white.opacity(0.85))
                    if let delta = summary.bodyweightDeltaKg, delta != 0 {
                        Text("\(delta > 0 ? "+" : "−")\(OnyxFormat.kg(abs(delta))) kg")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
            }
            HStack(spacing: 8) {
                OnyxMark(size: 18, opacity: 0.5)
                Text(program.label.isEmpty ? "Onyx" : program.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.45))
            }
        }
    }
}
