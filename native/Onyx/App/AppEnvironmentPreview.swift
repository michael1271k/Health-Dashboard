#if DEBUG
import Foundation
import OnyxData

/// The environment a `#Preview` and the screenshot loop run against.
///
/// ── WHY IT IS AN IN-MEMORY DATABASE AND A DEAD CLIENT ───────────────────────
/// A preview that reads the real store shows whatever happens to be on the
/// machine that renders it, which makes the screenshots in
/// `native/__screenshots__` a diff of the author's training week rather than of
/// the UI. An in-memory database starts empty and deterministic, and every
/// preview that needs rows seeds exactly the ones it is demonstrating.
///
/// The Supabase client points at a URL that does not resolve, on purpose: a
/// preview must never reach the network, and a client that cannot is a stronger
/// guarantee than remembering not to call it.
///
/// `#if DEBUG` so none of this is in the shipped binary.
extension AppEnvironment {
    static var preview: AppEnvironment {
        let environment = AppEnvironment(
            database: try! AppDatabase.inMemory(deviceId: "preview"),
            supabase: OnyxSupabase.makeClient(config: SupabaseConfig(
                url: URL(string: "https://preview.invalid")!,
                anonKey: "preview"
            ))
        )
        // A sync that finished a moment ago, so the "Synced 2s ago" caption is
        // IN the screenshot. A preview whose sync has never run photographs the
        // one state where the caption is absent by design, which is the state
        // least worth having a picture of.
        environment.sync.seedForPreview(secondsAgo: 12)
        return environment
    }
}
#endif
