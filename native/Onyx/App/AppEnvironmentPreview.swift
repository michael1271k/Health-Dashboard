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
    /// ONE instance, not one per access. `.environment(AppEnvironment.preview)`
    /// is written on every harness screen, and a computed property handed
    /// SwiftUI a new object on every body evaluation — a new environment, a
    /// new store, a re-rendered tree, and a model whose observation belonged
    /// to the previous evaluation. Since W2 the settings screens READ their
    /// catalogue through that observation, so the churn photographed an empty
    /// plan. A `static let` is what a preview environment always meant.
    @MainActor static let preview: AppEnvironment = {
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
        // The catalogue as rows (W2) and a resolver over it, so week labels,
        // day labels and the rungs read the same way they do signed in.
        PreviewCatalogue.seed(environment.database)
        environment.installPreviewTargets(userId: PreviewCatalogue.userId)
        return environment
    }()
}
#endif
