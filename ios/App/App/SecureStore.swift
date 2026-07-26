import Foundation
import Capacitor
import Security

/// SecureStore — a tiny Keychain-backed key/value plugin for the Supabase auth
/// session.
///
/// WHY THIS EXISTS: `@capacitor/preferences` persists to UserDefaults, which iOS
/// **erases when the app is deleted**. So a delete + reinstall (e.g. an Xcode
/// rebuild) wiped the stored session and forced a fresh password login. The iOS
/// **Keychain is NOT cleared on uninstall** — a generic-password item survives an
/// app delete + reinstall on the same device — so putting the Supabase token JSON
/// here means "sign in once, ever" holds across reinstalls. Only the token Supabase
/// already persists is stored; no password is ever written.
///
/// TARGET MEMBERSHIP: add this file to the main **App** target in Xcode (same
/// manual step HealthkitPlugin needed), then `npx cap sync ios` + rebuild. It is
/// registered in `HelixViewController.capacitorDidLoad()` alongside HealthKit.
///
/// Accessibility is `AfterFirstUnlockThisDeviceOnly`: readable in the background
/// after the first unlock post-boot (so a background token refresh works) and never
/// synced to iCloud or migrated to another device.
@objc(SecureStorePlugin)
public class SecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
  // Declared in Swift (not the ObjC CAP_PLUGIN macro) for the same reason as
  // HealthkitPlugin: an ObjC-category conformance in a separate .m can be
  // dead-stripped, silently skipping registration.
  public let identifier = "SecureStorePlugin"
  public let jsName = "SecureStore"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
  ]

  private let service = "app.helix.session"

  private func baseQuery(_ key: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
  }

  /// Resolve `{ value: string | null }`. A missing item is a normal miss, not an
  /// error — the web adapter falls through to its next storage tier.
  @objc func get(_ call: CAPPluginCall) {
    guard let key = call.getString("key") else { call.resolve(["value": NSNull()]); return }
    var q = baseQuery(key)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
      call.resolve(["value": value])
    } else {
      call.resolve(["value": NSNull()])
    }
  }

  /// Upsert: update in place if the item exists, otherwise add it.
  @objc func set(_ call: CAPPluginCall) {
    guard let key = call.getString("key"),
          let value = call.getString("value"),
          let data = value.data(using: .utf8) else {
      call.reject("SecureStore.set requires string key and value")
      return
    }
    let base = baseQuery(key)
    let update: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let updateStatus = SecItemUpdate(base as CFDictionary, update as CFDictionary)
    if updateStatus == errSecSuccess {
      call.resolve()
    } else if updateStatus == errSecItemNotFound {
      var add = base
      add[kSecValueData as String] = data
      add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      let addStatus = SecItemAdd(add as CFDictionary, nil)
      if addStatus == errSecSuccess { call.resolve() }
      else { call.reject("SecureStore.set add failed: \(addStatus)") }
    } else {
      call.reject("SecureStore.set update failed: \(updateStatus)")
    }
  }

  /// Delete is idempotent — a missing item still resolves.
  @objc func remove(_ call: CAPPluginCall) {
    guard let key = call.getString("key") else { call.resolve(); return }
    SecItemDelete(baseQuery(key) as CFDictionary)
    call.resolve()
  }
}
