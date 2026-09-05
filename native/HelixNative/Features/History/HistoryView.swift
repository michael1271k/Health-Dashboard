import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// History — the door from Today (§5.9, decision 1).
///
/// ── WHY THIS REPLACED TWO SCREENS ───────────────────────────────────────────
/// It replaces `SessionHistoryView`, a flat reverse-chronological list of every
/// session, and Pathfinder, a week-by-week table on the Settings tab. Both were
/// answering the same question badly. The flat list could not show a day you
/// MISSED — a day with no session has no row — and the block is judged on
/// exactly that: five sessions against a target of five. Pathfinder could, and
/// was buried two navigations deep inside settings, where nobody looks for last
/// week.
///
/// One door, one unit: a week. Capsule → days → day. Every number on every one
/// of those three levels comes from the same `WeekWindow`, so changing "Week
/// starts on" in Settings re-cuts the whole list rather than re-cutting the
/// list and leaving the labels behind.
struct HistoryView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied only by the screenshot harness.
    var seeded: [HistoryWeeks.Capsule]?

    @State private var capsules: [HistoryWeeks.Capsule]?
    @State private var segment: Segment = .weeks
    @State private var era: EraFilter = .all
    @State private var jumping = false
    @State private var jumpTo: JumpDate?

    enum Segment: String, CaseIterable, Identifiable {
        case weeks = "Weeks"
        case body = "Body"
        var id: Self { self }
    }

    /// The block has run under two programmes, and their numbers are not
    /// comparable — PPL was six days of higher-frequency lower-volume work.
    /// `Phases` already tags every week with the era it belongs to, so the
    /// filter is a read of that rather than a date the user has to remember.
    enum EraFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case helix = "Helix"
        case ppl = "PPL"
        var id: Self { self }

        func matches(_ capsule: HistoryWeeks.Capsule) -> Bool {
            switch self {
            case .all: true
            case .helix: capsule.era == .helix
            case .ppl: capsule.era == .ppl
            }
        }
    }

    /// `navigationDestination(item:)` needs an `Identifiable`, and a bare date
    /// string is not one.
    struct JumpDate: Identifiable, Hashable { let id: String }

    var body: some View {
        List {
            Section {
                Picker("View", selection: $segment) {
                    ForEach(Segment.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("History view")
            }
            .listRowBackground(Color.clear)
            .listRowInsets(.init(top: 0, leading: HelixSpace.l, bottom: HelixSpace.s, trailing: HelixSpace.l))

            switch segment {
            case .weeks: weeks
            case .body: bodySegment
            }
        }
        .listStyle(.plain)
        .listSectionSpacing(HelixSpace.m)
        .scrollContentBackground(.hidden)
        .helixScreen(.train)
        .tint(HelixDomain.train.accent)
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { jumping = true } label: {
                    Image(systemName: "calendar")
                }
                .accessibilityLabel("Jump to a date")
                .disabled(segment == .body)
            }
        }
        .sheet(isPresented: $jumping) {
            CalendarJumpSheet(capsules: capsules ?? []) { date in
                jumping = false
                jumpTo = JumpDate(id: date)
            }
        }
        .navigationDestination(item: $jumpTo) { jump in
            DayScreen(model: DayModel(
                database: environment.database, userId: environment.userIdString, date: jump.id
            ))
        }
        .overlay { emptyState }
        .task {
            guard capsules == nil else { return }
            if let seeded {
                capsules = seeded
                return
            }
            let database = environment.database
            capsules = await Task.detached(priority: .userInitiated) {
                HistoryWeeks.capsules(database: database)
            }.value
        }
    }

    // MARK: - Weeks

    @ViewBuilder
    private var weeks: some View {
        // The era filter scrolls WITH the list rather than pinning under the
        // nav bar: two stacked segmented controls in fixed chrome leave a
        // 96 pt band of controls above the first row, and at AX5 the second one
        // wraps into three lines of it.
        if (capsules?.count ?? 0) > 0, hasBothEras {
            Section {
                Picker("Era", selection: $era) {
                    ForEach(EraFilter.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Filter by programme")
            }
            .listRowBackground(Color.clear)
            .listRowInsets(.init(top: 0, leading: HelixSpace.l, bottom: HelixSpace.s, trailing: HelixSpace.l))
        }

        ForEach(filtered) { capsule in
            Section {
                NavigationLink {
                    WeekDaysView(window: capsule.window)
                } label: {
                    WeekCapsuleRow(capsule: capsule)
                }
                .listRowInsets(.init(top: HelixSpace.m, leading: HelixSpace.l,
                                     bottom: HelixSpace.m, trailing: HelixSpace.l))
            }
        }
    }

    /// The filter only appears when there is something to filter. One programme
    /// in the history means the control can only ever empty the list.
    private var hasBothEras: Bool {
        let eras = Set((capsules ?? []).compactMap(\.era))
        return eras.count > 1
    }

    private var filtered: [HistoryWeeks.Capsule] {
        (capsules ?? []).filter(era.matches)
    }

    // MARK: - Body

    @ViewBuilder
    private var bodySegment: some View {
        Section {
            BodyTrendsView(embedded: true)
                .frame(minHeight: 480)
        }
        .listRowBackground(Color.clear)
        .listRowInsets(.init(top: 0, leading: 0, bottom: 0, trailing: 0))
    }

    // MARK: - Empty

    @ViewBuilder
    private var emptyState: some View {
        if capsules == nil {
            ProgressView()
        } else if segment == .weeks, capsules?.isEmpty == true {
            ContentUnavailableView(
                "No history yet",
                systemImage: "calendar",
                description: Text("Finish a workout or step on the scale and the week lands here.")
            )
        } else if segment == .weeks, filtered.isEmpty {
            ContentUnavailableView(
                "No \(era.rawValue) weeks",
                systemImage: "line.3.horizontal.decrease.circle",
                description: Text("Nothing in the history was logged under that programme.")
            )
        }
    }
}

// MARK: - The capsule

/// `Week 7 · Cut W7 · 30 Aug – 5 Sep`, its numbers, and seven dots.
struct WeekCapsuleRow: View {
    let capsule: HistoryWeeks.Capsule

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: HelixSpace.s) {
            // ── WHY THE HEADER STACKS ───────────────────────────────────────
            // Three columns — "Week 7", the phase pill and "30 Aug – 5 Sep" —
            // share one line comfortably at every ordinary size and shatter at
            // AX5 into "We / ek / 7" beside a two-line pill that draws as an
            // ellipse. At accessibility sizes the same three run down the page,
            // which is the shape they were always going to take.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: HelixSpace.xs) {
                    title
                    phaseTag
                    range
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: HelixSpace.s) {
                    title
                    phaseTag
                    Spacer(minLength: HelixSpace.xs)
                    range
                }
            }

            DayStrip(cells: capsule.cells)

            Text(meta)
                .helixType(.caption)
                .helixNumeral()
                .foregroundStyle(Color.helix.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, HelixSpace.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(capsule.window.label), \(capsule.window.rangeLabel). \(meta)")
    }

    private var title: some View {
        Text(capsule.window.label)
            .helixType(.display)
            .foregroundStyle(Color.helix.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// One line, always. Wrapped over two, the `Capsule` behind it stops being
    /// a pill and becomes an ellipse the width of the longest word.
    @ViewBuilder
    private var phaseTag: some View {
        if let phase = capsule.phaseLabel {
            Text(phase)
                .helixType(.micro)
                .lineLimit(1)
                .foregroundStyle(Color.helix.textSecondary)
                .padding(.horizontal, HelixSpace.s)
                .padding(.vertical, 2)
                .background(Capsule().fill(HelixDomain.train.accent.opacity(0.16)))
        }
    }

    private var range: some View {
        Text(capsule.window.rangeLabel)
            .helixType(.caption)
            .foregroundStyle(Color.helix.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// Only what happened. A week with no sessions says so in one word instead
    /// of printing `0 sessions · 0 kg · 0 sets`, which reads as a bug.
    private var meta: String {
        guard capsule.sessions > 0 || capsule.weightDeltaKg != nil else { return "Nothing logged" }
        var parts: [String] = []
        if capsule.sessions > 0 {
            parts.append("\(capsule.sessions) session\(capsule.sessions == 1 ? "" : "s")")
            parts.append("\(Format.volume(capsule.tonnageKg)) kg")
            parts.append("\(capsule.sets) sets")
        }
        if capsule.prCount > 0 { parts.append("\(capsule.prCount) PR") }
        if let delta = capsule.weightDeltaKg {
            let sign = delta > 0 ? "+" : ""
            parts.append("\(sign)\(delta.formatted(.number.precision(.fractionLength(1)))) kg")
        }
        return parts.joined(separator: " · ")
    }
}

/// Seven dots — logged in the split's own colour, planned-and-missed as a
/// hollow ring, rest as a tertiary speck.
///
/// The ring is the point of the whole screen: a missed day has no session row
/// anywhere in the database, so the only way to draw it is to ask the SCHEDULE
/// what the day was for and find nothing against it.
struct DayStrip: View {
    let cells: [HistoryWeeks.DayCell]

    var body: some View {
        HStack(spacing: HelixSpace.xs) {
            ForEach(cells) { cell in
                VStack(spacing: 3) {
                    Text(cell.initial)
                        .helixType(.micro)
                        .foregroundStyle(Color.helix.textTertiary)
                    dot(cell)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func dot(_ cell: HistoryWeeks.DayCell) -> some View {
        if cell.isLogged {
            Circle()
                .fill(Color.helix.day(cell.dayKey))
                .frame(width: 10, height: 10)
        } else if cell.isRest {
            Circle()
                .fill(Color.helix.textTertiary.opacity(0.5))
                .frame(width: 4, height: 4)
                .frame(width: 10, height: 10)
        } else {
            Circle()
                .strokeBorder(
                    Color.helix.day(cell.dayKey).opacity(cell.isFuture ? 0.35 : 0.8),
                    lineWidth: 1.5
                )
                .frame(width: 10, height: 10)
        }
    }
}

#if DEBUG
#Preview("History") { HistoryPreviews.view("history") }
#endif
