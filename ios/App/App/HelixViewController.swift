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

  /// ── SWIPE BACK IS OWNED BY THE WEB LAYER, AND HAS TO BE ────────────────────
  ///
  /// This was `allowsBackForwardNavigationGestures = true`, which is the
  /// documented way to get the system's interactive pop and which, in this app,
  /// did nothing whatsoever. The flag was not the problem.
  ///
  /// WebKit's swipe is SNAPSHOT-BACKED: `_ViewGestureController` needs a
  /// rendered image of the destination to slide in under the thumb, and it only
  /// captures one for a real page load. Every navigation in a Next App Router
  /// app is `history.pushState` — a SAME-DOCUMENT entry, no snapshot — so the
  /// recogniser has nothing to show, never arms, and the edge swipe is silently
  /// inert. No amount of configuration changes that.
  ///
  /// Worse, leaving it on is not free. The recogniser still installs itself on
  /// the web view's scroll view and still delays touches along the leading edge
  /// while it decides, which is precisely the strip the replacement gesture
  /// needs to see cleanly. Turning it OFF is what makes the in-page gesture
  /// possible, so this line is load-bearing rather than a tidy-up.
  ///
  /// The real gesture now lives in `src/lib/nav/useEdgeSwipeBack.ts`: 1:1
  /// tracking, a projected release, interruptible mid-flight, and it pops an
  /// App Router route rather than a WebKit history entry — which are not the
  /// same list, and only one of them can walk off the front of the app.
  ///
  /// Set here rather than in `AppDelegate`: the web view does not exist until
  /// `super.viewDidLoad()` has built the bridge.
  override func viewDidLoad() {
    super.viewDidLoad()
    webView?.allowsBackForwardNavigationGestures = false
  }
}
