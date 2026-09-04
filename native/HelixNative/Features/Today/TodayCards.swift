import SwiftUI
import HelixCore
import HelixData
import HelixUI

// MARK: - Now strip
//
// ── ONE ROW, THREE FACTS, NO SECOND OPINION ──────────────────────────────────
// This replaces a 104 pt orb that drew the battery as a ring AND as a numeral
// AND spelled the readiness verdict out beside it — three renderings of two
// numbers, in the most valuable 160 pt on the screen, above a coach card that
// then said the verdict again in the same words.
//
// What survives is what could not be read anywhere else on this screen: the
// day's score as a numeral, the battery as a ring (different question, so a
// different shape), and what today's training actually is. The verdict keeps
// its one home in the coach card below. The sync caption rides here because it
// is the answer to "is what I am looking at current", which is a question about
// this whole screen and not about any one tile in it.

struct NowStrip: View {
    let score: Int?
    let battery: Int?
    let workout: HelixSnapshot.Workout?
    let status: SyncStatus
    /// Tap goes to Pulse — the tab that owns every number in this row.
    let onOpen: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    private var batteryColor: Color { Color.helix.battery(battery) }

    /// 36 pt, no numeral inside it. A ring this size cannot hold a legible
    /// number at any type size, and the one it would hold is already the
    /// numeral beside it.
    private var ring: some View {
        ZStack {
            Circle().stroke(Color.helix.hairline, lineWidth: 4)
            Circle()
                .trim(from: 0, to: Double(battery ?? 0) / 100)
                .stroke(batteryColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : HelixMotion.counter, value: battery)
        }
        .frame(width: 36, height: 36)
        .accessibilityHidden(true)
    }

    private var reading: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(score.map { "\($0)" } ?? "—")
                .helixDisplay().helixNumeral()
                .foregroundStyle(Color.helix.textPrimary)
            Text("SCORE")
                .helixMicro()
        }
    }

    /// Today's training, in the fewest words that are still true. A rest day is
    /// a real answer and gets the same chip rather than an empty space.
    private var sessionChip: some View {
        let label = workout.map { $0.isRestDay ? "Rest day" : $0.label } ?? "No plan"
        let tint = workout?.isRestDay == false ? HelixDomain.train.accent : Color.helix.textSecondary
        return HStack(spacing: HelixSpace.xs) {
            if workout?.logged == true {
                Image(systemName: "checkmark").helixType(.caption).fontWeight(.bold)
            }
            Text(label).helixType(.caption).fontWeight(.semibold)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, HelixSpace.s)
        .padding(.vertical, HelixSpace.xs)
        .background(Capsule().fill(tint.opacity(0.14)))
    }

    var body: some View {
        Button(action: onOpen) {
            Group {
                if typeSize.isAccessibilitySize {
                    // At accessibility sizes the chip and the caption cannot
                    // share a line with a numeral. Stacking is the only honest
                    // answer; truncating the split name is not.
                    VStack(alignment: .leading, spacing: HelixSpace.s) {
                        HStack(spacing: HelixSpace.m) { ring; reading; Spacer(minLength: 0) }
                        sessionChip
                        caption
                    }
                } else {
                    HStack(spacing: HelixSpace.m) {
                        ring
                        reading
                        Spacer(minLength: 0)
                        VStack(alignment: .trailing, spacing: HelixSpace.xs) {
                            sessionChip
                            caption
                        }
                    }
                }
            }
            .padding(HelixSpace.m)
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
            .helixGlass(.tile)
        }
        .buttonStyle(HelixPressStyle())
        // An explicit label REPLACES the children, so the caption has to be
        // said here or it is said nowhere — and "Sync failed" is the one thing
        // on this screen a VoiceOver user cannot afford to miss (the hairline
        // is decorative and hidden).
        .accessibilityLabel("Score \(score.map { "\($0)" } ?? "unknown"), battery \(battery.map { "\($0) percent" } ?? "unknown"). \(workout.map { $0.isRestDay ? "Rest day" : $0.label } ?? ""). \(status.caption(at: .now) ?? "")")
        .accessibilityHint("Opens Pulse.")
    }

    /// A `TimelineView` around the one `Text` that ages, rather than a timer on
    /// the model: SwiftUI stops a timeline that is off screen or backgrounded,
    /// and the redraw is scoped to the caption instead of the whole card.
    @ViewBuilder
    private var caption: some View {
        // The `if` is OUTSIDE the timeline: a `TimelineView` whose body renders
        // nothing still occupies a slot in the stack, which is a 4 pt gap under
        // the chip on a device that has never synced.
        if status.lastSync != nil || status.phase != .idle {
            TimelineView(.periodic(from: status.lastSync ?? .now, by: 1)) { context in
                if let text = status.caption(at: context.date) {
                    // §3.3 reserves `micro` for LABELS; this is a reading.
                    Text(text)
                        .helixType(.caption)
                        .foregroundStyle(status.phase == .idle ? Color.helix.textTertiary : Color.helix.textSecondary)
                }
            }
        }
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
                        .helixType(.secondary).fontWeight(.semibold)
                        .foregroundStyle(Color.helix.textPrimary)
                    Text("Every session logged. Review the week.")
                        .helixType(.caption)
                        .foregroundStyle(Color.helix.textSecondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").helixType(.caption).fontWeight(.semibold).foregroundStyle(Color.helix.textTertiary)
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
                .helixType(.micro)
                .foregroundStyle(Color.helix.textSecondary)
                .textCase(.uppercase)
            if let readiness {
                VStack(alignment: .leading, spacing: 2) {
                    Text(readiness.label).helixType(.display).fontWeight(.bold).foregroundStyle(ReadinessColor.of(readiness))
                    Text(readiness.reason).helixType(.caption).foregroundStyle(Color.helix.textSecondary)
                }
            }
            if insights.isEmpty {
                Text("Not enough history yet — keep syncing and correlations across sleep, recovery, nutrition and training surface here.")
                    .helixType(.caption).foregroundStyle(Color.helix.textSecondary)
            } else {
                ForEach(insights, id: \.id) { insight in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: symbol(insight.tone))
                            .helixType(.caption).fontWeight(.bold)
                            .foregroundStyle(tint(insight.tone))
                            .frame(width: 16)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(insight.headline).helixType(.secondary).fontWeight(.semibold).foregroundStyle(Color.helix.textPrimary)
                            Text(insight.detail).helixType(.caption).foregroundStyle(Color.helix.textSecondary)
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
                    .helixType(.micro)
                    .foregroundStyle(Color.helix.textSecondary)
                    .textCase(.uppercase)
                if let change = week.change {
                    HStack(spacing: 6) {
                        Image(systemName: change.direction == .up ? "arrow.up.right" : "arrow.down.right")
                            .helixType(.caption).fontWeight(.bold)
                            .foregroundStyle(change.good ? Color.helix.good : Color.helix.danger)
                        Text(change.label).foregroundStyle(Color.helix.textPrimary)
                        Text(change.text)
                            .fontDesign(.rounded).monospacedDigit()
                            .foregroundStyle(change.good ? Color.helix.good : Color.helix.danger)
                        Text("vs last week").foregroundStyle(Color.helix.textTertiary)
                    }
                    .helixType(.secondary).fontWeight(.semibold)
                } else {
                    Text("Level with last week so far.").helixType(.secondary).foregroundStyle(Color.helix.textSecondary)
                }
                Text("\(Format.volume(week.current.volumeKg)) lifted · \(Format.sleep(week.current.sleepMin)) sleep")
                    .helixType(.caption).foregroundStyle(Color.helix.textSecondary)
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
