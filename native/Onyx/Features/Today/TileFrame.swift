import SwiftUI
import OnyxCore
import WidgetKit
import OnyxUI

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
            .environment(\.onyxTileFamily, slot.size.family)
            .padding(OnyxSpace.m)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .onyxGlass(.tile)
            .contentShape(RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous))
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
                .onyxType(.caption).fontWeight(.heavy)
                // 24 pt badges on the tile's corner; the label carries the
                // meaning for VoiceOver, so the glyph does not scale with it.
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .foregroundStyle(Color.onyx.textPrimary)
                .frame(width: 24, height: 24)
                .background(Circle().fill(.regularMaterial))
                .overlay(Circle().strokeBorder(Color.onyx.hairline, lineWidth: 0.5))
        }
        .buttonStyle(OnyxPressStyle(scale: 0.9))
        .offset(x: -6, y: -6)
        .accessibilityLabel("Remove \(slot.items.map(\.title).joined(separator: ", "))")
    }

    private var resizeBadge: some View {
        Button { resizes += 1; onResize() } label: {
            Text(slot.size.rawValue.uppercased())
                .onyxType(.micro).fontWeight(.heavy)
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .foregroundStyle(Color.onyx.textPrimary)
                .frame(width: 24, height: 24)
                .background(Circle().fill(.regularMaterial))
                .overlay(Circle().strokeBorder(Color.onyx.hairline, lineWidth: 0.5))
        }
        .buttonStyle(OnyxPressStyle(scale: 0.9))
        .offset(x: 6, y: 6)
        .accessibilityLabel("Resize, currently \(slot.size.rawValue.uppercased())")
    }
}
