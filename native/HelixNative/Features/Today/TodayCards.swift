import SwiftUI
import HelixCore
import HelixData
import HelixUI

// MARK: - Readiness orb
//
// ── ONE NUMBER, ONE SCALE ────────────────────────────────────────────────────
// The web orb once drew the recovery score in the core and the battery on the
// rim with two different colour scales, which produced "98 inside a red wheel"
// at 23:00. Here there is exactly one number — the day battery — and its colour
// comes from the same `Color.helix.battery` the widget ring uses, so the orb,
// the tiles and the Lock Screen can never disagree about what 42 % means. The
// readiness verdict sits under it as words, not as a second gauge.

struct ReadinessOrbView: View {
    let battery: Int?
    let readiness: ReadinessResult?
    let onOpen: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var color: Color { Color.helix.battery(battery) }

    private var ring: some View {
        ZStack {
            Circle().stroke(Color.helix.hairline, lineWidth: 10)
            Circle()
                .trim(from: 0, to: Double(battery ?? 0) / 100)
                .stroke(color, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: color.opacity(0.45), radius: 10)
                .animation(reduceMotion ? nil : HelixMotion.counter, value: battery)
            VStack(spacing: 0) {
                Text(battery.map { "\($0)" } ?? "—")
                    .helixHero()
                    .foregroundStyle(Color.helix.textPrimary)
                Text("BATTERY")
                    .helixType(.micro)
                    .foregroundStyle(Color.helix.textSecondary)
            }
        }
        .frame(width: 104, height: 104)
        // A fixed-diameter ring around type that scales: at AX5 the numeral
        // alone is taller than the ring. The whole thing is decorative — the
        // reading is spoken by the label on the row beside it — so the type is
        // clamped rather than the ring being grown into a screen of its own.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityHidden(true)
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(readiness?.label ?? "Readiness")
                .font(.title3.weight(.semibold))
                .foregroundStyle(readiness.map(ReadinessColor.of) ?? Color.helix.textPrimary)
            Text(readiness?.reason ?? "No score yet — sync a night of sleep and the day fills in.")
                .font(.footnote)
                .foregroundStyle(Color.helix.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Button(action: onOpen) {
            // Side by side, until the type grows past the point where the words
            // wrap one per line beside the ring — then the ring sits above them.
            Group {
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: HelixSpace.m) { ring; words }
                } else {
                    HStack(spacing: HelixSpace.l) { ring; words; Spacer(minLength: 0) }
                }
            }
            .padding(HelixSpace.l)
            .frame(maxWidth: .infinity, alignment: .leading)
            .helixGlass(.tile)
        }
        .buttonStyle(HelixPressStyle())
        .accessibilityLabel("Battery \(battery.map { "\($0) percent" } ?? "unknown"). \(readiness?.label ?? "")")
    }
}

/// The readiness verdict's colour, from tokens rather than the hex the result
/// carries — the hex is the web's and the fixture's, not a view's.
enum ReadinessColor {
    static func of(_ r: ReadinessResult) -> Color {
        switch r.level {
        case .trainHard: Color.helix.good
        case .trainLight: HelixDomain.fuel.accent
        case .rest: Color.helix.textSecondary
        }
    }
}

// MARK: - Weekly summary CTA

struct WeeklySummaryCTA: View {
    let weekStart: String
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 12) {
                Image(systemName: "trophy.fill")
                    .helixType(.body)
                    // A glyph in a fixed disc: the row's own copy scales, this
                    // does not, or the disc stops being a disc.
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundStyle(Color.helix.record)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.helix.record.opacity(0.14)))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Week \(Int(Week.number(ofWeekStart: weekStart))) is complete")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.helix.textPrimary)
                    Text("Every session logged. Review the week.")
                        .font(.footnote)
                        .foregroundStyle(Color.helix.textSecondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Color.helix.textTertiary)
            }
            .padding(HelixSpace.m)
            .helixGlass(.tile)
        }
        .buttonStyle(HelixPressStyle())
    }
}

// MARK: - Insight coach

struct InsightCoachView: View {
    let readiness: ReadinessResult?
    let insights: [Insight]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Insight Coach", systemImage: "brain.head.profile")
                .font(.footnote.weight(.bold)).tracking(0.6)
                .foregroundStyle(Color.helix.textSecondary)
                .textCase(.uppercase)
            if let readiness {
                VStack(alignment: .leading, spacing: 2) {
                    Text(readiness.label).font(.title2.weight(.bold)).foregroundStyle(ReadinessColor.of(readiness))
                    Text(readiness.reason).font(.footnote).foregroundStyle(Color.helix.textSecondary)
                }
            }
            if insights.isEmpty {
                Text("Not enough history yet — keep syncing and correlations across sleep, recovery, nutrition and training surface here.")
                    .font(.footnote).foregroundStyle(Color.helix.textSecondary)
            } else {
                ForEach(insights, id: \.id) { insight in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: symbol(insight.tone))
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(tint(insight.tone))
                            .frame(width: 16)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(insight.headline).font(.subheadline.weight(.semibold)).foregroundStyle(Color.helix.textPrimary)
                            Text(insight.detail).font(.footnote).foregroundStyle(Color.helix.textSecondary)
                        }
                    }
                }
            }
        }
        .padding(HelixSpace.l)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
    }

    private func symbol(_ tone: InsightTone) -> String {
        switch tone {
        case .positive: "arrow.up.right"
        case .caution: "exclamationmark.triangle.fill"
        case .neutral: "minus"
        }
    }

    private func tint(_ tone: InsightTone) -> Color {
        switch tone {
        case .positive: Color.helix.good
        case .caution: HelixDomain.fuel.accent
        case .neutral: Color.helix.textTertiary
        }
    }
}

// MARK: - Week so far

struct WeekSoFarView: View {
    let week: WeekSoFarSummary

    var body: some View {
        HStack(spacing: HelixSpace.m) {
            ring
            VStack(alignment: .leading, spacing: 3) {
                Text("Week \(week.weekNumber) · day \(week.dayOfWeek) of 7")
                    .font(.footnote.weight(.bold)).tracking(0.4)
                    .foregroundStyle(Color.helix.textSecondary)
                    .textCase(.uppercase)
                if let change = week.change {
                    HStack(spacing: 6) {
                        Image(systemName: change.direction == .up ? "arrow.up.right" : "arrow.down.right")
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(change.good ? Color.helix.good : Color.helix.danger)
                        Text(change.label).foregroundStyle(Color.helix.textPrimary)
                        Text(change.text)
                            .fontDesign(.rounded).monospacedDigit()
                            .foregroundStyle(change.good ? Color.helix.good : Color.helix.danger)
                        Text("vs last week").foregroundStyle(Color.helix.textTertiary)
                    }
                    .font(.subheadline.weight(.semibold))
                } else {
                    Text("Level with last week so far.").font(.subheadline).foregroundStyle(Color.helix.textSecondary)
                }
                Text("\(Format.volume(week.current.volumeKg)) lifted · \(Format.sleep(week.current.sleepMin)) sleep")
                    .font(.footnote).foregroundStyle(Color.helix.textSecondary)
            }
            Spacer(minLength: 0)
        }
        .padding(HelixSpace.l)
        .helixGlass(.tile)
    }

    private var ring: some View {
        let target = max(1, week.sessionTarget)
        let done = week.current.sessions
        return ZStack {
            Circle().stroke(Color.helix.hairline, lineWidth: 6)
            Circle()
                .trim(from: 0, to: min(1, Double(done) / Double(target)))
                .stroke(HelixDomain.train.accent, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(done)/\(target)")
                .helixType(.caption).fontWeight(.bold).helixNumeral()
                .foregroundStyle(Color.helix.textPrimary)
        }
        .frame(width: 52, height: 52)
        // A fixed-diameter ring around type that scales: at AX5 the numeral
        // alone is taller than the ring. The whole thing is decorative — the
        // reading is spoken by the label on the row beside it — so the type is
        // clamped rather than the ring being grown into a screen of its own.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityLabel("\(done) of \(target) sessions")
    }
}
