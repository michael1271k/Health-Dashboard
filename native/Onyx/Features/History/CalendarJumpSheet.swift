import SwiftUI
import OnyxUI
import OnyxCore

/// Jump to a date (§5.9).
///
/// ── WHY A GRID AND NOT A `DatePicker` ───────────────────────────────────────
/// `DatePicker(.graphical)` is the system's month grid and would be the right
/// answer if the only question were "which day". It is not: a day in this app
/// is worth opening when something happened on it, and the picker cannot draw
/// that. Every cell here carries the split's own colour when a session was
/// logged, so finding "the leg day two weeks ago" is a scan rather than a
/// binary search through empty screens.
///
/// It reuses the capsules the list already built — no second read, and the dots
/// cannot disagree with the strips behind the sheet.
struct CalendarJumpSheet: View {
    let capsules: [HistoryWeeks.Capsule]
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollViewReader { scroller in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: OnyxSpace.xl, pinnedViews: .sectionHeaders) {
                        ForEach(months) { month in
                            Section {
                                MonthGrid(month: month, onPick: onPick)
                            } header: {
                                Text(month.title)
                                    .onyxType(.display)
                                    .foregroundStyle(Color.onyx.textPrimary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, OnyxSpace.xs)
                                    .background(.bar)
                            }
                            .id(month.id)
                        }
                    }
                    .padding(.horizontal, OnyxSpace.l)
                    .padding(.bottom, OnyxSpace.xl)
                }
                .onAppear {
                    // Newest month, not the oldest: the reason to open this is
                    // almost always "last month", and starting in March 2026
                    // means a long scroll to reach it every time.
                    if let last = months.last { scroller.scrollTo(last.id, anchor: .top) }
                }
            }
            .onyxScreen(.train)
            .navigationTitle("Jump to")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
    }

    // MARK: - Months

    struct Month: Identifiable {
        /// `2026-09`.
        let id: String
        let title: String
        /// The leading blanks before the 1st, so the columns line up.
        let leading: Int
        let cells: [HistoryWeeks.DayCell]
    }

    /// Oldest first — the scroll starts at the bottom.
    private var months: [Month] {
        let cells = capsules.flatMap(\.cells).sorted { $0.date < $1.date }
        var order: [String] = []
        var byMonth: [String: [HistoryWeeks.DayCell]] = [:]
        for cell in cells {
            let key = String(cell.date.prefix(7))
            if byMonth[key] == nil { order.append(key) }
            byMonth[key, default: []].append(cell)
        }
        return order.compactMap { key in
            guard let days = byMonth[key], let first = days.first else { return nil }
            let title = LogicalDay.date(fromISO: key + "-01")
                .map { $0.formatted(.dateTime.month(.wide).year()) } ?? key
            // Grids here are always Sunday-first, whatever the week-start
            // setting is: this is a calendar, not a training week, and a month
            // grid whose columns move with a settings toggle is a month grid
            // nobody can read twice the same way.
            let weekday = ISODate.weekday(first.date) ?? 0
            // The first cell of the month is not necessarily the 1st — history
            // starts mid-month — so the offset is that day's own column.
            let dayOfMonth = Int(first.date.suffix(2)) ?? 1
            let leading = ((weekday - (dayOfMonth - 1)) % 7 + 7) % 7
            return Month(id: key, title: title, leading: leading, cells: days)
        }
    }
}

private struct MonthGrid: View {
    let month: CalendarJumpSheet.Month
    let onPick: (String) -> Void

    private static let columns = Array(
        repeating: GridItem(.flexible(), spacing: OnyxSpace.xs), count: 7
    )

    var body: some View {
        LazyVGrid(columns: Self.columns, spacing: OnyxSpace.xs) {
            ForEach(0..<month.leading, id: \.self) { _ in Color.clear.frame(height: 40) }
            ForEach(month.cells) { cell in
                Button { onPick(cell.date) } label: {
                    VStack(spacing: 2) {
                        Text(String(Int(cell.date.suffix(2)) ?? 0))
                            .onyxType(.caption)
                            .onyxNumeral()
                            .foregroundStyle(cell.isFuture ? Color.onyx.textTertiary : Color.onyx.textPrimary)
                        Circle()
                            .fill(cell.isLogged ? Color.onyx.day(cell.dayKey) : Color.clear)
                            .frame(width: 6, height: 6)
                    }
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .contentShape(.rect)
                }
                .buttonStyle(OnyxPressStyle())
                .accessibilityLabel(SessionRow.date(cell.date))
                .accessibilityValue(cell.isLogged ? "Trained" : (cell.isRest ? "Rest" : "Nothing logged"))
            }
        }
    }
}
