import SwiftUI
import OnyxUI
import OnyxData

/// The one thing this app writes without being asked, said out loud.
///
/// ── WHY A TOAST AND NOT A BANNER IN THE LIST ────────────────────────────────
/// Every other `OnyxBanner` in this app is a row in the content: it is about
/// something that is still true and still needs doing — a failed write, a blank
/// weigh-in — so it stays until the state changes. This is about something that
/// has ALREADY happened and needs nothing. A permanent row for finished news is
/// how a screen fills up with acknowledgements.
///
/// So it is the same banner, floated and timed. The banner is reused rather
/// than restyled because "what this app's notices look like" is one answer, and
/// a bespoke capsule here would be the fourth spelling `OnyxBanner` was written
/// to end.
///
/// ── AND WHY IT DOES NOT BLOCK ───────────────────────────────────────────────
/// It sits over the top of the scroll view, does not take the tap, and leaves
/// on its own. The founder's brief asked for "brief, elegant, non-blocking" and
/// the last of those is the load-bearing one: a walk being imported is not
/// worth a tap to dismiss, and an alert for it would be the app congratulating
/// itself in front of the screen you opened.
private struct CardioToast: ViewModifier {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    func body(content: Content) -> some View {
        content.overlay(alignment: .top) {
            if let report = environment.sync.cardioNotice {
                OnyxBanner(
                    tone: .notice,
                    title: Self.title(report),
                    message: Self.message(report)
                )
                .padding(.horizontal, OnyxSpace.l)
                // Below the navigation bar rather than under it: a notice
                // half-hidden by a translucent toolbar is one nobody reads.
                .padding(.top, OnyxSpace.s)
                // The overlay must not eat a tap meant for the card beneath it.
                .allowsHitTesting(false)
                .transition(
                    reduceMotion
                        ? .opacity
                        : .move(edge: .top).combined(with: .opacity)
                )
                .task(id: report) {
                    // ── SPOKEN, NOT JUST DRAWN ──────────────────────────────
                    // The overlay takes no hit testing and removes itself, so
                    // focus never reaches it: a VoiceOver user got no notice at
                    // all for the one write this app makes unasked. An
                    // announcement is the only way to say something that is
                    // already over.
                    AccessibilityNotification.Announcement(Self.title(report)).post()
                    // Four seconds: long enough to read two short lines at a
                    // glance, short enough that it is gone before you have
                    // decided whether to care. Cancelled by `task(id:)` if a
                    // second ingest lands first, which re-arms the timer rather
                    // than leaving the first one's deadline in charge.
                    //
                    // Doubled under VoiceOver, where four seconds is shorter
                    // than it takes to swipe to the thing being described.
                    try? await Task.sleep(for: .seconds(voiceOver ? 8 : 4))
                    guard !Task.isCancelled else { return }
                    withAnimation(OnyxMotion.move) { environment.sync.clearCardioNotice() }
                }
                .accessibilityAddTraits(.isStaticText)
            }
        }
        .animation(OnyxMotion.move, value: environment.sync.cardioNotice)
    }

    /// "3 workouts synced from Apple Health".
    ///
    /// Counts what was INSERTED, never what was merely annotated. A row that
    /// already existed and gained a heart rate is not a workout this app
    /// synced, and claiming three when one of them was already on the screen is
    /// the small dishonesty that makes the next notice unreadable.
    static func title(_ report: CardioIngestReport) -> String {
        switch (report.inserted, report.filled) {
        case (0, let filled):
            return filled == 1 ? "A bout was filled in" : "\(filled) bouts were filled in"
        case (1, _):
            return "1 workout synced from Apple Health"
        case (let inserted, _):
            return "\(inserted) workouts synced from Apple Health"
        }
    }

    /// The second line exists only when there is a second fact. A message that
    /// restates the title is a line people learn to skip.
    static func message(_ report: CardioIngestReport) -> String? {
        guard report.inserted > 0, report.filled > 0 else {
            return report.inserted > 0 ? nil : "Heart rate, ascent and total energy, added to what you logged."
        }
        return report.filled == 1
            ? "One bout you logged gained its heart rate and ascent."
            : "\(report.filled) bouts you logged gained their heart rate and ascent."
    }
}

extension View {
    /// Put the cardio-ingest notice over this screen.
    ///
    /// Applied to Train and Pulse only — the two tabs a bout is ABOUT. Today is
    /// a dashboard of everything and would carry this notice alongside five
    /// other claims; Nutrition and Settings have nothing to do with a walk.
    func cardioIngestNotice() -> some View { modifier(CardioToast()) }
}
