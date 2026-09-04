import SwiftUI
import HelixCore
import HelixUI

/// The faces of one slot, and the two ways they turn over.
///
/// ── A STACK ROTATES, AND IT ALSO OBEYS A FINGER ──────────────────────────────
/// Left alone, a stack shows each face for nine seconds — slow enough never to
/// flip while a number is being read, quick enough that a tile reads as having
/// another side. A vertical swipe steps through by hand, and after any manual
/// swipe the clock holds for a full period: a tile that flips out from under a
/// finger that just chose a face has overruled its user.
///
/// Every stack gets its own phase (`stagger`), so the grid never turns over on
/// one beat like a page refresh. The clock stops in edit mode and whenever the
/// scene leaves the foreground.
///
/// ── VERTICAL PAGES ON A HORIZONTAL TABVIEW ───────────────────────────────────
/// `TabView(.page)` pages sideways and there is no vertical style on iOS. It is
/// rotated a quarter turn clockwise and each page a quarter turn back, which
/// makes "swipe left = next" into "swipe up = forward" — the same axis a Smart
/// Stack on the Home Screen uses, and the one the grid's own scroll does not.
struct SmartStackView: View {
    let slot: StackSlot
    let entry: HelixTileEntry
    let paused: Bool

    @State private var face = 0
    @State private var touchedAt = Date.distantPast
    @State private var byClock = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let period: Duration = .seconds(9)
    /// Just under one period, so the offsets spread across a whole turn.
    static let staggerWindowMs = 7_000

    /// A deterministic offset per slot — the id's Java hash, as the web did,
    /// so the phase survives a remount and is the same on every device.
    static func stagger(_ slotId: String) -> Int {
        var h: Int32 = 0
        for unit in slotId.utf16 { h = h &* 31 &+ Int32(unit) }
        return Int(abs(Int(h))) % staggerWindowMs
    }

    private var rotating: Bool { slot.items.count > 1 && !paused }

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            TabView(selection: $face) {
                ForEach(Array(slot.items.enumerated()), id: \.offset) { index, id in
                    HelixTile.face(id, entry: entry)
                        .frame(width: w, height: h)
                        .rotationEffect(.degrees(-90))
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(width: h, height: w)
            .rotationEffect(.degrees(90), anchor: .topLeading)
            .offset(x: w)
            .overlay(alignment: .trailing) { dots }
        }
        .clipped()
        .onChange(of: face) { _, _ in
            if byClock { byClock = false } else { touchedAt = .now }
        }
        .onChange(of: slot.items.count) { _, n in face = min(face, max(0, n - 1)) }
        .task(id: rotating) {
            guard rotating else { return }
            try? await Task.sleep(for: Self.period + .milliseconds(Self.stagger(slot.id)))
            while !Task.isCancelled {
                if Date.now.timeIntervalSince(touchedAt) >= 9 {
                    byClock = true
                    withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : HelixMotion.flick) {
                        face = (face + 1) % max(1, slot.items.count)
                    }
                }
                try? await Task.sleep(for: Self.period)
            }
        }
    }

    /// Which face is up. Vertical, because the faces are.
    private var dots: some View {
        VStack(spacing: 4) {
            ForEach(Array(slot.items.enumerated()), id: \.offset) { index, id in
                Circle()
                    .fill(index == face ? id.domain.accent : Color.helix.textTertiary)
                    .frame(width: 4, height: 4)
            }
        }
        .padding(.trailing, 5)
        .allowsHitTesting(false)
    }
}
