import Foundation
import Capacitor
import HealthKit

@objc(HealthkitPlugin)
public class HealthkitPlugin: CAPPlugin, CAPBridgedPlugin {
  // CAPBridgedPlugin conformance in Swift (not via the ObjC CAP_PLUGIN macro):
  // an ObjC-category conformance can be dead-stripped by the linker when the
  // category lives in a separate .m file nothing directly references, which is
  // why explicit registration was still silently skipped. Declaring it here
  // guarantees the conformance is present for bridge?.registerPluginInstance.
  public let identifier = "HealthkitPlugin"
  public let jsName = "CapacitorHealthkit"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "queryQuantity", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "queryCategory", returnType: CAPPluginReturnPromise),
  ]

  private let store = HKHealthStore()

  @objc func requestAuthorization(_ call: CAPPluginCall) {
    guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["granted": false]); return }
    var types = Set<HKObjectType>()
    for id in (call.getArray("read", String.self) ?? []) {
      if id.hasPrefix("HKCategoryTypeIdentifier"),
         let t = HKObjectType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: id)) { types.insert(t) }
      else if let t = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: id)) { types.insert(t) }
    }
    store.requestAuthorization(toShare: nil, read: types) { ok, err in call.resolve(["granted": ok && err == nil]) }
  }

  /// Query a HealthKit QUANTITY type and reduce it to ONE value Swift-side.
  /// `reduce` selects the aggregation:
  ///  - "sum"/"avg" → HKStatisticsQuery, which **deduplicates overlapping samples
  ///    from multiple sources** (iPhone + Apple Watch) exactly like the Health app.
  ///    Using a raw HKSampleQuery + manual JS sum double-counted steps/energy
  ///    (10k shown vs 7k real). .cumulativeSum for totals, .discreteAverage for rates.
  ///  - "latest" → most-recent single sample (statistics can't express "latest";
  ///    used for point-in-time metrics like weight, RHR, VO₂max, body fat).
  /// Resolves `{"samples": [{"value": x}]}` (single element) or `[]` when empty.
  @objc func queryQuantity(_ call: CAPPluginCall) {
    guard let id = call.getString("sampleType"),
          let qType = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: id)) else {
      self.resolveOnMain(call, ["samples": []]); return
    }
    guard let (start, end) = self.resolveWindow(call) else {
      // Never silently fall back to a rolling 24h window — that is exactly what
      // leaked the previous day's totals into today. No valid window ⇒ no data.
      self.resolveOnMain(call, ["samples": []]); return
    }
    let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    let unit = self.unit(for: qType)
    let reduce = call.getString("reduce") ?? "sum"

    if reduce == "latest" {
      let q = HKSampleQuery(sampleType: qType, predicate: pred, limit: 1,
        sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, _ in
        guard let s = (samples as? [HKQuantitySample])?.first else { self.resolveOnMain(call, ["samples": []]); return }
        self.resolveOnMain(call, ["samples": [["value": s.quantity.doubleValue(for: unit)]]])
      }
      store.execute(q)
      return
    }

    let opts: HKStatisticsOptions = reduce == "avg" ? .discreteAverage : .cumulativeSum
    let q = HKStatisticsQuery(quantityType: qType, quantitySamplePredicate: pred, options: opts) { _, stats, _ in
      guard let qty = (reduce == "avg" ? stats?.averageQuantity() : stats?.sumQuantity()) else {
        self.resolveOnMain(call, ["samples": []]); return
      }
      self.resolveOnMain(call, ["samples": [["value": qty.doubleValue(for: unit)]]])
    }
    store.execute(q)
  }

  /// Query a HealthKit CATEGORY type (e.g. SleepAnalysis). Resolves each sample's
  /// raw category `value` (for sleep: 0 inBed, 1 asleepUnspecified, 2 awake,
  /// 3 asleepCore, 4 asleepDeep, 5 asleepREM) plus its start/end — stage
  /// aggregation happens JS-side in healthkit.ts.
  @objc func queryCategory(_ call: CAPPluginCall) {
    guard let id = call.getString("sampleType"),
          let cType = HKObjectType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: id)) else {
      self.resolveOnMain(call, ["samples": []]); return
    }
    guard let (start, end) = self.resolveWindow(call) else { self.resolveOnMain(call, ["samples": []]); return }
    let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
    let out = ISO8601DateFormatter() // for stamping sample bounds back to JS
    let q = HKSampleQuery(sampleType: cType, predicate: pred, limit: HKObjectQueryNoLimit,
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
      let mapped = (samples as? [HKCategorySample])?.map {
        ["value": $0.value,
         "startDate": out.string(from: $0.startDate), "endDate": out.string(from: $0.endDate)]
      } ?? []
      self.resolveOnMain(call, ["samples": mapped])
    }
    store.execute(q)
  }

  // MARK: - Query window + resolution helpers

  /// Resolve the query window for a call. PREFERRED: a device-local calendar
  /// day via `dayStart` (YYYY-MM-DD) + `isToday`, built with `Calendar.current`
  /// so the boundary is ALWAYS local midnight (00:00) in the device timezone —
  /// no UTC drift, no rolling window. FALLBACK: explicit ISO `startDate`/
  /// `endDate` for arbitrary windows (the sleep night window), parsed with
  /// fractional-seconds support — JS `Date.toISOString()` emits `…T00:00:00.000Z`,
  /// which the DEFAULT `ISO8601DateFormatter` silently fails to parse (that
  /// nil-parse was the day-rollover bug). Returns nil — never a rolling 24h
  /// window — when nothing valid is supplied.
  private func resolveWindow(_ call: CAPPluginCall) -> (Date, Date)? {
    let cal = Calendar.current
    if let day = call.getString("dayStart"), let d = self.parseLocalDay(day, cal: cal) {
      let start = cal.startOfDay(for: d)
      let isToday = call.getBool("isToday") ?? false
      let end = isToday ? Date() : (cal.date(byAdding: .day, value: 1, to: start) ?? Date())
      return (start, end)
    }
    if let s = self.parseISO(call.getString("startDate")),
       let e = self.parseISO(call.getString("endDate")) {
      return (s, e)
    }
    return nil
  }

  /// Parse a YYYY-MM-DD key as a date in the device timezone (anchored at noon,
  /// so `startOfDay` re-derives 00:00 without DST edge surprises).
  private func parseLocalDay(_ s: String, cal: Calendar) -> Date? {
    let f = DateFormatter()
    f.calendar = cal
    f.timeZone = cal.timeZone
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    guard let base = f.date(from: s) else { return nil }
    return cal.date(bySettingHour: 12, minute: 0, second: 0, of: base) ?? base
  }

  /// ISO-8601 parse tolerant of BOTH fractional and non-fractional seconds.
  private func parseISO(_ s: String?) -> Date? {
    guard let s = s, !s.isEmpty else { return nil }
    let frac = ISO8601DateFormatter(); frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = frac.date(from: s) { return d }
    return ISO8601DateFormatter().date(from: s)
  }

  /// Hop back to main before resolving to the Capacitor bridge — a HealthKit
  /// completion runs on an arbitrary background queue.
  private func resolveOnMain(_ call: CAPPluginCall, _ data: [String: Any]) {
    DispatchQueue.main.async { call.resolve(data) }
  }

  private func unit(for t: HKQuantityType) -> HKUnit {
    switch t.identifier {
    case HKQuantityTypeIdentifier.stepCount.rawValue: return .count()
    case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue: return .kilocalorie()
    case HKQuantityTypeIdentifier.heartRateVariabilitySDNN.rawValue: return .secondUnit(with: .milli)
    case HKQuantityTypeIdentifier.restingHeartRate.rawValue, HKQuantityTypeIdentifier.heartRate.rawValue,
         HKQuantityTypeIdentifier.respiratoryRate.rawValue: return HKUnit.count().unitDivided(by: .minute())
    case HKQuantityTypeIdentifier.oxygenSaturation.rawValue,
         HKQuantityTypeIdentifier.bodyFatPercentage.rawValue: return .percent()
    case HKQuantityTypeIdentifier.bodyMass.rawValue, HKQuantityTypeIdentifier.leanBodyMass.rawValue: return .gramUnit(with: .kilo)
    case HKQuantityTypeIdentifier.vo2Max.rawValue: return HKUnit(from: "ml/kg*min")
    case HKQuantityTypeIdentifier.appleExerciseTime.rawValue, HKQuantityTypeIdentifier.appleStandTime.rawValue: return .minute()
    case HKQuantityTypeIdentifier.dietaryEnergyConsumed.rawValue: return .kilocalorie()
    case HKQuantityTypeIdentifier.dietaryProtein.rawValue, HKQuantityTypeIdentifier.dietaryCarbohydrates.rawValue,
         HKQuantityTypeIdentifier.dietaryFatTotal.rawValue: return .gram()
    case HKQuantityTypeIdentifier.dietaryWater.rawValue: return .literUnit(with: .milli)
    // ── Activity / body signals ──
    case HKQuantityTypeIdentifier.basalEnergyBurned.rawValue: return .kilocalorie()
    case HKQuantityTypeIdentifier.flightsClimbed.rawValue: return .count()
    case HKQuantityTypeIdentifier.appleMoveTime.rawValue: return .minute()
    case HKQuantityTypeIdentifier.walkingHeartRateAverage.rawValue: return HKUnit.count().unitDivided(by: .minute())
    case HKQuantityTypeIdentifier.height.rawValue: return .meterUnit(with: .centi)
    case HKQuantityTypeIdentifier.uvExposure.rawValue: return .count()
    case HKQuantityTypeIdentifier.appleSleepingWristTemperature.rawValue: return .degreeCelsius()
    // ── Dietary macro/micro grams ──
    case HKQuantityTypeIdentifier.dietarySugar.rawValue, HKQuantityTypeIdentifier.dietaryFiber.rawValue,
         HKQuantityTypeIdentifier.dietaryFatMonounsaturated.rawValue,
         HKQuantityTypeIdentifier.dietaryFatPolyunsaturated.rawValue: return .gram()
    // ── Minerals + fat-soluble-in-mg / water-soluble vitamins (milligrams) ──
    case HKQuantityTypeIdentifier.dietaryCholesterol.rawValue, HKQuantityTypeIdentifier.dietarySodium.rawValue,
         HKQuantityTypeIdentifier.dietaryPotassium.rawValue, HKQuantityTypeIdentifier.dietaryCalcium.rawValue,
         HKQuantityTypeIdentifier.dietaryIron.rawValue, HKQuantityTypeIdentifier.dietaryMagnesium.rawValue,
         HKQuantityTypeIdentifier.dietaryZinc.rawValue, HKQuantityTypeIdentifier.dietaryVitaminC.rawValue,
         HKQuantityTypeIdentifier.dietaryVitaminB6.rawValue, HKQuantityTypeIdentifier.dietaryVitaminE.rawValue:
      return .gramUnit(with: .milli)
    // ── Trace nutrients (micrograms) ──
    case HKQuantityTypeIdentifier.dietaryIodine.rawValue, HKQuantityTypeIdentifier.dietaryBiotin.rawValue,
         HKQuantityTypeIdentifier.dietaryVitaminA.rawValue, HKQuantityTypeIdentifier.dietaryVitaminB12.rawValue,
         HKQuantityTypeIdentifier.dietaryVitaminD.rawValue, HKQuantityTypeIdentifier.dietaryVitaminK.rawValue:
      return .gramUnit(with: .micro)
    default: return .count()
    }
  }
}
