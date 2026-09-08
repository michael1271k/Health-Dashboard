import Foundation
import Supabase

/// Where the app's Supabase credentials come from.
///
/// Read from the target's `Info.plist`, which is populated from a **gitignored**
/// `Secrets.xcconfig`. This mirrors how the widget extension already sources
/// `ONYX_SNAPSHOT_URL` / `ONYX_SNAPSHOT_TOKEN`, so there is one convention for
/// secrets across both apps rather than two.
///
/// The anon key is not a secret in the sense a password is — it is designed to
/// ship in clients and RLS is what actually protects the data. It stays out of
/// git anyway, because the project URL plus the key is a convenient handle for
/// anyone probing the database, and there is no upside to publishing it.
public struct SupabaseConfig: Sendable {
    public let url: URL
    public let anonKey: String

    public init(url: URL, anonKey: String) {
        self.url = url
        self.anonKey = anonKey
    }

    public enum ConfigError: Error, CustomStringConvertible {
        case missing(String)

        public var description: String {
            switch self {
            case .missing(let key):
                return """
                \(key) is not set. Copy native/Onyx/Support/Secrets.example.xcconfig \
                to Secrets.xcconfig, fill it in, and rebuild. It is gitignored on purpose.
                """
            }
        }
    }

    /// Read from a bundle's `Info.plist`.
    public static func fromBundle(_ bundle: Bundle = .main) throws -> SupabaseConfig {
        guard let raw = bundle.object(forInfoDictionaryKey: "ONYX_SUPABASE_URL") as? String,
              !raw.isEmpty,
              // xcconfig cannot express `//` (it starts a comment), so the scheme
              // is stored separately and glued back on here. This is the standard
              // workaround and the reason the plist value has no "https://".
              let url = URL(string: raw.hasPrefix("http") ? raw : "https://\(raw)")
        else { throw ConfigError.missing("ONYX_SUPABASE_URL") }

        guard let key = bundle.object(forInfoDictionaryKey: "ONYX_SUPABASE_ANON_KEY") as? String,
              !key.isEmpty
        else { throw ConfigError.missing("ONYX_SUPABASE_ANON_KEY") }

        return SupabaseConfig(url: url, anonKey: key)
    }
}

/// The app's single Supabase client.
///
/// Auth persistence is the Keychain (`KeychainAuthStorage`); token refresh is
/// supabase-swift's own, which is the main reason this is a dependency rather
/// than hand-rolled URLSession calls.
public enum OnyxSupabase {
    public static func makeClient(
        config: SupabaseConfig,
        storage: any AuthLocalStorage = KeychainAuthStorage()
    ) -> SupabaseClient {
        SupabaseClient(
            supabaseURL: config.url,
            supabaseKey: config.anonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    storage: storage,
                    autoRefreshToken: true,
                    // ── WHY THIS OPT-IN IS ON ───────────────────────────────
                    // Left at its default `false`, supabase-swift 2.55 tries to
                    // REFRESH the stored session before it emits
                    // `.initialSession`, and says so on every launch:
                    //
                    //   "Initial session emitted after attempting to refresh the
                    //    local stored session. This is incorrect behavior and
                    //    will be fixed in the next major release…"
                    //
                    // It is a `reportIssue`, so it is a purple runtime warning in
                    // Xcode rather than a build one, and it is the behaviour the
                    // next major version drops. `true` emits what the Keychain
                    // holds immediately and refreshes behind it.
                    //
                    // ── AND WHY THAT IS SAFE FOR THIS APP ───────────────────
                    // `AppEnvironment`'s `authStateChanges` loop only reads
                    // `session != nil` and `session.user.id`, so an expired
                    // session paints the signed-in shell one launch early and
                    // the refresh that follows either confirms it or emits
                    // `.signedOut`, which the same loop already handles. That is
                    // the trade `AuthGate.hasPersistedSession()` already makes on
                    // the web: paint on the stored token, correct in the
                    // background. Nothing here gates DATA on the initial event —
                    // RLS does, and an expired token simply reads nothing until
                    // the refresh lands.
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }
}
