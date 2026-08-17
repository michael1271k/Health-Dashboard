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
    // ── WHY THIS NAMES KINDS NOW ─────────────────────────────────────────────
    // It used to reload ALL kinds unconditionally, on the argument that
    // enumerating them here would be a second place to forget a widget. That is
    // a real hazard and it is not the whole picture: WidgetKit budgets reloads
    // PER KIND, roughly 40–70 a day each. A blanket reload therefore spends the
    // Training widget's entire allowance on water logs and macro edits, and has
    // nothing left at the moment a session commits — which is the single moment
    // Training had to be fresh.
    //
    // The forget-a-widget hazard is answered on the other side instead: the kind
    // list lives in `src/lib/native/widgetKinds.ts` and
    // `widget-kind-parity.test.ts` asserts it matches the `kind:` strings in
    // HelixWidgets.swift in both directions, so a Swift widget that is not
    // registered — or a registration with no widget — fails the suite.
    //
    // No kinds means all of them, so a caller that has not thought about this
    // gets the old, safe behaviour rather than a silently narrower one.
    let kinds = call.getArray("kinds", String.self) ?? []
    if kinds.isEmpty {
      WidgetCenter.shared.reloadAllTimelines()
    } else {
      for kind in kinds { WidgetCenter.shared.reloadTimelines(ofKind: kind) }
    }
    call.resolve(["ok": true, "kinds": kinds])
  }
}
