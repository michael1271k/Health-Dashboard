// ── iOS ONLY ────────────────────────────────────────────────────────────────
// `.textSelection(.enabled)` is unavailable on watchOS, and a banner you are
// meant to select text out of is a phone affordance either way.
#if os(iOS)

import SwiftUI

/// One row that says something went wrong, or that something is waiting.
///
/// ── WHY THIS IS ONE VIEW AND NOT THREE ──────────────────────────────────────
/// The Live Logger, Pulse and Nutrition each grew their own failure row: the
/// logger's has a title and a detail and is selectable so the error can be
/// copied; the other two are a bare `Label` with the raw string in it. Three
/// spellings of the same idea means the next one is a fourth, and it means a
/// change to how this app reports a failure has to be made in three places and
/// will be made in two.
///
/// ── AND WHY A BANNER, NOT AN ALERT ──────────────────────────────────────────
/// From the logger's own note, which is the rule for all of them: the work is
/// still on screen and still correct, the outbox will retry, and a modal
/// between you and the next set costs more than the failure does. What must
/// never happen is the failure being invisible.
public struct OnyxBanner: View {
    public enum Tone: Sendable {
        /// Something is waiting for you. Not a failure — the app is fine.
        case notice
        /// A write did not land. Red, and the text is selectable so it can be
        /// pasted into a bug report.
        case failure

        var symbol: String {
            switch self {
            case .notice: "sparkles"
            case .failure: "exclamationmark.triangle.fill"
            }
        }

        var ink: Color {
            switch self {
            case .notice: OnyxDomain.body.accent
            case .failure: Color.onyx.danger
            }
        }
    }

    let tone: Tone
    let title: String
    let message: String?
    let actionLabel: String?
    let action: (() -> Void)?

    public init(
        tone: Tone,
        title: String,
        message: String? = nil,
        actionLabel: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.tone = tone
        self.title = title
        self.message = message
        self.actionLabel = actionLabel
        self.action = action
    }

    public var body: some View {
        if let action {
            Button(action: action) { row }
                .buttonStyle(OnyxPressStyle())
                .accessibilityLabel([title, message, actionLabel].compactMap { $0 }.joined(separator: ", "))
        } else {
            row
        }
    }

    private var row: some View {
        HStack(alignment: .top, spacing: OnyxSpace.m) {
            Image(systemName: tone.symbol)
                .onyxType(.body)
                // The glyph is a fixed mark, not copy: at AX5 a scaling symbol
                // pushes the sentence it labels off the row.
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .foregroundStyle(tone.ink)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .onyxType(.secondary).fontWeight(.semibold)
                    .foregroundStyle(tone == .failure ? Color.onyx.danger : Color.onyx.textPrimary)
                if let message {
                    Text(message)
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textSecondary)
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let actionLabel {
                Text(actionLabel)
                    .onyxType(.caption).fontWeight(.semibold)
                    .foregroundStyle(tone.ink)
            } else if action != nil {
                Image(systemName: "chevron.right")
                    .onyxType(.caption).fontWeight(.semibold)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OnyxSpace.m)
        .onyxGlass(.row)
        // A failure the user cannot copy is a failure they have to transcribe.
        .textSelection(.enabled)
        .accessibilityElement(children: .combine)
    }
}

#if DEBUG
#Preview("Banners") {
    VStack(spacing: OnyxSpace.m) {
        OnyxBanner(
            tone: .notice,
            title: "Weigh-in landed",
            message: "Health has your weight. Muscle and water are still blank.",
            actionLabel: "Enter",
            action: {}
        )
        OnyxBanner(tone: .failure, title: "Not saved locally", message: "SQLITE_FULL: database or disk is full")
        OnyxBanner(tone: .failure, title: "Could not write the day.")
    }
    .padding(OnyxSpace.l)
    .onyxScreen(.recover)
}
#endif

#endif
