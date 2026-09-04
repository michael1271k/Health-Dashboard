import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// The Pulse tab root — one date's recovery, vitals and body.
///
/// ── WHAT WAVE 2.9 CHANGED ───────────────────────────────────────────────────
/// This was a `ScrollView` of six equal boxes: Sleep, Fatigue, Soreness, Stack,
/// Scale, Schedule — every one of them a bordered card with a caption header,
/// every one the same size whether it held one number or twenty-seven. That is
/// the web app's shape, and §3.6 names it exactly ("every list is a `List`, not
/// a `ScrollView` of cards").
///
/// What it is now: two tiles that genuinely need to be tiles because they draw
/// a GAUGE (the sleep arc, the body), a real `List` section of eight vitals at
/// 44 pt, and three rows — fatigue, scale, stack — that open sheets. The
/// Schedule tile is gone (swap moved to the Workout tab's session card, where
/// the thing you are swapping actually lives) and so is Cardio (§5.2 item 5).
struct PulseTabView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied only by previews and the screenshot harness.
    var seeded: DayModel?
    /// Harness only: which section to open scrolled to. Half this screen is
    /// below the fold and a single shot cannot reach it.
    var startAtRows = false

    @State private var resolved: DayModel?

    init() {}

    init(seeded: DayModel, startAtRows: Bool = false) {
        self.seeded = seeded
        self.startAtRows = startAtRows
    }

    var body: some View {
        Group {
            if let resolved {
                DayScreen(model: resolved, startAtRows: startAtRows)
            } else {
                ProgressView().controlSize(.large)
            }
        }
        .task {
            if resolved == nil {
                resolved = seeded ?? DayModel(database: environment.database, userId: environment.userIdString)
            }
            await resolved?.observe()
        }
    }
}

/// One date, laid out. Named for the date rather than the tab because History
/// pushes this same screen for a past day (§5.9).
struct DayScreen: View {
    @Environment(\.scenePhase) private var scenePhase
    let model: DayModel
    /// Harness only — see `PulseTabView.startAtRows`.
    var startAtRows = false

    @State private var showCalendar = false
    @State private var ratingFatigue = false
    @State private var entering = false
    @State private var showStack = false

    var body: some View {
        ScrollViewReader { scroller in list(scroller: scroller) }
    }

    private func list(scroller: ScrollViewProxy) -> some View {
        List {
            if let failure = model.failure {
                Label(failure, systemImage: "exclamationmark.triangle.fill")
                    .helixType(.caption)
                    .foregroundStyle(Color.helix.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(HelixSpace.m)
                    .helixGlass(.tile)
                    .plainRow()
            }

            NowStripPulse(model: model, date: title).plainRow()
            SleepTile(model: model).plainRow()

            Section {
                VitalRows(model: model)
            } header: {
                HelixSectionHeader("Vitals", .body)
            }

            Section {
                FatigueSummaryRow(model: model) { ratingFatigue = true }
            }
            .id(Self.rowsAnchor)

            DomsTile(model: model).plainRow()

            Section {
                ScaleRow(model: model) { entering = true }
                StackRow(model: model) { showStack = true }
            }
        }
        .listStyle(.plain)
        .listSectionSpacing(HelixSpace.l)
        .scrollContentBackground(.hidden)
        .helixScreen(.body)
        .navigationTitle("Pulse")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // The date walks on the LEADING side and the doors sit trailing:
            // four glyphs crowded into one group left "Pulse" with no room for
            // its own title, and a chevron beside a chart icon reads as a
            // disclosure rather than as yesterday.
            ToolbarItemGroup(placement: .topBarLeading) {
                Button { model.step(-1) } label: {
                    Image(systemName: "chevron.left").frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Previous day")

                Button { model.step(1) } label: {
                    Image(systemName: "chevron.right").frame(minWidth: 44, minHeight: 44)
                }
                .disabled(model.isToday)
                .accessibilityLabel("Next day")
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showCalendar = true } label: {
                    Image(systemName: "calendar").frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Choose a day")

                NavigationLink {
                    BodyTrendsView()
                } label: {
                    Image(systemName: "chart.xyaxis.line").frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Body trends")
            }
        }
        .tint(Color.helix.accent(.body))
        .sheet(isPresented: $showCalendar) {
            DaySheet("Choose a day", domain: .body) {
                DatePicker("Day", selection: selectedDate, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .padding(HelixSpace.s)
            }
        }
        .sheet(isPresented: $ratingFatigue) { FatigueSheet(model: model) }
        .sheet(isPresented: $entering) { InBodyEntryView(model: model) }
        .sheet(isPresented: $showStack) { StackSheet(model: model) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                model.refreshToday()
                model.loadWindow()
            }
        }
        .task {
            guard startAtRows else { return }
            // The same 400 ms the ledger shot needs (Wave 2.8): a `List` picks
            // its anchor at first layout, which happens while it is still
            // empty, so the scroll has to wait for the rows to exist.
            try? await Task.sleep(for: .milliseconds(400))
            scroller.scrollTo(Self.rowsAnchor, anchor: .top)
        }
    }

    /// The anchor the harness scrolls to: the fatigue row, which puts the three
    /// rows and the body on one screen. The vitals above it are `MetricRow`,
    /// the same component the Today sheet already photographs.
    private static let rowsAnchor = "pulse.rows"


    /// "Thu 3 Sept" — a date, formatted; never the ISO string. It rides in the
    /// Now strip rather than the nav bar: the tab is called Pulse everywhere
    /// else on the device, and a title that changes as you step through the
    /// week is a title you cannot navigate by.
    private var title: String {
        guard let date = LogicalDay.date(fromISO: model.date) else { return model.date }
        return model.isToday
            ? "Today · \(date.formatted(.dateTime.day().month(.abbreviated)))"
            : date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    private var selectedDate: Binding<Date> {
        Binding(
            get: { LogicalDay.date(fromISO: model.date) ?? Date() },
            set: { model.select(LogicalDay.iso($0)) }
        )
    }
}

// MARK: - Now strip

/// Score, battery and the day's fuel in one line.
///
/// ── WHY THE MACROS ARE NOT DRAWN HERE ───────────────────────────────────────
/// §5.7 is explicit: no macro gauges on Pulse. Three gauges of protein, carbs
/// and fat exist on the Nutrition tab and are the same three gauges — drawing
/// them twice is how a five-tab app becomes a one-tab app with four aliases.
/// What survives is the SENTENCE, which is the only form in which the day's
/// intake is context for a recovery screen rather than the subject of it.
private struct NowStripPulse: View {
    let model: DayModel
    /// Which day this is — the only place on the screen that says so.
    let date: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    private var battery: Int? { model.battery }

    /// 44 pt, and NO numeral inside it. A ring this size cannot hold a legible
    /// number at any type size — at AX5 the first attempt rendered "…" inside
    /// the ring — and the figure it would hold is the one beside it.
    private var ring: some View {
        ZStack {
            Circle().stroke(Color.helix.hairline, lineWidth: 4)
            Circle()
                .trim(from: 0, to: Double(battery ?? 0) / 100)
                .stroke(Color.helix.battery(battery), style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : HelixMotion.counter, value: battery)
        }
        .frame(width: 44, height: 44)
        .accessibilityHidden(true)
    }

    /// A numeral over its name. Two of these — the day's score and the battery
    /// — because they answer different questions and the ring is a shape, not a
    /// reading you can put a decimal on.
    private func reading(_ value: Int?, _ label: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value.map { "\($0)" } ?? "—")
                .helixHero().helixNumeral()
                .contentTransition(.numericText())
                .foregroundStyle(tint)
                .lineLimit(1)
            Text(label).helixMicro()
        }
    }

    private var scoreReading: some View {
        reading(model.score, "SCORE", tint: Color.helix.textPrimary)
    }

    private var batteryReading: some View {
        reading(battery, "BATTERY", tint: Color.helix.battery(battery))
    }

    @ViewBuilder
    private var fuel: some View {
        Text(model.fuelLine ?? "Nothing logged yet")
            .helixType(.caption).helixNumeral()
            .foregroundStyle(model.fuelLine == nil ? Color.helix.textTertiary : Color.helix.textSecondary)
            // At AX5 the sentence is six words a line; capping it at two cost
            // the water figure to an ellipsis. On one line of shipping type two
            // is the whole string.
            .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
            .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
            .fixedSize(horizontal: false, vertical: true)
    }

    var body: some View {
        Group {
            // At AX5 two numerals, a ring and a sentence cannot share a line —
            // the fuel line broke into five and pushed the ring off the tile.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: HelixSpace.s) {
                    Text(date).helixMicro()
                    HStack(spacing: HelixSpace.m) { ring; scoreReading; Spacer(minLength: 0) }
                    batteryReading
                    fuel
                }
            } else {
                VStack(alignment: .leading, spacing: HelixSpace.xs) {
                    Text(date).helixMicro()
                    HStack(spacing: HelixSpace.m) {
                        ring
                        scoreReading
                        batteryReading
                        Spacer(minLength: HelixSpace.s)
                        fuel
                    }
                }
            }
        }
        .padding(HelixSpace.m)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
        .helixGlass(.tile)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(date). Score \(model.score.map { "\($0)" } ?? "not scored"), battery \(battery.map { "\($0) percent" } ?? "unknown"). \(model.fuelLine ?? "nothing logged")"
        )
    }
}

// MARK: - Shared chrome

/// One tile: a caption header in the domain's accent, then content.
struct DayTile<Content: View, Trailing: View>: View {
    let title: String
    let domain: HelixDomain
    @ViewBuilder var content: () -> Content
    @ViewBuilder var trailing: () -> Trailing

    init(_ title: String, _ domain: HelixDomain,
         @ViewBuilder content: @escaping () -> Content,
         @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.title = title
        self.domain = domain
        self.content = content
        self.trailing = trailing
    }

    var body: some View {
        VStack(alignment: .leading, spacing: HelixSpace.m) {
            // At AX5 the title and its trailing word are each half a line wide
            // and ran into each other ("Soreness FRONT" with no gap).
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) {
                    HelixSectionHeader(title, domain)
                    Spacer(minLength: HelixSpace.s)
                    trailing()
                }
                VStack(alignment: .leading, spacing: HelixSpace.xs) {
                    HelixSectionHeader(title, domain)
                    trailing()
                }
            }
            content()
        }
        .padding(HelixSpace.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
        .foregroundStyle(Color.helix.textPrimary)
    }
}

/// The 44 pt row this tab is mostly made of: a symbol, a name, what it says
/// today, and the thing you tap.
///
/// Three screens' worth of content — fatigue, the scale, the stack — used to be
/// three tiles of chips, seven metrics and a nested list. Each is now one row
/// that states its answer and opens a sheet, which is what a `List` row on iOS
/// has always been.
struct PulseRow<Trailing: View>: View {
    let symbol: String
    let title: String
    let detail: String
    var tint: Color = Color.helix.accent(.body)
    /// Spoken instead of `detail` when the words on screen are shorthand.
    var spoken: String?
    let action: () -> Void
    @ViewBuilder var trailing: () -> Trailing

    @Environment(\.dynamicTypeSize) private var typeSize

    init(symbol: String, title: String, detail: String,
         tint: Color = Color.helix.accent(.body), spoken: String? = nil,
         action: @escaping () -> Void,
         @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.symbol = symbol
        self.title = title
        self.detail = detail
        self.tint = tint
        self.spoken = spoken
        self.action = action
        self.trailing = trailing
    }

    var body: some View {
        Button(action: action) {
            Group {
                if typeSize.isAccessibilitySize { stacked } else { oneLine }
            }
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .helixPress(scale: 0.99)
        .listRowInsets(EdgeInsets(top: HelixSpace.s, leading: HelixSpace.l, bottom: HelixSpace.s, trailing: HelixSpace.l))
        .listRowBackground(Color.clear)
        .listRowSeparatorTint(Color.helix.hairline)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(spoken ?? detail)")
        .accessibilityAddTraits(.isButton)
    }

    private var oneLine: some View {
        HStack(spacing: HelixSpace.m) {
            glyph
            Text(title)
                .helixType(.body)
                .foregroundStyle(Color.helix.textPrimary)
            Spacer(minLength: HelixSpace.s)
            Text(detail)
                .helixType(.caption).helixNumeral()
                .foregroundStyle(Color.helix.textSecondary)
                .lineLimit(1)
            trailing()
            chevron
        }
    }

    /// Three lines rather than two. At AX5 the second line held the detail AND
    /// the trailing content, and the fatigue row's word pushed its own dots off
    /// the right edge — a row that cannot show its own state.
    private var stacked: some View {
        VStack(alignment: .leading, spacing: HelixSpace.xs) {
            HStack(spacing: HelixSpace.s) {
                Text(title).helixType(.body).foregroundStyle(Color.helix.textPrimary)
                Spacer(minLength: HelixSpace.s)
                chevron
            }
            Text(detail)
                .helixType(.caption).helixNumeral()
                .foregroundStyle(Color.helix.textSecondary)
            HStack(spacing: HelixSpace.s) {
                trailing()
                Spacer(minLength: 0)
            }
        }
    }

    /// Decoration, and the first thing to go at the accessibility sizes: the
    /// glyph tracks the text scale, and a 50 pt pill beside a 50 pt word is a
    /// row with no room for either.
    @ViewBuilder
    private var glyph: some View {
        if !typeSize.isAccessibilitySize {
            Image(systemName: symbol)
                .foregroundStyle(tint)
                .frame(width: 24)
                .accessibilityHidden(true)
        }
    }

    private var chevron: some View {
        Image(systemName: "chevron.right")
            .helixType(.caption).fontWeight(.bold)
            .foregroundStyle(Color.helix.textTertiary)
            .accessibilityHidden(true)
    }
}

/// A presented sheet: inline title, Done, the domain's ground, medium/large.
///
/// A form sheet passes `primary` — a (title, enabled, action) triple — and gets
/// Cancel on the left and that action on the right; a sheet whose every tap
/// already saved (soreness, the calendar) passes nothing and gets Done.
struct DaySheet<Content: View>: View {
    typealias Primary = (title: String, enabled: Bool, action: () -> Void)

    let title: String
    let domain: HelixDomain
    var glass = true
    var primary: Primary?
    @ViewBuilder var content: () -> Content
    @Environment(\.dismiss) private var dismiss

    init(_ title: String, domain: HelixDomain, glass: Bool = true, primary: Primary? = nil,
         @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.domain = domain
        self.glass = glass
        self.primary = primary
        self.content = content
    }

    var body: some View {
        NavigationStack {
            Group {
                if glass {
                    ScrollView {
                        content()
                            .padding(HelixSpace.l)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .helixGlass(.sheet)
                            .padding(HelixSpace.l)
                    }
                    .helixScreen(domain)
                } else {
                    // A `Form` draws its own rows; it takes the form ground.
                    content().helixFormBackground(domain)
                }
            }
            .foregroundStyle(Color.helix.textPrimary)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let primary {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(primary.title, action: primary.action)
                            .fontWeight(.semibold)
                            .disabled(!primary.enabled)
                    }
                } else {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
        }
        .tint(domain.accent)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Color.helix.base)
        .preferredColorScheme(.dark)
    }
}

/// A figure or an em dash. `nil` is never zero, anywhere in this app.
enum DayFormat {
    static func number(_ value: Double?, fraction: Int = 1, unit: String? = nil) -> String {
        guard let value, value.isFinite else { return "—" }
        let text = value.formatted(.number.precision(.fractionLength(0...fraction)).grouping(.never))
        return unit.map { "\(text) \($0)" } ?? text
    }

    static func minutes(_ total: Int?) -> String {
        guard let total, total > 0 else { return "—" }
        return total >= 60 ? "\(total / 60)h \(total % 60)m" : "\(total)m"
    }

    /// The device's minute of the day, for the slot clock.
    static var nowMinutes: Int {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: Date())
        return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    }
}

#if DEBUG
#Preview("Pulse") {
    NavigationStack { PulsePreviews.view("day") }
}
#endif
