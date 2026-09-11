import SwiftUI
import GRDB
import OnyxUI
import OnyxCore
import OnyxData

/// The one timeframe control in the app (decision 12, §W11).
///
/// ── WHAT IT REPLACED, AND WHY THERE WERE THREE OF THEM ──────────────────────
/// Trends had `EraFilter { all, ppl, axis }` and rendered the middle pill as
/// "Axis" — a product name two renames out of date, left in a `switch` because
/// the rawValue was load-bearing for `VolumeSplit.splits(forEra:)`. History had
/// its own `EraFilter { all, onyx, ppl }` and spelled the same era "Onyx". Body
/// Trends had `TrendRange { 30, 90, 365 }`, which was a different question
/// entirely. Three controls, two of them programme filters wearing a
/// timeframe's clothes, none of them able to say "this phase".
///
/// One `EraWindow` answers all three: it is a RANGE and a name for it, and the
/// name comes from the phase table, the lever schedule or the plan catalogue.
///
/// ── AND WHY A MENU RATHER THAN SEGMENTS ─────────────────────────────────────
/// The labels are data, so their widths are too: "Maintenance Week" and "30 d"
/// are the same control's options. Six segments sized to the longest of them is
/// two lines of chrome on a phone, and at AX5 it is four. A menu is the system
/// control for a handful of variable-width choices, and the button that opens
/// it can say the whole answer — the window's name AND how much of it there is.
struct EraWindowPicker: View {
    @Binding var selection: EraWindow
    let input: EraWindowInput

    var body: some View {
        let current = selection.resolve(input)
        Menu {
            Picker("Window", selection: $selection) {
                ForEach(EraWindow.modes, id: \.key) { mode in
                    Text(Self.menuLabel(mode, input)).tag(mode)
                }
            }
            .pickerStyle(.inline)
        } label: {
            label(current)
        }
        .accessibilityLabel("Timeframe")
        .accessibilityValue("\(current.label), \(current.days) days from \(current.startISO)")
    }

    private func label(_ current: ResolvedEraWindow) -> some View {
        HStack(spacing: OnyxSpace.s) {
            Image(systemName: "calendar.badge.clock")
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.textSecondary)
                .accessibilityHidden(true)
            Text(current.label)
                .onyxType(.body).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.textPrimary)
                .lineLimit(1)
            // The span, always — a window named "Onyx Cut" says nothing about
            // how much of it you are looking at, and that is half of what the
            // reader needs to judge the shape of a line.
            Text("\(current.days) d")
                .onyxType(.caption).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
                .lineLimit(1)
            Spacer(minLength: OnyxSpace.xs)
            Image(systemName: "chevron.up.chevron.down")
                .onyxType(.caption).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.textTertiary)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, OnyxSpace.m)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
        .onyxGlass(.row)
    }

    /// A menu row names the window and, where the name is not already a span,
    /// how long it is. "30 d · 30 d" would be the alternative.
    private static func menuLabel(_ mode: EraWindow, _ input: EraWindowInput) -> String {
        let w = mode.resolve(input)
        if case .days = mode { return w.label }
        return "\(w.label) · \(w.days) d"
    }
}

/// Everything `EraWindow` needs, read off the local store.
///
/// ── WHY THE FLOOR FOR "ALL" IS THE PHASE TABLE ──────────────────────────────
/// `EraWindowInput.firstDataISO` is meant to be the caller's own oldest row,
/// and two of the three screens genuinely have it — History knows its earliest
/// capsule, Trends its earliest session. Body Trends does not: its read is
/// RANGED, so the range is what it is asking for. Rather than invent a floor
/// (which the module's own note forbids) it takes the first day the programme
/// existed, which is a real date from a real table and is a bound the account
/// cannot have data before.
enum EraWindowSource {
    /// The first day any phase covers — the honest floor for "All" on a screen
    /// whose read is ranged — else the plan's start, else today.
    static func programStart(_ schedule: ScheduleContext, today: String) -> String {
        schedule.phases.first?.start ?? schedule.planStartISO ?? today
    }

    /// One read of `user_goals`, off the main actor's way.
    ///
    /// Nothing filters on `user_id`: the local store is ONE user's mirror, and
    /// filtering here silently answers "no goals" whenever the id in hand is
    /// not the id the rows were written under — which is every preview, every
    /// screenshot, and any read that lands before auth resolves. Same rule as
    /// `HistoryWeeks.scheduleContext`, and for the same reason.
    nonisolated static func input(
        database: AppDatabase,
        today: String = LogicalDay.today(),
        firstDataISO: String? = nil
    ) -> EraWindowInput {
        let goals: UserGoalRow? = (try? database.read { db in try UserGoalRow.fetchOne(db) }) ?? nil
        let userId = database.localUserId()
        return input(
            goals: goals,
            schedule: (try? database.scheduleContext(userId: userId)) ?? ScheduleContext(programId: "", phase: .cut),
            ladder: (try? database.leverLadder(userId: userId)) ?? .empty,
            today: today, firstDataISO: firstDataISO
        )
    }

    /// The same, for a caller that already holds the rows.
    static func input(
        goals: UserGoalRow?,
        schedule: ScheduleContext,
        ladder: LeverLadder,
        today: String = LogicalDay.today(),
        firstDataISO: String? = nil
    ) -> EraWindowInput {
        EraWindowInput(
            today: today,
            planLabel: schedule.plans.first { $0.id == schedule.programId }?.label ?? schedule.programId,
            // `.thisWeek` is the muscle atlas card's default and the window the
            // set targets are written in; without this it would fall back to a
            // Sunday start for a Monday athlete.
            weekEndDay: goals?.weekEndDay,
            // An empty string is not a selection — `WeeklyExportBuilder` reads
            // the column the same way, because a blank there means "nothing
            // stored" and `isLeverId("")` would say otherwise.
            storedLever: (goals?.activeLever?.isEmpty == false) ? goals?.activeLever : nil,
            releaseEndsOn: goals?.maintenanceUntil,
            firstDataISO: firstDataISO ?? programStart(schedule, today: today),
            planStartISO: schedule.planStartISO,
            phases: schedule.phases,
            rungs: ladder.rungs,
            periods: ladder.periods
        )
    }
}
