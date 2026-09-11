import Foundation
import Testing
@testable import OnyxCore

/// The structured dose, and the one thing it must not break.
///
/// ── WHY THIS TEST IS ABOUT MICRONUTRIENTS ───────────────────────────────────
/// `dose` stays the display string every reader parses, and
/// `SupplementNutrients.doseUnits` decides whether a payload is multiplied by
/// regex-matching it: a count of physical units ("2 tabs") delivers that
/// multiple of the label, a mass ("300 mg") already is the label. So the
/// editor's amount+unit pair has to compose a string that regex still reads the
/// same way. Get the plural wrong and every micronutrient total on the
/// Nutrition tab moves without a word appearing anywhere.
@Suite("Structured dose — amount, unit, and the string the label math reads")
struct StructuredDoseTests {

    @Test("a count pluralises and keeps scaling; a mass never does")
    func countsScaleAndMassesDoNot() {
        #expect(Supplements.doseText(amount: 2, unit: .tab) == "2 tabs")
        #expect(SupplementNutrients.doseUnits("2 tabs") == 2)

        #expect(Supplements.doseText(amount: 1, unit: .cap) == "1 cap")
        #expect(SupplementNutrients.doseUnits("1 cap") == 1)

        #expect(Supplements.doseText(amount: 0.5, unit: .scoop) == "0.5 scoops")
        #expect(SupplementNutrients.doseUnits("0.5 scoops") == 0.5)

        // Masses are the label itself. "300 mgs" is not a dose anybody writes,
        // and the regex would not read it as a count either way.
        #expect(Supplements.doseText(amount: 300, unit: .mg) == "300 mg")
        #expect(SupplementNutrients.doseUnits("300 mg") == 1)
        #expect(Supplements.doseText(amount: 5000, unit: .iu) == "5000 IU")
        #expect(SupplementNutrients.doseUnits("5000 IU") == 1)
        #expect(Supplements.doseText(amount: 125, unit: .mcg) == "125 mcg")
    }

    @Test("a whole number never prints a decimal place it did not measure")
    func wholeNumbersStayWhole() {
        #expect(Supplements.doseText(amount: 2.0, unit: .tab) == "2 tabs")
        #expect(Supplements.doseText(amount: 12.75, unit: .ml) == "12.75 ml")
        // No grouping: "1 000 mg" would not survive the label regex.
        #expect(Supplements.doseText(amount: 1000, unit: .mg) == "1000 mg")
    }

    @Test("the editor reads back a row the web wrote, and refuses prose")
    func parsingTheDisplayString() {
        let web = CustomSupplement(id: "a", name: "Magnesium Glycinate", dose: "300 mg")
        let parts = Supplements.doseParts(web)
        #expect(parts?.amount == 300)
        #expect(parts?.unit == .mg)

        #expect(Supplements.parseDose("2 tabs")?.unit == .tab)
        #expect(Supplements.parseDose("2 caps")?.amount == 2)

        // Anything the editor cannot round-trip comes back nil and the form
        // asks, rather than silently rewriting a dose nobody typed.
        #expect(Supplements.parseDose("2 tabs with food") == nil)
        #expect(Supplements.parseDose("1-2 caps") == nil)
        #expect(Supplements.parseDose("a scoop") == nil)
        #expect(Supplements.parseDose("") == nil)
    }

    @Test("the stored pair wins over the string, because it is the one that was typed")
    func storedPairWins() {
        let row = CustomSupplement(
            id: "a", name: "Creatine", dose: "5 g",
            doseAmount: 10, doseUnit: "g"
        )
        #expect(Supplements.doseParts(row)?.amount == 10)
        // A pair that is half-written is not a pair; fall back to the string.
        let half = CustomSupplement(id: "b", name: "Creatine", dose: "5 g", doseAmount: 10, doseUnit: nil)
        #expect(Supplements.doseParts(half)?.amount == 5)
    }

    @Test("every form has its own silhouette, and an unknown one is not a guess")
    func formSymbols() {
        let symbols = SupplementForm.allCases.map(\.symbol)
        #expect(Set(symbols).count == SupplementForm.allCases.count)
        #expect(!symbols.contains(SupplementForm.unspecifiedSymbol))
        #expect(SupplementForm.parse(nil) == nil)
        #expect(SupplementForm.parse("") == nil)
        #expect(SupplementForm.parse("Capsule") == .capsule)
        #expect(SupplementForm.parse("lozenge") == nil)
    }
}
