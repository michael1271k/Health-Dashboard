import SwiftUI
import OnyxUI

/// Create an account. `SignInView`'s twin, and deliberately its near-copy.
///
/// ── WHY THIS SCREEN EXISTS AT ALL ───────────────────────────────────────────
/// The project ran with sign-up disabled and one hand-made account for its whole
/// life. App Review will not accept that: an app that gates its content behind a
/// login has to let a reviewer make an account (2.1), and an app that lets you
/// make one in the app has to let you delete it in the app (5.1.1(v)). Both
/// halves land in this wave — this screen and the `delete_my_account` RPC behind
/// Settings.
///
/// ── THE CONFIRMATION STATE IS THE WHOLE DESIGN ──────────────────────────────
/// Email confirmation is ON. So the successful case here does NOT sign anybody
/// in: `supabase.auth.signUp` returns a user with no session, `authStateChanges`
/// stays quiet, and `RootView` never moves. A screen that just dismissed itself
/// on success would drop the user back on the sign-in form having apparently
/// done nothing, and they would try again — and hit the rate limiter. So success
/// swaps this form for a "check your inbox" state that stays put until the user
/// dismisses it themselves.
///
/// The one case where a session DOES arrive (confirmation turned off, or an
/// address already confirmed) needs no handling: `signUp` reports it, and
/// `RootView` has already switched by the time this view would have reacted.
struct SignUpView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var isWorking = false
    @State private var error: String?
    /// Set once the account exists and the mail is on its way. One-way.
    @State private var sent = false
    @State private var attempt = 0
    @FocusState private var focused: Field?

    private enum Field { case email, password, confirm }

    /// Apple's own minimum is 6; Supabase's default is 6. Stating it up front
    /// beats a server round-trip that comes back "Password should be at least
    /// 6 characters" after the user has already committed to one.
    private static let minPassword = 8

    private var mismatch: Bool { !confirm.isEmpty && confirm != password }
    private var tooShort: Bool { !password.isEmpty && password.count < Self.minPassword }

    private var canSubmit: Bool {
        !email.isEmpty && password.count >= Self.minPassword
            && confirm == password && !isWorking
    }

    var body: some View {
        // ── THE DISMISS IS A TOOLBAR ITEM, NOT AN OVERLAY ───────────────────
        // It was `.overlay(alignment: .topTrailing)` with a `.footnote` button.
        // Two things wrong with that, and both only show up on a real device.
        //
        // A floating button sits OUTSIDE the scroll view's coordinate space, so
        // the form — which scrolls the moment the keyboard is up on anything
        // shorter than a Pro Max, and always at the larger accessibility sizes
        // — slides its heading and its mark straight under a control with no
        // background behind it. Two pieces of text, same pixels, neither
        // readable.
        //
        // And a `.footnote` label with no frame is a ~30 pt hit target where
        // the HIG minimum is 44. A `cancellationAction` toolbar item gets the
        // platform's own hit area, the platform's own placement inside the
        // sheet's safe area, a bar material for the content to pass under, and
        // the leading position VoiceOver expects to reach first — none of which
        // is worth hand-rolling.
        NavigationStack {
            GeometryReader { proxy in
                ScrollView {
                    (sent ? AnyView(confirmation) : AnyView(form))
                        .padding(OnyxSpace.xl)
                        .frame(minWidth: proxy.size.width, minHeight: proxy.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
            }
            .onyxScreen(.train)
            // The screen carries its own heading in the content; a second one
            // in the bar would say it twice, to VoiceOver as well as on screen.
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .onAppear { focused = .email }
        .sensoryFeedback(.error, trigger: attempt) { _, _ in error != nil }
    }

    private var form: some View {
        VStack(spacing: OnyxSpace.xl) {
            Spacer()

            VStack(spacing: 8) {
                OnyxMark(size: 44, opacity: 1)
                Text("Create your account")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Color.onyx.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("Engineer Your Ascent.")
                    .font(.footnote)
                    .foregroundStyle(Color.onyx.textSecondary)
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
                Divider().overlay(Color.onyx.hairline)
                field("Password") {
                    // `.newPassword`, not `.password`: this is what makes iOS
                    // offer to GENERATE and save a strong one rather than
                    // offering an existing credential to fill.
                    SecureField("At least \(Self.minPassword) characters", text: $password)
                        .textContentType(.newPassword)
                        .textInputAutocapitalization(.never)
                        .focused($focused, equals: .password)
                        .submitLabel(.next)
                        .onSubmit { focused = .confirm }
                }
                Divider().overlay(Color.onyx.hairline)
                field("Confirm password") {
                    SecureField("Type it again", text: $confirm)
                        .textContentType(.newPassword)
                        .textInputAutocapitalization(.never)
                        .focused($focused, equals: .confirm)
                        .submitLabel(.go)
                        .onSubmit { submit() }
                }
            }
            .onyxGlass(.tile)

            Button(action: submit) {
                Group {
                    if isWorking {
                        ProgressView().tint(Color.onyx.base)
                    } else {
                        Text("Create account").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 28)
            }
            .buttonStyle(.borderedProminent)
            .tint(OnyxDomain.train.accent)
            .foregroundStyle(Color.onyx.base)
            .controlSize(.large)
            .disabled(!canSubmit)

            // Reserved space, so a message never moves the button the user is
            // aiming at. The local checks pre-empt the two round-trips that
            // would otherwise be spent learning them.
            Text(error ?? localHint ?? " ")
                .font(.footnote)
                .foregroundStyle(error != nil ? Color.onyx.danger : Color.onyx.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 34, alignment: .top)
                .accessibilityHidden(error == nil && localHint == nil)

            Spacer()

            Text("We'll email you a link to confirm the address.")
                .font(.caption2)
                .foregroundStyle(Color.onyx.textTertiary)
                .multilineTextAlignment(.center)
        }
    }

    private var localHint: String? {
        if mismatch { return "The two passwords do not match." }
        if tooShort { return "At least \(Self.minPassword) characters." }
        return nil
    }

    /// The success state. It does NOT auto-dismiss: the next step happens in a
    /// mail client, and a screen that vanished would leave no trace of what the
    /// user is now waiting for.
    private var confirmation: some View {
        VStack(spacing: OnyxSpace.xl) {
            Spacer()
            // `OnyxMark`'s own size, expressed the way the sign-in screen
            // expresses it — a literal `.system(size:)` is what
            // `native-token-discipline.test.ts` exists to catch.
            Image(systemName: "envelope.badge")
                .font(.largeTitle)
                .foregroundStyle(OnyxDomain.train.accent)
                .accessibilityHidden(true)
            VStack(spacing: 8) {
                Text("Check your inbox")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Color.onyx.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("We sent a confirmation link to \(email). Open it, then sign in.")
                    .font(.footnote)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .multilineTextAlignment(.center)
            }
            Button("Back to sign in") { dismiss() }
                .buttonStyle(.borderedProminent)
                .tint(OnyxDomain.train.accent)
                .foregroundStyle(Color.onyx.base)
                .controlSize(.large)
            Spacer()
        }
    }

    @ViewBuilder
    private func field(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.onyx.textSecondary)
            content()
                .foregroundStyle(Color.onyx.textPrimary)
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
                let needsConfirmation = try await environment.signUp(email: email, password: password)
                attempt += 1
                if needsConfirmation {
                    sent = true
                    AccessibilityNotification.Announcement(
                        "Account created. Check your inbox for a confirmation link."
                    ).post()
                }
                // Otherwise a session already arrived and `RootView` has moved
                // on; there is nothing for this screen to do.
            } catch {
                attempt += 1
                let message = Self.message(for: error)
                self.error = message
                AccessibilityNotification.Announcement(message).post()
            }
            isWorking = false
        }
    }

    private static func message(for error: any Error) -> String {
        let text = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        return text.isEmpty ? "Could not create the account. Try again." : text
    }
}

#if DEBUG
#Preview("Sign up") {
    SignUpView().environment(AppEnvironment.preview)
}
#endif
