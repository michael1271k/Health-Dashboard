import SwiftUI

/// Obsidian Glass — the one modifier that owns depth.
///
/// ── MATERIAL, NOT PAINT ─────────────────────────────────────────────────────
/// Hierarchy on this app is material WEIGHT, not border lines and not lighter
/// greys. A row is thinner than the tile it sits in; a sheet is thicker than the
/// screen behind it; navigation chrome is thicker still. That ordering is what
/// tells you which layer you are on, and it survives Dynamic Type, dark rooms
/// and the colour-blind — none of which a 1 px border does.
///
/// ── AND WHY IT IS ONE MODIFIER ──────────────────────────────────────────────
/// If the deployment target ever rises to iOS 26, `glassEffect` replaces the
/// BODY of this modifier and nothing else in the app moves. Every screen that
/// spelled out its own `.background(.ultraThinMaterial)` would be a separate
/// edit, and the ones that got missed would be the bug.
public enum GlassLevel: Sendable {
    /// A row inside a tile. Thinnest, no border, no shadow — it is already
    /// inside something.
    case row
    /// A tile on a screen.
    case tile
    /// A presented sheet.
    case sheet
    /// Navigation chrome: a bar, a toolbar, a floating control.
    case chrome

    public var material: Material {
        switch self {
        case .row, .tile: .ultraThinMaterial
        case .sheet:      .thinMaterial
        case .chrome:     .regularMaterial
        }
    }

    public var radius: CGFloat {
        switch self {
        case .row:    HelixCorner.row
        case .tile:   HelixCorner.tile
        case .sheet:  HelixCorner.sheet
        case .chrome: 0
        }
    }

    /// A hairline only where content meets chrome — a tile's own edge is drawn
    /// by the material, and outlining it as well reads as a box around a box.
    public var drawsHairline: Bool {
        switch self {
        case .tile, .sheet, .chrome: true
        case .row: false
        }
    }

    /// Large, soft and dark. Shadows separate a floating surface from busy
    /// content; a row that is flush with its container is not floating and gets
    /// none, because a shadow under something that has not lifted is just dirt.
    public var shadow: (radius: CGFloat, y: CGFloat)? {
        switch self {
        case .sheet: (24, 12)
        case .row, .tile, .chrome: nil
        }
    }
}

private struct HelixGlassModifier: ViewModifier {
    let level: GlassLevel

    /// Frostier and opaque when the system asks for it. A translucent surface is
    /// a legibility bet, and this setting is the user saying they do not want it
    /// taken on their behalf.
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: level.radius, style: .continuous)
        return content
            .background {
                if reduceTransparency {
                    shape.fill(Color.helix.base)
                    shape.fill(Color.white.opacity(0.10))
                } else {
                    shape.fill(level.material)
                }
            }
            .overlay {
                if level.drawsHairline {
                    shape.strokeBorder(Color.helix.hairline, lineWidth: 0.5)
                }
            }
            .clipShape(shape)
            .shadow(
                color: .black.opacity(level.shadow == nil ? 0 : 0.35),
                radius: level.shadow?.radius ?? 0,
                y: level.shadow?.y ?? 0
            )
    }
}

public extension View {
    /// The app's only depth primitive.
    ///
    /// Never stack two of these directly: `.tile` inside `.tile` puts one light
    /// translucent surface on another and both stop reading as glass. A row
    /// inside a tile is `.row`, which is the whole reason the level exists.
    func helixGlass(_ level: GlassLevel = .tile) -> some View {
        modifier(HelixGlassModifier(level: level))
    }
}

// MARK: - The screen ground

/// True black, with one mesh bleed of the screen's domain behind the top of it.
///
/// ── ONE BLEED, EIGHT PERCENT, TOP ONLY ──────────────────────────────────────
/// The accent's job is to say which domain you are in before you read a word.
/// It does that from the corner of your eye; at 30 % it becomes a background you
/// have to read text against, and every material above it turns muddy because
/// glass tints towards whatever is behind it. The bleed is behind the TOP
/// because that is where the title is and where the eye lands.
///
/// v2 took it from 12 % over 340 pt to 8 % over 240 (§3.1). At 12 % across a
/// third of the screen it had stopped being a bleed and become a gradient
/// header — the thing that made every screenshot read as a landing page — and
/// the desaturated v2 accents carry further at lower alpha than the v1 neons
/// did, so 8 % says the same thing more quietly.
private struct HelixScreenBackground: ViewModifier {
    let domain: HelixDomain

    func body(content: Content) -> some View {
        content.background {
            ZStack(alignment: .top) {
                Color.helix.base
                MeshGradient(
                    width: 3,
                    height: 3,
                    points: [
                        .init(0, 0),   .init(0.5, 0),   .init(1, 0),
                        .init(0, 0.5), .init(0.5, 0.5), .init(1, 0.5),
                        .init(0, 1),   .init(0.5, 1),   .init(1, 1),
                    ],
                    colors: [
                        domain.start, domain.start, domain.end,
                        domain.end,   .black,       .black,
                        .black,       .black,       .black,
                    ]
                )
                .opacity(0.08)
                // Tall enough to bleed under a large navigation title and no
                // further. A full-height mesh is an ambient gradient, which is
                // the look this design mandate exists to avoid.
                .frame(height: 240)
                .blur(radius: 40)
                .ignoresSafeArea()
            }
            .ignoresSafeArea()
        }
    }
}

public extension View {
    /// The ground every Wave 3 screen stands on.
    func helixScreen(_ domain: HelixDomain) -> some View {
        modifier(HelixScreenBackground(domain: domain))
    }
}

#if DEBUG
#Preview("Glass levels") {
    ScrollView {
        VStack(spacing: HelixSpace.l) {
            ForEach(HelixDomain.allCases, id: \.self) { domain in
                VStack(alignment: .leading, spacing: HelixSpace.s) {
                    Text(domain.rawValue.capitalized)
                        .font(.headline)
                        .foregroundStyle(domain.accent)
                    Text("1,950")
                        .helixHero()
                        .foregroundStyle(Color.helix.textPrimary)
                    HStack {
                        Text("A row")
                        Spacer()
                        Text("42").helixNumeral()
                    }
                    .padding(HelixSpace.m)
                    .helixGlass(.row)
                }
                .padding(HelixSpace.m)
                .frame(maxWidth: .infinity, alignment: .leading)
                .helixGlass(.tile)
            }
        }
        .padding()
    }
    .helixScreen(.train)
    .foregroundStyle(Color.helix.textPrimary)
}
#endif
