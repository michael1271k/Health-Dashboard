import SwiftUI
import UniformTypeIdentifiers
import OnyxCore
import WidgetKit
import OnyxUI

/// The arrangeable grid.
///
/// ── TWO COLUMNS, THREE FAMILIES ──────────────────────────────────────────────
/// A small is one cell, a medium and a large span both — the WidgetKit
/// families at their own proportions, packed into rows by `rows(_:)`.
/// Placement is sequential like the web's CSS grid: a lone small followed by a
/// medium leaves its neighbour cell empty rather than pulling a later small up,
/// so a drag never reorders anything you did not drag.
///
/// ── DRAG IS THE SYSTEM'S ─────────────────────────────────────────────────────
/// `.draggable` / `.dropDestination`. The lift, the 1:1 tracking, the
/// interruptibility and the drop animation are UIKit's, which is what makes them
/// match every other app. Dropping on a tile moves the dragged slot to its
/// position; HOLDING over a same-size tile for a beat offers to stack instead,
/// and the tile says so by brightening. Both rules are `Dashboard.canStack`'s.
struct DashboardGrid: View {
    @Bindable var model: TodayModel
    let onOpen: (WidgetId) -> Void

    @State private var mergeTarget: String?
    @State private var hover: Task<Void, Never>?
    @State private var drops = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// §3.1: the grid gap is `s + 2`, tighter than the section gap around it —
    /// tiles in one grid are one object, and spacing them like separate cards is
    /// what made the web dashboard read as a page of boxes.
    static let gap: CGFloat = OnyxSpace.grid
    /// Hold over a same-size tile this long mid-drag before it offers to stack.
    static let mergeHold: Duration = .milliseconds(600)

    var body: some View {
        VStack(spacing: Self.gap) {
            ForEach(Self.rows(model.visibleSlots)) { row in
                HStack(alignment: .top, spacing: Self.gap) {
                    ForEach(row.slots, id: \.id) { slot in tile(slot) }
                    // A lone small keeps its neighbour cell empty — sequential
                    // placement, like the web's CSS grid, never pulls a later
                    // small up past a medium.
                    if row.slots.count == 1, Dashboard.heightTier(row.slots[0].size) == .s {
                        Color.clear.aspectRatio(1, contentMode: .fit)
                    }
                }
            }
        }
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : OnyxMotion.move, value: model.layout)
        .sensoryFeedback(.selection, trigger: drops)
    }

    /// One grid row: two smalls, or one medium or large.
    struct Row: Identifiable {
        let slots: [StackSlot]
        var id: String { slots.map(\.id).joined(separator: "+") }
    }

    /// Sequential packing. Smalls pair up left to right; anything taller takes
    /// a row of its own, closing a half-filled small row above it.
    static func rows(_ slots: [StackSlot]) -> [Row] {
        var rows: [Row] = []
        var open: [StackSlot] = []
        for slot in slots {
            if Dashboard.heightTier(slot.size) == .s {
                open.append(slot)
                if open.count == 2 { rows.append(Row(slots: open)); open = [] }
            } else {
                if !open.isEmpty { rows.append(Row(slots: open)); open = [] }
                rows.append(Row(slots: [slot]))
            }
        }
        if !open.isEmpty { rows.append(Row(slots: open)) }
        return rows
    }

    @ViewBuilder
    private func tile(_ slot: StackSlot) -> some View {
        let tier = Dashboard.heightTier(slot.size)
        TileFrame(
            slot: slot, editing: model.editing,
            onTap: {
                if model.editing { if slot.items.count > 1 { model.sheet = .stack(slot.id) } }
                else { onOpen(slot.items.first!) }
            },
            onEdit: { withAnimation(OnyxMotion.flick) { model.editing = true } },
            onRemove: { model.remove(slot.id) },
            onResize: { model.resize(slot.id) }
        ) {
            if slot.items.count > 1 {
                SmartStackView(slot: slot, entry: model.entry, paused: model.editing || !model.isActive)
            } else {
                OnyxTile.face(slot.items[0], entry: model.entry)
            }
        }
        .aspectRatio(tier == .s ? 1 : tier == .m ? 338 / 158 : 338 / 354, contentMode: .fit)
        .overlay {
            if mergeTarget == slot.id {
                RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous)
                    .strokeBorder(slot.items[0].domain.accent, lineWidth: 2)
            }
        }
        .modifier(Arrangeable(
            enabled: model.editing, slotId: slot.id,
            onDrop: { dragged in drop(dragged, on: slot.id) },
            onTargeted: { targeted in hovered(slot.id, targeted) }
        ))
    }

    private func hovered(_ slotId: String, _ targeted: Bool) {
        hover?.cancel()
        guard targeted else { if mergeTarget == slotId { mergeTarget = nil }; return }
        hover = Task {
            try? await Task.sleep(for: Self.mergeHold)
            guard !Task.isCancelled else { return }
            mergeTarget = slotId
        }
    }

    private func drop(_ dragged: String, on target: String) {
        hover?.cancel()
        defer { mergeTarget = nil; drops += 1 }
        guard dragged != target else { return }
        if mergeTarget == target, model.canStack(dragged, onto: target) {
            model.stack(dragged, onto: target)
        } else {
            model.move(dragged, to: target)
        }
    }
}

/// `.draggable` and `.dropDestination`, only while editing — a tile you can
/// lift while reading is a tile you will lift by accident while scrolling.
private struct Arrangeable: ViewModifier {
    let enabled: Bool
    let slotId: String
    let onDrop: (String) -> Void
    let onTargeted: (Bool) -> Void

    func body(content: Content) -> some View {
        if enabled {
            content
                .draggable(slotId) {
                    // The lifted preview is the tile's own outline, not a
                    // screenshot of a jiggling view mid-tilt.
                    RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .frame(width: 120, height: 120)
                }
                .dropDestination(for: String.self) { items, _ in
                    guard let dragged = items.first else { return false }
                    onDrop(dragged)
                    return true
                } isTargeted: { onTargeted($0) }
        } else {
            content
        }
    }
}

/// The tray: every drawable widget that is not on the grid, as chips.
struct WidgetGallery: View {
    let model: TodayModel

    var body: some View {
        if !model.gallery.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Not on the grid · \(model.gallery.count)")
                    .onyxType(.caption).fontWeight(.semibold)
                    .foregroundStyle(Color.onyx.textSecondary)
                FlowLayout(spacing: 8) {
                    ForEach(model.gallery, id: \.self) { id in
                        Button { model.add(id) } label: {
                            Label(id.title, systemImage: id.symbol)
                                .onyxType(.secondary).fontWeight(.semibold)
                                .foregroundStyle(Color.onyx.textPrimary)
                                .padding(.horizontal, 12).padding(.vertical, 8)
                                .onyxGlass(.row)
                        }
                        .buttonStyle(OnyxPressStyle())
                        .accessibilityHint("Adds \(id.title) to the grid")
                    }
                }
            }
            .padding(.top, 4)
            .transition(.opacity.combined(with: .move(edge: .bottom)))
        }
    }
}

/// Chips that wrap. `Layout` in twenty lines; a `LazyVGrid` would force the
/// chips onto a column grid they have no reason to align to.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        place(in: proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (view, point) in zip(subviews, place(in: bounds.width, subviews).points) {
            view.place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func place(in width: CGFloat, _ subviews: Subviews) -> (points: [CGPoint], size: CGSize) {
        var points: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        return (points, CGSize(width: maxX, height: y + rowHeight))
    }
}
