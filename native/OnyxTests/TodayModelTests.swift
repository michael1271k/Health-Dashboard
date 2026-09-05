import Testing
import OnyxCore
import OnyxUI
@testable import Onyx

@MainActor
@Suite("Today model")
struct TodayModelTests {

    @Test("web-only faces are projected out of a slot; a slot with none left disappears; the layout is untouched")
    func projection() {
        let slots = [
            StackSlot(id: "a", size: .m, items: [.sleep, .deficit, .vitals]),
            StackSlot(id: "b", size: .s, items: [.stack]),
            StackSlot(id: "c", size: .s, items: [.steps]),
        ]
        let shown = TodayModel.projectNative(slots)
        #expect(shown.map(\.id) == ["a", "c"])
        #expect(shown[0].items == [.sleep, .vitals])
        #expect(shown[0].size == .m)
    }

    @Test("rows pair smalls and give every taller tile its own row; a lone small stays lone")
    func packing() {
        let s = { (id: String, size: WidgetSize) in StackSlot(id: id, size: size, items: [.steps]) }
        let rows = DashboardGrid.rows([s("a", .s), s("b", .m), s("c", .s), s("d", .s), s("e", .l), s("f", .s)])
        #expect(rows.map { $0.slots.map(\.id) } == [["a"], ["b"], ["c", "d"], ["e"], ["f"]])
    }

    @Test("the catalogue the phone offers is the thirteen with a face, in catalogue order")
    func native() {
        #expect(OnyxTile.native.count == 13)
        #expect(OnyxTile.native.first == .recovery)
        #expect(!OnyxTile.native.contains(.deficit))
    }

    @Test("stagger is deterministic, inside the window, and spreads two ids")
    func stagger() {
        let a = SmartStackView.stagger("sl-sleep"), b = SmartStackView.stagger("sl-vitals")
        #expect(a == SmartStackView.stagger("sl-sleep"))
        #expect(a >= 0 && a < SmartStackView.staggerWindowMs)
        #expect(a != b)
    }
}
