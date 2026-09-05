import SwiftUI
import OnyxUI
import OnyxCore

/// The Pulse row that opens the stack — the door, not the room.
///
/// ── ABSENCE IS THE PROTOCOL ─────────────────────────────────────────────────
/// The stack is what happens by default; `supplement_log` holds only the
/// exceptions. What counts is therefore a question about the CLOCK as much as
/// about the log — a dose with no row counts once its slot has passed — so the
/// summary here counts credited doses rather than "not skipped", which is what
/// the day's micronutrients are actually built from.
struct StackRow: View {
    let model: DayModel
    let onOpen: () -> Void

    var body: some View {
        let doses = model.doses
        let credited = doses.filter(\.credited).count
        let later = doses.filter { $0.state == .later }.count
        let skipped = doses.filter { $0.state == .skipped }.count
        PulseRow(
            symbol: "pills",
            title: "Stack",
            detail: doses.isEmpty ? "Nothing scheduled" : detail(credited, doses.count, later, skipped),
            tint: Color.onyx.accent(.fuel),
            spoken: doses.isEmpty
                ? "nothing scheduled"
                : "\(credited) of \(doses.count) counted, \(later) still ahead, \(skipped) skipped",
            action: onOpen
        )
    }

    private func detail(_ credited: Int, _ total: Int, _ later: Int, _ skipped: Int) -> String {
        var parts = ["\(credited)/\(total) counted"]
        if later > 0 { parts.append("\(later) later") }
        if skipped > 0 { parts.append("\(skipped) skipped") }
        return parts.joined(separator: " · ")
    }
}
