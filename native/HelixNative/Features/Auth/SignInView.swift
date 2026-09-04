import SwiftUI
import HelixUI

/// Sign-in. One screen, seen once per install.
///
/// ── NO CREDENTIAL IS BAKED INTO THIS BUILD ──────────────────────────────────
/// The web app shipped `NEXT_PUBLIC_DEV_EMAIL` / `NEXT_PUBLIC_DEV_PASSWORD`
/// behind a single "Continue as Michael" button, which inlined the account
/// password into every client bundle it served. That is the thing this screen
/// exists not to do. The fields carry `.username` and `.password` content types,
/// so iOS Password AutoFill offers the saved credential as one tap — the same
/// convenience, from the Keychain rather than from the binary.
///
/// The session then persists in the Keychain (`KeychainAuthStorage`), not in
/// UserDefaults, which is the other half of the same argument.
///
/// ── WHAT AUTOFILL STILL NEEDS, AND WHY IT IS NOT HERE YET ───────────────────
/// The content types above are enough for iOS to OFFER to save a credential and
/// to fill one already associated with this app. Filling the credential saved
/// against the WEBSITE — the one the browser holds for helix.health — needs an
/// `Associated Domains` entitlement (`webcredentials:<domain>`) and an
/// `apple-app-site-association` file served from that domain. Associated Domains
/// is a paid-membership capability, so the entitlement cannot be added to
/// `project.yml` before Gate 0 without failing the build for everyone. It is one
/// line when the membership lands; the AASA file is already served (Netlify
/// today, a static host at Wave 9).
struct SignInView: View {
    @Environment(AppEnvironment.self) private var environment

    @State private var email = ""
    @State private var password = ""
    @State private var isWorking = false
    @State private var error: String?
    /// Counts ATTEMPTS, not messages. Keying the haptic on the error string
    /// means two identical failures in a row buzz once.
    @State private var attempt = 0
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && !isWorking
    }

    var body: some View {
        // A `VStack` with two `Spacer`s cannot scroll, and at the largest
        // accessibility size with the keyboard up it pushes the password field
        // and the button off the bottom with no way to reach them.
        GeometryReader { proxy in
            ScrollView {
                content
                    .padding(HelixSpace.xl)
                    // The two `Spacer`s centre the card only when the stack has
                    // a height to fill; inside a scroll view they would collapse
                    // to nothing and the form would sit under the status bar.
                    // This gives it the screen's height as a FLOOR, so it centres
                    // when it fits and scrolls when it does not.
                    .frame(minWidth: proxy.size.width, minHeight: proxy.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .helixScreen(.train)
        // The email field takes focus on appear, which is what raises the
        // QuickType bar carrying the AutoFill suggestion. Without it the saved
        // credential is one tap further away than it needs to be.
        .onAppear { focused = .email }
        .sensoryFeedback(.error, trigger: attempt) { _, _ in error != nil }
    }

    private var content: some View {
        VStack(spacing: HelixSpace.xl) {
            Spacer()

            VStack(spacing: 8) {
                // The mark itself, not a stand-in symbol: this is the one
                // screen with room for it at full size, and `OnyxMark` already
                // carries the Lunar → Ion ramp the app icon is lit with.
                OnyxMark(size: 44, opacity: 1)
                Text("HELIX")
                    .font(.largeTitle.weight(.black))
                    .tracking(6)
                    .foregroundStyle(Color.helix.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("Engineer Your Ascent.")
                    .font(.footnote)
                    .foregroundStyle(Color.helix.textSecondary)
            }

            VStack(spacing: 0) {
                field("Email") {
                    TextField("you@example.com", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focused, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focused = .password }
                }
                Divider().overlay(Color.helix.hairline)
                field("Password") {
                    SecureField("Required", text: $password)
                        .textContentType(.password)
                        .textInputAutocapitalization(.never)
                        .focused($focused, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { submit() }
                }
            }
            .helixGlass(.tile)

            Button(action: submit) {
                Group {
                    if isWorking {
                        ProgressView().tint(Color.helix.base)
                    } else {
                        Text("Sign in").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.borderedProminent)
            .tint(HelixDomain.train.accent)
            .foregroundStyle(Color.helix.base)
            .controlSize(.large)
            .disabled(!canSubmit)

            // Reserved space, not a conditional row: a message that appears by
            // pushing the button down moves the control the user is aiming at,
            // which on a failed attempt is the moment they are most likely to
            // tap again.
            Text(error ?? " ")
                .font(.footnote)
                .foregroundStyle(Color.helix.danger)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 34, alignment: .top)
                .accessibilityHidden(error == nil)

            Spacer()

            Text("You stay signed in on this device.")
                .font(.caption2)
                .foregroundStyle(Color.helix.textTertiary)
        }
    }

    /// A labelled row. `LabeledContent` is the stock answer and it is the wrong
    /// one here: it puts the label and the field on one line and hands the field
    /// whatever width is left, which at AX5 leaves about four characters.
    @ViewBuilder
    private func field(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.helix.textSecondary)
            content()
                .foregroundStyle(Color.helix.textPrimary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func submit() {
        guard canSubmit else { return }
        isWorking = true
        error = nil
        Task {
            do {
                try await environment.signIn(email: email, password: password)
                // No navigation here on purpose. `AppEnvironment` observes the
                // auth stream and `RootView` switches on it, so the screen
                // changes because the session changed — never because a button
                // decided it had.
                attempt += 1
            } catch {
                attempt += 1
                // `String(describing:)` on a Supabase error prints the enum case
                // and its associated values, which is a stack trace to a person
                // trying to log in. The underlying text is kept for the one case
                // that is actionable — a wrong password says so.
                let message = Self.message(for: error)
                self.error = message
                // The message appears in a reserved band that VoiceOver is not
                // looking at, so a failed sign-in was silent to it.
                AccessibilityNotification.Announcement(message).post()
            }
            isWorking = false
        }
    }

    private static func message(for error: any Error) -> String {
        let text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        return text.isEmpty ? "Sign-in failed. Check the email and password." : text
    }
}

#if DEBUG
#Preview("Sign in") {
    SignInView().environment(AppEnvironment.preview)
}
#endif
