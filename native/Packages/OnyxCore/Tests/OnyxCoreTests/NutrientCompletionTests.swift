import Foundation
import Testing
@testable import OnyxCore

/// The completion figure the Nutrients screen prints in its nav bar. A floor
/// and a ceiling are met by moving in OPPOSITE directions, and an unmeasured
/// nutrient is neither met nor unmet.
@Suite("Nutrient completion — floors, ceilings and holes")
struct NutrientCompletionTests {

    private let fibre = NutrientTargets.all.first { $0.key == "fiber" }!
    private let sodium = NutrientTargets.all.first { $0.key == "sodium" }!

    @Test("a floor is met by reaching it, a ceiling by staying under it")
    func direction() {
        #expect(NutrientTargets.isMet(fibre, total: 30) == true)
        #expect(NutrientTargets.isMet(fibre, total: 29.9) == false)
        #expect(NutrientTargets.isMet(fibre, total: 45) == true)

        #expect(NutrientTargets.isMet(sodium, total: 3000) == true)
        #expect(NutrientTargets.isMet(sodium, total: 3000.1) == false)
        #expect(NutrientTargets.isMet(sodium, total: 900) == true)
    }

    @Test("nothing measured is not a miss")
    func holesAreNotMisses() {
        #expect(NutrientTargets.isMet(fibre, total: nil) == nil)
        let (met, measured) = NutrientTargets.completion([fibre, sodium]) { t in
            t.key == "fiber" ? 31 : nil
        }
        #expect(met == 1)
        #expect(measured == 1)
    }

    @Test("the four sections hold all twenty targets, in a declared order")
    func groupsCoverTheTable() {
        #expect(NutrientTargets.groups == ["Macros", "Vitamins", "Minerals", "Other"])
        let grouped = NutrientTargets.groups.flatMap(NutrientTargets.inGroup)
        #expect(grouped.count == NutrientTargets.all.count)
        #expect(Set(grouped.map(\.key)) == Set(NutrientTargets.all.map(\.key)))
    }
}
