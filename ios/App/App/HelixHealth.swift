import Foundation
import Capacitor
import HealthKit

@objc(HealthkitPlugin)
public class HealthkitPlugin: CAPPlugin {
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

  @objc func queryQuantity(_ call: CAPPluginCall) {
    guard let id = call.getString("sampleType"),
          let qType = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: id)) else {
      call.resolve(["samples": []]); return
    }
    let iso = ISO8601DateFormatter()
    let start = iso.date(from: call.getString("startDate") ?? "") ?? Date().addingTimeInterval(-86400)
    let end = iso.date(from: call.getString("endDate") ?? "") ?? Date()
    let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    let q = HKSampleQuery(sampleType: qType, predicate: pred, limit: HKObjectQueryNoLimit,
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
      let unit = self.unit(for: qType)
      let out = (samples as? [HKQuantitySample])?.map {
        ["value": $0.quantity.doubleValue(for: unit),
         "startDate": iso.string(from: $0.startDate), "endDate": iso.string(from: $0.endDate)]
      } ?? []
      call.resolve(["samples": out])
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
      call.resolve(["samples": []]); return
    }
    let iso = ISO8601DateFormatter()
    let start = iso.date(from: call.getString("startDate") ?? "") ?? Date().addingTimeInterval(-86400)
    let end = iso.date(from: call.getString("endDate") ?? "") ?? Date()
    let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
    let q = HKSampleQuery(sampleType: cType, predicate: pred, limit: HKObjectQueryNoLimit,
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
      let out = (samples as? [HKCategorySample])?.map {
        ["value": $0.value,
         "startDate": iso.string(from: $0.startDate), "endDate": iso.string(from: $0.endDate)]
      } ?? []
      call.resolve(["samples": out])
    }
    store.execute(q)
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
    default: return .count()
    }
  }
}
