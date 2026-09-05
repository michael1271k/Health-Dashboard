import SwiftUI
import HelixUI

/// The two things every screen in this tab needs: a number row, and a ground.
///
/// ── WHY A `Form` AND NOT A HAND-BUILT LIST OF TILES ─────────────────────────
/// §3.5 of the plan is explicit that Settings is stock: `Form`, `Toggle`,
/// `Stepper`, `Picker`, one `Section` per concern. That is not laziness about
/// the design — it is the design. A settings screen is the one place where
/// looking exactly like every other iOS settings screen IS the correct answer,
/// because the user already knows how it works, and because stock controls come
/// with Dynamic Type, VoiceOver, Switch Control and the keyboard behaviours for
/// free. The Obsidian Glass identity arrives through the ground and the section
/// accents, not by rebuilding a `Toggle`.

// MARK: - The ground

extension View {
    /// A `Form` on the app's black ground with its domain bleed.
    ///
    /// `.scrollContentBackground(.hidden)` is the whole trick: without it the
    /// form paints `systemGroupedBackground` over everything behind it and the
    /// mesh is invisible.
    func helixFormBackground(_ domain: HelixDomain) -> some View {
        self
            .scrollContentBackground(.hidden)
            // The rows are the app's material, not a grey. Over true black a
            // grouped row would be a flat `#1C1C1E` rectangle and the mesh
            // behind the top of the screen would stop at the first section;
            // `ultraThinMaterial` samples what is behind it, so the first tile
            // carries a trace of the domain's accent and the ones further down
            // fade to black. That gradient IS the hierarchy.
            .listRowBackground(Rectangle().fill(.ultraThinMaterial))
            .helixScreen(domain)
            .tint(domain.accent)
    }
}

/// A section header in the screen's accent.
///
/// Uppercased is the platform's own convention for grouped-form headers; the
/// colour is what says which domain the section belongs to.
struct HelixSectionHeader: View {
    let title: String
    let domain: HelixDomain

    init(_ title: String, _ domain: HelixDomain) {
        self.title = title
        self.domain = domain
    }

    var body: some View {
        Text(title)
            .font(.footnote.weight(.semibold))
            .tracking(12 * 0.01)
            .foregroundStyle(domain.accent)
    }
}

// MARK: - A number

/// One editable figure, or none.
///
/// ── EMPTY IS `nil`, AND `nil` IS NOT ZERO ───────────────────────────────────
/// A blank body-fat target means "I have not set one", and the placeholder is an
/// em dash to say so. Storing it as 0 would mean "my target is zero percent body
/// fat", which every downstream gauge would then draw. This is the single most
/// repeated rule in the codebase and it is enforced here rather than in each of
/// the eleven callers.
///
/// ── AND WHY THERE IS NO DEBOUNCE ────────────────────────────────────────────
/// The web version committed on blur AND on a 600 ms timer, because a controlled
/// React input has no idea when the user is finished. SwiftUI does: this commits
/// when the field loses focus. Typing "1955" therefore writes once, not four
/// times.
///
/// ── BUT THE TEXT IS PARSED ON EVERY KEYSTROKE ───────────────────────────────
/// The binding is a `String`, not `TextField(value:format:)`. That form only
/// parses when EDITING ENDS, and a back-swipe removes the view before the field
/// resigns — so the last number typed never reached the model at all, and the
/// screen you navigated away from silently discarded it. Parsing as you type
/// keeps the model current at every instant, which makes "commit whatever is
/// there" safe from anywhere, including `onDisappear`.
///
/// ── AND WHY THE FOCUS STATE IS THE CALLER'S ─────────────────────────────────
/// `.focused()` binds the field it is applied TO. A row that owned its own
/// `@FocusState` would leave the screen unable to dismiss the keyboard — and a
/// decimal pad has no return key, so "tap elsewhere" is the only other way out
/// and on a `Form` that means tapping a control you did not mean to touch. The
/// screen therefore owns one focus value for all its fields, which also gives it
/// the one moment a commit should happen: the field losing it.
struct HelixNumberRow<Field: Hashable>: View {
    let label: String
    @Binding var value: Double?
    let field: Field
    @FocusState.Binding var focus: Field?
    var unit: String?
    /// Clamped on commit rather than rejected — `min=0` as an HTML attribute
    /// with no code behind it is how the web version accepts a typed −5.
    var range: ClosedRange<Double> = 0...100_000
    var fractionLength: Int = 0
    /// Fired when this field loses focus AND its value actually changed.
    var onCommit: () -> Void = {}

    @State private var text = ""
    /// What was last sent to the model, so that focusing a field and leaving it
    /// alone writes nothing. Without it, a tap through a form queues an outbox
    /// row per field touched — and in the levers that also forces the rung to
    /// `custom`, silently cancelling a rung by looking at it.
    @State private var committed: Double??

    var body: some View {
        LabeledContent {
            HStack(spacing: 6) {
                TextField("—", text: $text)
                    .keyboardType(fractionLength > 0 ? .decimalPad : .numberPad)
                    .multilineTextAlignment(.trailing)
                    .focused($focus, equals: field)
                    .helixNumeral()
                    // An empty field is one em dash wide. Right-aligned in a
                    // `LabeledContent` that is a ~10 pt target, and the row's
                    // whitespace does not focus it.
                    .frame(minWidth: 90, alignment: .trailing)
                    .contentShape(.rect)
                    .accessibilityLabel(unit == nil ? label : "\(label), \(unit!)")
                    .accessibilityValue(value == nil ? "Not set" : text)
                    .onChange(of: text) { _, new in value = Self.parse(new) }

                if let unit {
                    Text(unit)
                        .foregroundStyle(Color.helix.textTertiary)
                        // The unit is decoration beside a value VoiceOver
                        // already reads with its label; announcing "kilograms"
                        // twice is worse than not announcing it.
                        .accessibilityHidden(true)
                }
            }
        } label: {
            Text(label)
        }
        .onAppear {
            text = Self.format(value, fractionLength)
            committed = .some(value)
        }
        // A value that arrives from the store — a sync pull, or another screen —
        // is shown, but never while the field is being typed into.
        .onChange(of: value) { _, new in
            guard focus != field else { return }
            text = Self.format(new, fractionLength)
        }
        .onChange(of: focus) { old, _ in
            guard old == field else { return }
            if let v = value {
                value = min(max(v, range.lowerBound), range.upperBound)
            }
            text = Self.format(value, fractionLength)
            guard committed != .some(value) else { return }
            committed = .some(value)
            onCommit()
        }
    }

    /// Empty is `nil`, and a comma is a decimal point. A decimal pad on a
    /// German or Hebrew keyboard emits `,` — `Double(",5")` is nil, so a typed
    /// half kilo would silently clear the field.
    private static func parse(_ text: String) -> Double? {
        let cleaned = text.replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty ? nil : Double(cleaned)
    }

    private static func format(_ value: Double?, _ fractionLength: Int) -> String {
        guard let value else { return "" }
        return value.formatted(.number.precision(.fractionLength(0...fractionLength)).grouping(.never))
    }
}

/// A figure a rung is holding: shown, never editable.
///
/// Deliberately NOT a disabled `TextField`. A greyed-out field says "this is
/// yours and something is temporarily wrong"; a plain value says "this is the
/// rung's answer", which is the truth. The way back to editing is choosing "My
/// own numbers", and the section footer says so.
struct HelixHeldRow: View {
    let label: String
    let value: Double?
    var unit: String?

    var body: some View {
        LabeledContent {
            HStack(spacing: 6) {
                Text(value.map { $0.formatted(.number.precision(.fractionLength(0))) } ?? "—")
                    .helixNumeral()
                    .foregroundStyle(Color.helix.textPrimary)
                if let unit {
                    Text(unit)
                        .foregroundStyle(Color.helix.textTertiary)
                        .accessibilityHidden(true)
                }
            }
        } label: {
            Text(label)
        }
        .accessibilityLabel(unit == nil ? label : "\(label), \(unit!)")
    }
}

/// The keyboard's own Done button.
///
/// A decimal pad has no return key, so a field on one can only be committed by
/// tapping elsewhere — which on a `Form` means tapping a control the user did
/// not mean to touch.
struct HelixKeyboardDone: ToolbarContent {
    let dismiss: () -> Void

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("Done", action: dismiss)
        }
    }
}
