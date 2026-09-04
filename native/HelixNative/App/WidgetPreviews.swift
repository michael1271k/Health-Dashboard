#if DEBUG
import SwiftUI
import WidgetKit
import HelixCore
import HelixUI

/// Every tile × every focus × every family, from `HelixSnapshot.sample`.
///
/// The render gate for Wave 5's "move + re-skin": no network, no database, one
/// fixture. `widgets` is the whole contact sheet in a scroll view; `widgets-N`
/// is page N of it at 1:1, which is what the shot loop photographs — a scroll
/// view screenshots its first screen only, and sixty-seven tiles do not fit on
/// one.
@MainActor
enum WidgetPreviews {

    struct Cell: Identifiable {
        let id: String
        let family: WidgetFamily
        let content: AnyView

        var size: CGSize {
            switch family {
            case .systemSmall:          CGSize(width: 158, height: 158)
            case .systemMedium:         CGSize(width: 338, height: 158)
            case .systemLarge:          CGSize(width: 338, height: 354)
            case .accessoryCircular:    CGSize(width: 72, height: 72)
            case .accessoryRectangular: CGSize(width: 160, height: 72)
            default:                    CGSize(width: 160, height: 24)
            }
        }
    }

    static let entry = HelixTileEntry(date: HelixSnapshot.sampleDate, snapshot: .sample)

    static let cells: [Cell] = {
        let home: [WidgetFamily] = [.systemSmall, .systemMedium, .systemLarge]
        var out: [Cell] = []
        func add<V: View>(_ id: String, _ family: WidgetFamily, _ view: V) {
            out.append(Cell(id: "\(id)-\(family)", family: family, content: AnyView(view)))
        }
        // Size-major within a family, so two Smalls share a row and two Larges
        // share a page — focus-major would put every Large on a page of its own.
        for fam in home { for f in FuelFocus.allCases { add("fuel-\(f.rawValue)", fam, FuelView(entry: entry, focus: f)) } }
        for fam in home { for f in TrainingFocus.allCases { add("training-\(f.rawValue)", fam, TrainingView(entry: entry, focus: f)) } }
        for fam in home { for f in BodyFocus.allCases { add("body-\(f.rawValue)", fam, BodyView(entry: entry, focus: f)) } }
        for fam in home { for f in VitalsFocus.allCases { add("vitals-\(f.rawValue)", fam, VitalsView(entry: entry, focus: f)) } }
        // Large only — the widget declares `.systemLarge` alone (see HelixDaily).
        add("daily", .systemLarge, DailyView(entry: entry))
        for f in LockFocus.allCases {
            for fam in [WidgetFamily.accessoryCircular, .accessoryRectangular, .accessoryInline] {
                add("lock-\(f.rawValue)", fam, LockView(entry: entry, focus: f))
            }
        }
        return out
    }()

    /// Rows that fit the width, then pages that fit the height — so page N is
    /// the same N cells every run, whatever the order they were declared in.
    static let pages: [[[Cell]]] = {
        let maxWidth: CGFloat = 372, maxHeight: CGFloat = 760, gap: CGFloat = 6, caption: CGFloat = 12
        var rows: [[Cell]] = [[]]
        var width: CGFloat = 0
        for cell in cells {
            if width > 0, width + gap + cell.size.width > maxWidth { rows.append([]); width = 0 }
            rows[rows.count - 1].append(cell)
            width += (width > 0 ? gap : 0) + cell.size.width
        }
        var pages: [[[Cell]]] = [[]]
        var height: CGFloat = 0
        for row in rows {
            let h = (row.map(\.size.height).max() ?? 0) + caption + gap
            if height > 0, height + h > maxHeight { pages.append([]); height = 0 }
            pages[pages.count - 1].append(row)
            height += h
        }
        return pages
    }()

    /// `widgets` → everything, scrolling. `widgets-3` → page 3 at 1:1.
    @ViewBuilder
    static func view(_ screen: String) -> some View {
        let page = Int(screen.dropFirst("widgets-".count))
        if let page, pages.indices.contains(page) {
            VStack(spacing: 6) {
                ForEach(Array(pages[page].enumerated()), id: \.offset) { _, row in rowView(row) }
                Spacer(minLength: 0)
            }
            .padding(.top, 4)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(Color.helix.base)
        } else {
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(Array(pages.joined().enumerated()), id: \.offset) { _, row in rowView(row) }
                }
                .padding(.vertical, 8)
            }
            .background(Color.helix.base)
        }
    }

    private static func rowView(_ row: [Cell]) -> some View {
        HStack(alignment: .top, spacing: 6) {
            ForEach(row) { cell in
                VStack(alignment: .leading, spacing: 0) {
                    Text(cell.id)
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Color.helix.textTertiary)
                        .lineLimit(1)
                    cell.content
                        .environment(\.helixTileFamily, cell.family)
                        .padding(cell.family.isAccessory ? 4 : 14)
                        .frame(width: cell.size.width, height: cell.size.height)
                        .helixGlass(cell.family.isAccessory ? .row : .tile)
                }
            }
        }
    }
}

private extension WidgetFamily {
    var isAccessory: Bool {
        self == .accessoryCircular || self == .accessoryRectangular || self == .accessoryInline
    }
}
#endif
