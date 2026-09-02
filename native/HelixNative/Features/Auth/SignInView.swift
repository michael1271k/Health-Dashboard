import SwiftUI

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
struct SignInView: View {
    @Environment(AppEnvironment.self) private var environment

    @State private var email = ""
    @State private var password = ""
    @State private var isWorking = false
    @State private var error: String?
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    private var canSubmit: Bool {
        !email.isEmpty && !password.isEmpty && !isWorking
    }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 6) {
                Image(systemName: "helm")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(.tint)
                Text("HELIX")
                    .font(.largeTitle.weight(.black))
                    .tracking(6)
                Text("Engineer Your Ascent.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focused = .password }

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .focused($focused, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { submit() }
            }
            .textFieldStyle(.roundedBorder)

            Button(action: submit) {
                if isWorking {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Sign in").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!canSubmit)

            if let error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            Text("You stay signed in on this device.")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(28)
        .background(Color(.systemBackground))
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
            } catch {
                self.error = String(describing: error)
            }
            isWorking = false
        }
    }
}
