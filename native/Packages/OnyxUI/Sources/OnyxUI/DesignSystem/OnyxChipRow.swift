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
///
/// ── AND WHY ONE OF THEM IS DISABLED RATHER THAN ABSENT (W1b) ────────────────
/// That rule is about a CONTEXTUAL action, and it holds: there is no answer to
/// "when will Skip rest come back", so a gap is the honest shape. A GATED one
/// is the other case. The week export opens on a date, and the answer to "where
/// did the button go" is that date — so it stays, states it, and refuses the
/// tap. The two rules agree once the question is asked: vanish when the absence
/// explains itself, remain when it needs a sentence. See `WeekDaysView`.
public struct OnyxChip: Identifiable {
    public let id: String
    public let title: String
    public let systemImage: String
    /// The chip's ink. `nil` takes secondary text.
    public let tint: Color?
    /// Filled rather than outlined — the one action that ENDS the screen.
    /// At most one per row, for the same reason a screen has one hero.
    public let isProminent: Bool
    /// A control that exists and is not available yet. Defaulted, so every
    /// call site written before this existed still compiles.
    public let isEnabled: Bool
    public let action: () -> Void

    public init(
        id: String? = nil,
        title: String,
        systemImage: String,
        tint: Color? = nil,
        isProminent: Bool = false,
        isEnabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.id = id ?? title
        self.title = title
        self.systemImage = systemImage
        self.tint = tint
        self.isProminent = isProminent
        self.isEnabled = isEnabled
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
    private let pinned: AnyView?

    public init(_ chips: [OnyxChip], pinned: OnyxChip? = nil) {
        self.chips = chips
        self.pinned = pinned.map { AnyView(Self.button($0)) }
    }

    /// The pinned slot, for a control that cannot be an `OnyxChip`.
    ///
    /// `ShareLink` is the case this exists for: it is a VIEW, not an action —
    /// it needs its item up front and builds its own button — so it can never
    /// travel in `chips`. Before this, a caller wanting a share beside its
    /// chips had to rebuild the pinned arm's own `fixedSize` / `layoutPriority`
    /// / trailing-pad at the call site, which put the same control in a
    /// different place depending on whether it happened to be enabled.
    ///
    /// Wear `OnyxChipRow.face(...)` inside the closure and the control is the
    /// row's real capsule rather than one that looks like it until a token
    /// moves.
    public init<Pinned: View>(_ chips: [OnyxChip], @ViewBuilder pinned: () -> Pinned) {
        self.chips = chips
        self.pinned = AnyView(pinned())
    }

    public var body: some View {
        // Pinned to the container: a horizontal scroll view reports its CONTENT
        // as its ideal width, and at an accessibility size that ideal widened
        // the whole column this row sits in.
        HStack(spacing: OnyxSpace.s) {
            ScrollView(.horizontal) {
                HStack(spacing: OnyxSpace.s) {
                    ForEach(chips) { chip in
                        Self.button(chip)
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
                pinned
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

    private static func button(_ chip: OnyxChip) -> some View {
        Button(action: chip.action) { face(chip) }
            // A disabled `Button` never reports `isPressed`, so `OnyxPressStyle`
            // never springs — the lock needs no separate suppression, and the
            // order of these two lines does not matter.
            .disabled(!chip.isEnabled)
            .onyxPress()
            .accessibilityLabel(chip.title)
    }

    /// The capsule on its own, for the one control that cannot be a `Button`.
    ///
    /// `ShareLink` is a VIEW and not an action — it needs its item up front and
    /// builds its own button — so a share cannot travel in `chips`. Rather than
    /// re-spell the material, the hairline and the two clip shapes at a call
    /// site (which is how a design system grows a second chip that drifts from
    /// the first), the face is public and the caller wraps it:
    ///
    ///     OnyxChipRow(chips) {
    ///         ShareLink(item: file) { OnyxChipRow.face(title: "Export", systemImage: "square.and.arrow.up") }
    ///     }
    ///
    /// It takes the fields it draws rather than a whole `OnyxChip`, because a
    /// chip carries an `action` this never calls and the only way to supply one
    /// is an empty closure — a lie in the value, written at every call site, to
    /// satisfy a parameter nothing reads.
    public static func face(
        title: String, systemImage: String, tint: Color? = nil,
        isProminent: Bool = false, isEnabled: Bool = true
    ) -> some View {
        let chip = OnyxChip(
            title: title, systemImage: systemImage, tint: tint,
            isProminent: isProminent, isEnabled: isEnabled, action: {}
        )
        return face(chip)
    }

    private static func face(_ chip: OnyxChip) -> some View {
        let ink = chip.tint ?? Color.onyx.textSecondary
        return HStack(spacing: OnyxSpace.xs) {
            Image(systemName: chip.systemImage)
                .imageScale(.small)
            Text(chip.title)
                .lineLimit(1)
        }
        .onyxType(.caption).fontWeight(.semibold)
        // ── A LOCKED CHIP KEEPS ITS INK ─────────────────────────────────────
        // Greying the LABEL is the reflex and it is wrong twice over:
        // `textTertiary` is 3.66:1 on this ground and its own token rule says
        // "never a control label", and grey text is the universal signal for
        // BROKEN. This control is not broken, it is not yours yet. So the text
        // stays at full strength and the CAPSULE carries the state.
        .foregroundStyle(chip.isProminent ? Color.onyx.base : ink)
        .padding(.horizontal, OnyxSpace.m)
        .padding(.vertical, OnyxSpace.s)
        // 44 pt is the platform's own minimum and this row is tapped mid-set.
        .frame(minHeight: 44)
        .background {
            if chip.isProminent {
                Capsule().fill(ink)
            } else {
                // The outline is the promise that the control still exists;
                // the missing material is what says it is not available. Two
                // signals, and the glyph the caller picks is the third.
                if chip.isEnabled { Capsule().fill(.ultraThinMaterial) }
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
