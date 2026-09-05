import Foundation
import Testing
@testable import OnyxCore

@Suite("Widget cadence")
struct WidgetCadenceTests {
    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    private func at(_ hour: Int) -> Date {
        utc.date(from: DateComponents(year: 2026, month: 9, day: 3, hour: hour))!
    }

    @Test("each band of the day asks for its own interval", arguments: [
        (3, 150), (6, 20), (9, 20), (10, 45), (16, 45), (17, 20), (21, 20), (22, 60), (23, 60),
    ])
    func bands(hour: Int, minutes: Int) {
        let now = at(hour)
        #expect(WidgetCadence.nextRefresh(after: now, ok: true, calendar: utc) == now.addingTimeInterval(Double(minutes) * 60))
    }

    @Test("a failed build retries in five minutes whatever the hour")
    func failure() {
        for hour in [3, 12, 23] {
            let now = at(hour)
            #expect(WidgetCadence.nextRefresh(after: now, ok: false, calendar: utc) == now.addingTimeInterval(300))
        }
    }
}
