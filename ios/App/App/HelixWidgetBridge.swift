import Foundation
import Capacitor
import WidgetKit

/// `HelixWidgets.reload()` — the app's one lever over the home screen.
///
/// ── WHY THE APP CANNOT SIMPLY HAND THE WIDGET DATA ───────────────────────────
/// The usual channel is an App Group's shared container. App Groups are a PAID
/// Apple Developer Program capability and this is a free personal team, so the
/// extension cannot read anything the app writes — not UserDefaults, not files,
/// not the Keychain. `HelixSnapshot.swift` explains the same constraint from the
/// other side; it is why the extension fetches `/api/widget/snapshot` itself.
///
/// So there are exactly two things the app can do for a widget:
///   1. make the SERVER's answer fresher (`/api/compute-score`), and
///   2. tell WidgetKit to go and ask again — which is this.
///
/// Both matter, and neither substitutes for the other. Recomputing the score
/// without reloading means the widget sits on its half-hour timeline holding
/// numbers that were replaced minutes ago; reloading without recomputing just
/// re-fetches the same stale row.
///
/// Registration is explicit in `HelixViewController.capacitorDidLoad()` —
/// Capacitor ≥6 does not auto-discover app-local plugins, and a plugin that
/// compiles but is never attached to the bridge rejects every call silently.
@objc(HelixWidgetsPlugin)
public class HelixWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
  // CAPBridgedPlugin conformance in Swift rather than through the ObjC
  // CAP_PLUGIN macro, for the reason documented in HelixHealth.swift: an
  // ObjC-category conformance in a .m file nothing references can be
  // dead-stripped by the linker.
  public let identifier = "HelixWidgetsPlugin"
  public let jsName = "HelixWidgets"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
  ]

  @objc func reload(_ call: CAPPluginCall) {
    // Reload ALL kinds rather than naming them. Seven kinds exist and two of
    // them are configurable with four focuses each; enumerating that list here
    // would be a second place to forget a widget, and the reload is cheap —
    // WidgetKit coalesces and still honours its own budget.
    WidgetCenter.shared.reloadAllTimelines()
    call.resolve(["ok": true])
  }
}
