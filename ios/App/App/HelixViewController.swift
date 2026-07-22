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
  }
}
