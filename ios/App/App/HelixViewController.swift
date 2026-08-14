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
    // SecureStore (Keychain session persistence) was retired: the web app no longer
    // calls it (auth is a one-tap re-login). SecureStore.swift can be removed from the
    // App target in Xcode; leaving it compiled but unregistered is harmless meanwhile.
  }
}
