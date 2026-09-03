import Foundation
import Observation
import Supabase
import HelixCore
import HelixData

/// Everything the app needs, resolved once at launch.
///
/// ── WHY THIS IS ONE OBJECT AND NOT A PILE OF SINGLETONS ─────────────────────
/// The web app's equivalent state is spread across a react-query client, a
/// Supabase client module, 24 `localStorage` keys and four provider components,
/// and the recurring bug class there is two of them disagreeing — a cache that
/// says signed-in while the session is gone, a schedule store read during render
/// that React cannot see. One owned object with one source of truth for each
/// fact removes that class rather than managing it.
@MainActor
@Observable
public final class AppEnvironment {

    public enum AuthState: Equatable {
        /// Reading the Keychain. Sub-millisecond, but it is a real state and
        /// pretending otherwise is what produces a flash of the wrong screen.
        case resolving
        case signedIn(userID: UUID)
        case signedOut
    }

    public private(set) var auth: AuthState = .resolving
    /// A launch failure worth showing rather than crashing on — a missing
    /// `Secrets.xcconfig` is the overwhelmingly likely cause and the message
    /// says so.
    public private(set) var startupError: String?

    public let database: AppDatabase
    public let supabase: SupabaseClient

    private var authTask: Task<Void, Never>?

    public init(database: AppDatabase, supabase: SupabaseClient) {
        self.database = database
        self.supabase = supabase
    }

    /// Build the real environment. Throws only for a configuration problem the
    /// user can fix.
    public static func live() throws -> AppEnvironment {
        let config = try SupabaseConfig.fromBundle()
        let folder = URL.applicationSupportDirectory.appending(path: "Helix", directoryHint: .isDirectory)
        return AppEnvironment(
            database: try AppDatabase.onDisk(folderURL: folder),
            supabase: HelixSupabase.makeClient(config: config)
        )
    }

    /// Resolve the persisted session, then follow auth changes for the life of
    /// the app.
    ///
    /// The stream is the only writer of `auth`. Sign-in and sign-out below do
    /// not set it themselves — they perform the action and let the stream report
    /// what actually happened, so the UI can never show a state the auth client
    /// disagrees with.
    public func start() {
        guard authTask == nil else { return }
        authTask = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in self.supabase.auth.authStateChanges {
                guard event != .initialSession || session != nil else {
                    self.auth = .signedOut
                    continue
                }
                self.auth = session.map { .signedIn(userID: $0.user.id) } ?? .signedOut
            }
        }
    }

    public func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
    }

    public func signOut() async {
        // A failed sign-out must still clear local state, or the user is stuck
        // on a screen with no way forward.
        try? await supabase.auth.signOut()
        auth = .signedOut
    }

    /// The signed-in user's id as the store spells it.
    ///
    /// `workout_sessions.user_id` is NOT NULL in Postgres, so a session row has
    /// to carry one from the moment it is created — before any sync exists to
    /// supply it. Signed out, there is no session to open and nothing calls
    /// this; the empty string is the honest answer rather than a placeholder
    /// uuid that would later have to be found and corrected.
    public var userIdString: String {
        if case .signedIn(let userID) = auth { return userID.uuidString }
        return ""
    }

    public func reportStartupError(_ message: String) {
        startupError = message
    }
}
