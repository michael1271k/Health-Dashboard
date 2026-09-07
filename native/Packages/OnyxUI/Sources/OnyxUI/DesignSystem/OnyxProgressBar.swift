import SwiftUI

/// A fraction, drawn.
///
/// One hue, hairline track to solid fill — magnitude, which is the one job a
/// sequential encoding has. It is 4 pt tall because it is read beside the
/// numbers it summarises rather than instead of them, and it is hidden from
/// VoiceOver for the same reason: the fraction is already spoken by the row
/// above it, and a bar that announced itself would say it twice.
public struct OnyxProgressBar: View {
    private let fraction: Double
    private let tint: Color

    public init(fraction: Double, tint: Color) {
        self.fraction = fraction
        self.tint = tint
    }

    public var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.onyx.hairline)
                Capsule()
                    .fill(tint)
                    .frame(width: proxy.size.width * min(max(fraction, 0), 1))
            }
        }
        .frame(height: 4)
        .animation(OnyxMotion.counter, value: fraction)
        .accessibilityHidden(true)
    }
}
