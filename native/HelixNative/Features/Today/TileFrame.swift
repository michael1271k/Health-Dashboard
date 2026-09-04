import SwiftUI
import HelixCore
import WidgetKit
import HelixUI

/// One slot's chrome: the glass, the edit badges and the jiggle.
///
/// ── WHAT EDIT MODE PUTS ON A TILE ────────────────────────────────────────────
/// The iOS grammar and nothing else: a minus at the top-left removes, the size
/// letter at the bottom-right steps through the sizes every face in the slot
/// can draw, and the whole tile jiggles so the mode is unmistakable from across
/// the room. `accessibilityReduceMotion` keeps the badges and drops the jiggle.
struct TileFrame<Content: View>: View {
    let slot: StackSlot
    let editing: Bool
    let onTap: () -> Void
    let onEdit: () -> Void
    let onRemove: () -> Void
    let onResize: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var wiggle = false
    @State private var resizes = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var sizes: [WidgetSize] { Dashboard.sizesFor(slot.items) }

    var body: some View {
        content()
            .environment(\.helixTileFamily, slot.size.family)
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .helixGlass(.tile)
            .contentShape(RoundedRectangle(cornerRadius: HelixCorner.tile, style: .continuous))
            .onTapGesture { onTap() }
            .onLongPressGesture(minimumDuration: 0.45) { if !editing { onEdit() } }
            .overlay(alignment: .topLeading) { if editing { removeBadge } }
            .overlay(alignment: .bottomTrailing) { if editing, sizes.count > 1 { resizeBadge } }
            .rotationEffect(.degrees(editing && !reduceMotion ? (wiggle ? 0.8 : -0.8) : 0))
            .animation(editing && !reduceMotion ? .easeInOut(duration: 0.14).repeatForever(autoreverses: true) : .default, value: wiggle)
            .onChange(of: editing, initial: true) { _, on in
                // A slightly different phase per tile, so the grid does not
                // shiver in lockstep.
                if on { Task { try? await Task.sleep(for: .milliseconds(SmartStackView.stagger(slot.id) % 140)); wiggle = true } }
                else { wiggle = false }
            }
            .sensoryFeedback(.selection, trigger: resizes)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(slot.items.map(\.title).joined(separator: ", "))
            .accessibilityHint(editing ? "Editing. Double-tap and hold to drag." : "Opens the sheet.")
    }

    private var removeBadge: some View {
        Button(action: onRemove) {
            Image(systemName: "minus")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(Color.helix.textPrimary)
                .frame(width: 24, height: 24)
                .background(Circle().fill(.regularMaterial))
                .overlay(Circle().strokeBorder(Color.helix.hairline, lineWidth: 0.5))
        }
        .buttonStyle(HelixPressStyle(scale: 0.9))
        .offset(x: -6, y: -6)
        .accessibilityLabel("Remove \(slot.items.map(\.title).joined(separator: ", "))")
    }

    private var resizeBadge: some View {
        Button { resizes += 1; onResize() } label: {
            Text(slot.size.rawValue.uppercased())
                .font(.system(size: 10, weight: .heavy, design: .rounded))
                .foregroundStyle(Color.helix.textPrimary)
                .frame(width: 24, height: 24)
                .background(Circle().fill(.regularMaterial))
                .overlay(Circle().strokeBorder(Color.helix.hairline, lineWidth: 0.5))
        }
        .buttonStyle(HelixPressStyle(scale: 0.9))
        .offset(x: 6, y: 6)
        .accessibilityLabel("Resize, currently \(slot.size.rawValue.uppercased())")
    }
}
