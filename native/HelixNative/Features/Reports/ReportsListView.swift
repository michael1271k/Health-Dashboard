import SwiftUI
import HelixCore
import HelixData

/// Every saved report, newest week first.
struct ReportsListView: View {
    @Environment(AppEnvironment.self) private var environment

    /// Supplied by the screenshot harness.
    var seeded: [ReportRow]?

    @State private var reports: [ReportRow] = []

    var body: some View {
        List {
            ForEach(reports, id: \.id) { report in
                NavigationLink {
                    ReportReaderView(report: report, seededBody: seeded == nil ? nil : sampleBody)
                } label: {
                    row(report)
                }
            }
        }
        .listRowBackground(Rectangle().fill(.ultraThinMaterial))
        .scrollContentBackground(.hidden)
        .helixScreen(.recover)
        .tint(HelixDomain.recover.accent)
        .navigationTitle("Reports")
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if reports.isEmpty {
                ContentUnavailableView(
                    "No reports yet",
                    systemImage: "doc.text",
                    description: Text("A weekly report appears here once it has been saved.")
                )
            }
        }
        .task {
            if let seeded {
                reports = seeded
                return
            }
            do {
                for try await rows in environment.database.reportsStream() { reports = rows }
            } catch {
                reports = []
            }
        }
    }

    private func row(_ report: ReportRow) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(Self.weekLabel(report))
                .foregroundStyle(Color.helix.textPrimary)
            Text(subtitle(report))
                .font(.caption)
                .foregroundStyle(Color.helix.textSecondary)
        }
        .padding(.vertical, 3)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }

    /// `19 Jul – 25 Jul 2026`. The stored dates, formatted — never a week
    /// number, which is a different subsystem and would be wrong here the first
    /// time a report covered a re-entry week.
    static func weekLabel(_ report: ReportRow) -> String {
        let start = LogicalDay.date(fromISO: report.periodStart)
        let end = LogicalDay.date(fromISO: report.periodEnd)
        guard let start else { return report.periodStart }
        guard let end else { return start.formatted(.dateTime.day().month(.abbreviated).year()) }
        return "\(start.formatted(.dateTime.day().month(.abbreviated))) – "
            + end.formatted(.dateTime.day().month(.abbreviated).year())
    }

    private func subtitle(_ report: ReportRow) -> String {
        let kind = report.type == "sentinel7" ? "Sentinel-7" : report.type.capitalized
        let size = (report.contentMd?.count ?? 0) / 1000
        return size > 0 ? "\(kind) · \(size) k" : kind
    }

    private var sampleBody: String { PreviewReport.body }
}

/// The reader: a native bar over a bundled web document.
struct ReportReaderView: View {
    let report: ReportRow
    /// The harness passes a body directly; the app reads it from the store when
    /// the screen opens, so a list of twenty reports does not hold a megabyte of
    /// markdown it never draws.
    var seededBody: String?

    @Environment(AppEnvironment.self) private var environment
    @State private var body_: String?

    var body: some View {
        Group {
            if let body_ {
                ReportWebView(markdown: body_)
                    .ignoresSafeArea(edges: .bottom)
            } else {
                ProgressView().controlSize(.large)
            }
        }
        .background(Color.helix.base)
        .navigationTitle(ReportsListView.weekLabel(report))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let body_ {
                    // The one thing a report page has always been for: getting
                    // the text somewhere else.
                    ShareLink(item: body_) { Label("Share", systemImage: "square.and.arrow.up") }
                }
            }
        }
        .task {
            if let seededBody {
                body_ = seededBody
                return
            }
            body_ = (try? environment.database.reportBody(id: report.id)) ?? report.contentMd
        }
    }
}

#if DEBUG
/// A short FMT v2 document for the shot loop, carried from the parser's own
/// tests so the screenshot exercises the real dialect: a banner, both heading
/// forms, an anchor ladder and a table with no separator row.
enum PreviewReport {
    static let body = """
    # ⬢ HELIX OS · WEEKLY TELEMETRY & PERFORMANCE AUDIT

    ```
    ╔══════════════════════════════════════════╗
    ║ W01 · 2026-07-19 → 07-25 · CUT · FMT v2  ║
    ╚══════════════════════════════════════════╝
    ```

    # ▓ PART 1 — WEIGHT & METABOLIC VERIFICATION

    ## 🟢 QUICK VERDICT — the cut is on rails
    Weight is down 0.7 kg on the week with muscle mass flat.

    ## 🧮 THE MATH & TDEE CHECK
    ANCHOR A · DIARY (blueprint primary)     2,400   ← ADOPTED
    ANCHOR B · HISTORICAL CUT @1,925         2,430   (−0.46 kg/wk @ 65.6 kg)
    ANCHOR C · BOTTOM-UP THIS WEEK           2,290   (range 2,163–2,420)

    ## 📉 WEIGHT & BODY COMP TRAJECTORY
    Date | Wt | BF% | Fat kg | Musc kg
    2026-07-19 | 64.8 | 17.9 | 11.6 | 29.9
    2026-07-22 | 64.4 | 17.6 | 11.3 | 29.8
    2026-07-25 | 64.1 | 17.4 | 11.2 | 29.7

    # ▓ PART 2 — GYM PERFORMANCE & HYPERTROPHY

    ## ⚑ DB LADDER VALIDATOR
    Steps are 11–25% relative — inside tolerance on every rung.

    Protein ████████████░░░░ 78%
    Steps   ██████████████░░ 88%

    ## Adherence notes
    Two sessions moved by a day; nothing dropped.
    """

    static let rows: [ReportRow] = [
        ReportRow(
            id: "r1", userId: "u1", type: "sentinel7",
            periodStart: "2026-08-23", periodEnd: "2026-08-29",
            contentMd: body, sessionSummaryMd: nil, weightReportMd: nil,
            metrics: nil, notionPageId: nil, createdAt: Date()
        ),
        ReportRow(
            id: "r2", userId: "u1", type: "sentinel7",
            periodStart: "2026-08-16", periodEnd: "2026-08-22",
            contentMd: body, sessionSummaryMd: nil, weightReportMd: nil,
            metrics: nil, notionPageId: nil, createdAt: Date()
        ),
    ]
}
#endif
