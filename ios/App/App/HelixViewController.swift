import UIKit
import Capacitor

/// Capacitor ≥6 does NOT auto-discover app-local plugins — `registerPlugins()`
/// only loads the built-ins plus classes named in `capacitor.config.json`'s
/// `packageClassList`, which the CLI regenerates from npm packages on every
/// `cap sync`. Our two hand-written plugins compile into the binary but were
/// never attached to the bridge, so every JS call rejected silently.
///
/// This subclass is the supported registration hook: `capacitorDidLoad()` runs
/// right after the bridge is created (see CAPBridgeViewController.loadView),
/// before the web view loads, so the plugins are live by first JS call.
/// Wired in via Main.storyboard (customClass = HelixViewController).
class HelixViewController: CAPBridgeViewController {
  override func capacitorDidLoad() {
    bridge?.registerPluginInstance(HealthkitPlugin())
    // Lets the web layer call `WidgetCenter.reloadAllTimelines()` after a sync
    // or a commit — see src/lib/native/widgets.ts. Without registration the
    // call would reject silently, which is exactly the failure the comment
    // above this method describes.
    bridge?.registerPluginInstance(HelixWidgetsPlugin())
    // The running workout on the Lock Screen and in the Dynamic Island. Unlike
    // the home-screen widgets this one is PUSHED from the app: a Live Activity's
    // content travels through ActivityKit rather than a shared container, so the
    // App Group constraint that forces every other widget to fetch for itself
    // does not apply. See src/lib/native/liveActivity.ts.
    bridge?.registerPluginInstance(HelixLiveActivityPlugin())
    // SecureStore (Keychain session persistence) was retired: the web app no longer
    // calls it (auth is a one-tap re-login). SecureStore.swift can be removed from the
    // App target in Xcode; leaving it compiled but unregistered is harmless meanwhile.
  }

  /// ── SWIPE BACK ─────────────────────────────────────────────────────────────
  ///
  /// The app had no back gesture at all. Not a broken one — none: a search of
  /// `ios/` for `allowsBackForwardNavigationGestures` and of `src/` for any edge
  /// handler both returned nothing. Every screen you opened had to be left by
  /// finding a button, which on iOS is the deepest possible "this is a website"
  /// tell, because the edge swipe is muscle memory in every other app on the
  /// phone.
  ///
  /// `WKWebView` implements it properly when asked — snapshot-backed,
  /// interactive, and cancellable half way through, which is the part no
  /// in-page reimplementation gets right. It works against the history stack,
  /// and Next's App Router navigations are `pushState` entries, so a swipe pops
  /// exactly one client-side route.
  ///
  /// Set here rather than in `AppDelegate`: the web view does not exist until
  /// `super.viewDidLoad()` has built the bridge.
  ///
  /// ── ON GESTURE CONFLICTS ───────────────────────────────────────────────────
  /// The system's recogniser only arms within ~20pt of the leading edge, so it
  /// does not compete with the two horizontal gestures the app owns — the
  /// supplement row's swipe and the widget grid's long-press drag, both of which
  /// begin under a finger placed on the control itself. The bottom sheet drags
  /// vertically and is unaffected.
  override func viewDidLoad() {
    super.viewDidLoad()
    webView?.allowsBackForwardNavigationGestures = true
  }
}
