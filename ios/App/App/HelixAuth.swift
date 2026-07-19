import Foundation
import Capacitor
import LocalAuthentication
import Security

/// HelixAuth — a tiny native bridge for Face ID / Touch ID and Keychain-backed
/// secret storage, used for one-tap biometric sign-in. Same integration pattern
/// as HelixHealth: add this file + HelixAuthRegistration.m to the App target.
@objc(HelixAuthPlugin)
public class HelixAuthPlugin: CAPPlugin, CAPBridgedPlugin {
  // CAPBridgedPlugin conformance in Swift — see HelixHealth.swift for why this
  // is declared here rather than via the ObjC CAP_PLUGIN registration macro.
  public let identifier = "HelixAuthPlugin"
  public let jsName = "HelixAuth"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "setSecret", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getSecret", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "removeSecret", returnType: CAPPluginReturnPromise),
  ]

  private let service = "app.helix.health.michael"

  @objc func isAvailable(_ call: CAPPluginCall) {
    let ctx = LAContext()
    var err: NSError?
    let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
    var type = "none"
    switch ctx.biometryType {
    case .faceID: type = "faceId"
    case .touchID: type = "touchId"
    default: type = "none"
    }
    call.resolve(["available": ok, "biometryType": type])
  }

  @objc func authenticate(_ call: CAPPluginCall) {
    let ctx = LAContext()
    let reason = call.getString("reason") ?? "Unlock HELIX"
    ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
      if success { call.resolve(["success": true]) }
      else { call.reject(error?.localizedDescription ?? "Authentication failed") }
    }
  }

  @objc func setSecret(_ call: CAPPluginCall) {
    guard let key = call.getString("key"), let value = call.getString("value") else {
      call.reject("key and value required"); return
    }
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(base as CFDictionary)
    var add = base
    add[kSecValueData as String] = Data(value.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(add as CFDictionary, nil)
    if status == errSecSuccess { call.resolve() }
    else { call.reject("Keychain write failed (\(status))") }
  }

  @objc func getSecret(_ call: CAPPluginCall) {
    guard let key = call.getString("key") else { call.reject("key required"); return }
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: AnyObject?
    let status = SecItemCopyMatching(q as CFDictionary, &out)
    if status == errSecSuccess, let d = out as? Data, let s = String(data: d, encoding: .utf8) {
      call.resolve(["value": s])
    } else {
      call.resolve(["value": NSNull()])
    }
  }

  @objc func removeSecret(_ call: CAPPluginCall) {
    guard let key = call.getString("key") else { call.reject("key required"); return }
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(q as CFDictionary)
    call.resolve()
  }
}
