import SwiftUI
import OnyxUI

/// A session's meta line as capsules rather than as a sentence.
///
/// ── WHY THE FOOTER BLOB HAD TO GO (§U4.3) ───────────────────────────────────
/// It was one `Text`: `"top 40 kg × 11 · 29 reps · 1,160 kg · RPE 8.7 · prev
/// 30 Aug"`. Five independent readings joined by middots into a single 13 pt
/// grey line, set in the same style as the caption above it — so nothing in it
/// could be found without reading all of it, the numbers wrapped mid-figure at
/// an accessibility size, and the one item that carries a VERDICT (the
/// comparison against the previous session) looked exactly like the four that
/// carry a fact.
///
/// Capsules fix all four at once: each reading is its own object with its own
/// bounds, `FlowRow` wraps between them rather than inside them, and a tint is
/// available to the one item that has earned one without repainting the rest.
///
/// ── AND WHY 24 PT IS A FLOOR, NOT A HEIGHT ──────────────────────────────────
/// §U4.3 asks for 24 pt capsules, which is right at the default type size and
/// is a clipped label at AX5 — the trap [[logger-chrome-u1]] records twice. So
/// the frame is a `minHeight` and the padding is what actually sets the shape;
/// a capsule grows with its text and the row grows with it.
struct MetaTagRow: View {

    /// One reading. `tint` is nil for a plain fact — the four that are just
    /// numbers — and set only where the value means something beyond itself.
    struct Tag: Identifiable {
        let id = UUID()
        let text: String
        /// Drawn before the text at `micro`, scaling with the type.
        let symbol: String?
        let tint: Color?

        init(_ text: String, symbol: String? = nil, tint: Color? = nil) {
            self.text = text
            self.symbol = symbol
            self.tint = tint
        }
    }

    let tags: [Tag]

    var body: some View {
        FlowRow(spacing: OnyxSpace.xs) {
            ForEach(tags) { tag in
                capsule(tag)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tags.map(\.text).joined(separator: ", "))
    }

    private func capsule(_ tag: Tag) -> some View {
        let tint = tag.tint
        return HStack(spacing: OnyxSpace.xs) {
            if let symbol = tag.symbol {
                Image(systemName: symbol)
                    .onyxType(.micro)
                    .foregroundStyle(tint ?? Color.onyx.textTertiary)
            }
            Text(tag.text)
                // Monospaced digits, always: these sit in a row that redraws
                // between two sessions, and proportional figures make the whole
                // line shuffle sideways when a 1,160 becomes a 1,240.
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(tint ?? Color.onyx.textSecondary)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .padding(.horizontal, OnyxSpace.s)
        .padding(.vertical, OnyxSpace.xs)
        .frame(minHeight: 24)
        // A plain fact gets the hairline; a tinted one gets its own colour at
        // the same weight the tag row on the title band uses, so the two rows
        // on this page read as one family.
        .background(
            (tint?.opacity(0.16) ?? Color.onyx.hairline.opacity(0.55)),
            in: .capsule
        )
        .accessibilityHidden(true)
    }
}

#if DEBUG
#Preview("Meta tags") {
    MetaTagRow(tags: [
        .init("Top 40 kg × 11"),
        .init("29 reps"),
        .init("1,160 kg"),
        .init("RPE 8.7"),
        .init("vs 30 Aug", symbol: "arrowtriangle.up.fill", tint: Color.onyx.good),
    ])
    .padding()
    .onyxScreen(.train)
}
#endif
