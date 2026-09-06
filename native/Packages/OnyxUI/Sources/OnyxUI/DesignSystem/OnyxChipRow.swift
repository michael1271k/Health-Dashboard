import SwiftUI

/// One fast action, as a capsule.
///
/// ── WHY A ROW OF CHIPS REPLACED A THREE-DOT MENU ────────────────────────────
/// The logger's actions lived behind `Menu { … }` in the toolbar: two taps and a
/// system popover to skip a rest, and the popover covered the deck it was about.
/// A menu is the right shape for a long, cold list of settings. These are four
/// verbs used every session with wet hands, and the thing a menu costs them is
/// exactly the thing they need — being visible without being opened.
///
/// The chip is also honest about state in a way a menu item cannot be: "Skip
/// rest" is simply ABSENT when nothing is resting, rather than present and
/// disabled, and the row springs closed around the gap.
public struct OnyxChip: Identifiable {
    public let id: String
    public let title: String
    public let systemImage: String
    /// The chip's ink. `nil` takes secondary text.
    public let tint: Color?
    /// Filled rather than outlined — the one action that ENDS the screen.
    /// At most one per row, for the same reason a screen has one hero.
    public let isProminent: Bool
    public let action: () -> Void

    public init(
        id: String? = nil,
        title: String,
        systemImage: String,
        tint: Color? = nil,
        isProminent: Bool = false,
        action: @escaping () -> Void
    ) {
        self.id = id ?? title
        self.title = title
        self.systemImage = systemImage
        self.tint = tint
        self.isProminent = isProminent
        self.action = action
    }
}

/// The fast actions under a screen's hero.
///
/// Horizontally scrolled, because five chips do not fit 402 pt and at an
/// accessibility size two do not. A row that wrapped would change the height of
/// the chrome above the deck as the text size changed, and the deck is what this
/// screen is short of; a row that scrolls keeps the chrome one line tall at
/// every setting and lets the reader push the rest into view.
///
/// ── AND WHY ONE CHIP DOES NOT SCROLL ────────────────────────────────────────
/// A scrolling row hides its own end, and the end is where the important verb
/// was: with a contextual chip present, "Finish" was off the right edge of a
/// 402 pt screen — the primary action of the screen, reachable only by a swipe
/// nothing indicated. `pinned` holds it out of the scroll entirely, so the
/// secondary actions slide under a control that never moves. This is the
/// arrangement iOS uses wherever a fixed action sits beside a scrolling set of
/// options, and it is the reason the scroll CLIPS rather than bleeding.
public struct OnyxChipRow: View {
    private let chips: [OnyxChip]
    private let pinned: OnyxChip?

    public init(_ chips: [OnyxChip], pinned: OnyxChip? = nil) {
        self.chips = chips
        self.pinned = pinned
    }

    public var body: some View {
        // Pinned to the container: a horizontal scroll view reports its CONTENT
        // as its ideal width, and at an accessibility size that ideal widened
        // the whole column this row sits in.
        HStack(spacing: OnyxSpace.s) {
            ScrollView(.horizontal) {
                HStack(spacing: OnyxSpace.s) {
                    ForEach(chips) { chip in
                        button(chip)
                    }
                }
                .padding(.leading, OnyxSpace.l)
                .padding(.trailing, pinned == nil ? OnyxSpace.l : OnyxSpace.s)
                // The row is animated as a WHOLE, so a contextual chip arriving
                // or leaving slides its neighbours rather than teleporting them.
                .animation(OnyxMotion.move, value: chips.map(\.id))
            }
            .scrollIndicators(.hidden)
            // The trailing edge fades rather than cutting. A capsule sliced
            // square by a clip reads as a rendering fault; the same capsule
            // fading out reads as the row continuing — which, since the row has
            // no other affordance, is the whole scroll cue.
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .black, location: 0),
                        .init(color: .black, location: 0.92),
                        .init(color: .clear, location: 1),
                    ],
                    startPoint: .leading, endPoint: .trailing
                )
            )

            if let pinned {
                button(pinned)
                    // Never squeezed by the scroll beside it: at an
                    // accessibility size the row would otherwise spend its last
                    // points truncating the one chip that must stay readable —
                    // and "Fini…" on the button that ends the workout is the
                    // one truncation this row cannot afford. `fixedSize` takes
                    // the width first; the scroll gets the remainder and scrolls.
                    .fixedSize()
                    .layoutPriority(1)
                    .padding(.trailing, OnyxSpace.l)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func button(_ chip: OnyxChip) -> some View {
        Button(action: chip.action) { label(chip) }
            .onyxPress()
            .accessibilityLabel(chip.title)
    }

    private func label(_ chip: OnyxChip) -> some View {
        let ink = chip.tint ?? Color.onyx.textSecondary
        return HStack(spacing: OnyxSpace.xs) {
            Image(systemName: chip.systemImage)
                .imageScale(.small)
            Text(chip.title)
                .lineLimit(1)
        }
        .onyxType(.caption).fontWeight(.semibold)
        .foregroundStyle(chip.isProminent ? Color.onyx.base : ink)
        .padding(.horizontal, OnyxSpace.m)
        .padding(.vertical, OnyxSpace.s)
        // 44 pt is the platform's own minimum and this row is tapped mid-set.
        .frame(minHeight: 44)
        .background {
            if chip.isProminent {
                Capsule().fill(ink)
            } else {
                Capsule().fill(.ultraThinMaterial)
                Capsule().strokeBorder(Color.onyx.hairline, lineWidth: 0.5)
            }
        }
        .clipShape(Capsule())
        .contentShape(Capsule())
    }
}

#if DEBUG
#Preview("Chip row") {
    VStack(alignment: .leading, spacing: OnyxSpace.l) {
        OnyxChipRow(
            [
                .init(title: "Muscle focus", systemImage: "figure.stand", action: {}),
                .init(title: "Phase", systemImage: "arrow.triangle.2.circlepath", action: {}),
                .init(title: "Skip rest", systemImage: "forward.end", tint: Color.onyx.accent(.train), action: {}),
                .init(title: "Note", systemImage: "square.and.pencil", action: {}),
            ],
            pinned: .init(
                title: "Finish", systemImage: "checkmark",
                tint: Color.onyx.accent(.train), isProminent: true, action: {}
            )
        )
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .padding(.vertical, OnyxSpace.xl)
    .onyxScreen(.train)
    .foregroundStyle(Color.onyx.textPrimary)
}
#endif
