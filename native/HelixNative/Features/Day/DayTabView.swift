import SwiftUI
import HelixUI
import HelixCore
import HelixData

/// The Body tab root — `/day/[date]`.
///
/// ── A DAY IS A COLUMN OF TILES, AND EVERY DRAWER IS A SHEET ─────────────────
/// The web page is a pager of bands with a home-rolled `Sheet` per section and a
/// union type naming which one is open. Here each concern is one glass tile on
/// the Tide ground, and anything that edits more than a tap's worth opens a
/// system `.sheet` — the InBody form, the soreness map, the swap chooser, the
/// cardio form, the calendar. The system sheet brings the drag-to-dismiss, the
/// detents and the keyboard avoidance the web version re-implemented.
///
/// Recovery tiles (sleep, fatigue, soreness) take the Lunar accent, the scale
/// and cardio take Tide, the stack takes Solar because it is nutrition, and the
/// schedule takes Ion. Four accents on one screen is the most the mandate
/// allows and each one says which domain the tile belongs to.
struct DayTabView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied only by previews and the screenshot harness.
    var seeded: DayModel?

    @State private var resolved: DayModel?

    init() {}

    init(seeded: DayModel) {
        self.seeded = seeded
    }

    var body: some View {
        Group {
            if let resolved {
                DayScreen(model: resolved)
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

private struct DayScreen: View {
    @Environment(\.scenePhase) private var scenePhase
    let model: DayModel

    @State private var showCalendar = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let failure = model.failure {
                    Label(failure, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Color.helix.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .helixGlass(.tile)
                        .accessibilityAddTraits(.isStaticText)
                }
                SleepTile(model: model)
                FatigueTile(model: model)
                DomsTile(model: model)
                StackTile(model: model)
                CardioTile(model: model)
                ScaleTile(model: model)
                SwapDayTile(model: model)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .helixScreen(.body)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { model.step(-1) } label: {
                    Image(systemName: "chevron.left").frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Previous day")

                Button { model.step(1) } label: {
                    Image(systemName: "chevron.right").frame(minWidth: 44, minHeight: 44)
                }
                .disabled(model.isToday)
                .accessibilityLabel("Next day")

                Button { showCalendar = true } label: {
                    Image(systemName: "calendar").frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("Choose a day")
            }
        }
        .tint(Color.helix.accent(.body))
        .sheet(isPresented: $showCalendar) {
            DaySheet("Choose a day", domain: .body) {
                DatePicker("Day", selection: selectedDate, in: ...Date(), displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .padding(8)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.refreshToday() }
        }
    }

    /// "Thu 3 Sept" — a date, formatted; never the ISO string.
    private var title: String {
        guard let date = LogicalDay.date(fromISO: model.date) else { return model.date }
        return date.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    private var selectedDate: Binding<Date> {
        Binding(
            get: { LogicalDay.date(fromISO: model.date) ?? Date() },
            set: { model.select(LogicalDay.iso($0)) }
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                HelixSectionHeader(title, domain)
                Spacer(minLength: 8)
                trailing()
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .helixGlass(.tile)
        .foregroundStyle(Color.helix.textPrimary)
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
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .helixGlass(.sheet)
                            .padding(16)
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

/// A label over a figure — the cell a scale reading or a bout metric sits in.
struct DayMetric: View {
    let label: String
    let value: String
    var detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).helixCaption()
            Text(value)
                .font(.title3.weight(.semibold))
                .helixNumeral()
            if let detail {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(Color.helix.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value == "—" ? "not recorded" : value)\(detail.map { ", \($0)" } ?? "")")
    }
}

#Preview("Day") {
    NavigationStack { DayPreviews.view("day") }
}
