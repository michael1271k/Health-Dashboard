import SwiftUI
import OnyxUI
import OnyxCore
import OnyxData

/// Move the week around for one week, without touching the plan.
///
/// ── THE HOLIDAY FIX ─────────────────────────────────────────────────────────
/// The gym shuts on a Thursday. Nothing about the plan is wrong; this ONE week
/// has to bend around a closed door. Every tool the app had for that was per
/// day — a context menu on the session card, one date at a time, each move
/// rearranging a second date you could not see — so rebuilding a week meant
/// four separate edits against a mental model of what the last three had done.
///
/// Seven rows, one confirm, and every consequence visible while you decide.
///
/// ── WHY IT DOES NOT REUSE `SwapDaySheet` ────────────────────────────────────
/// That sheet is an EXCHANGE, and an exchange is right for one tap on one day:
/// you say "put Legs A here" and whatever was here goes to where Legs A was.
/// Applied seven times on one screen it becomes unusable — every tap silently
/// rewrites a row the user is looking at, and the edits they have made stop
/// describing the week in front of them. So this edits an assignment and
/// derives the writes once, at the end (`Swap.planWeek`). Vacated days go to
/// rest, visibly, and the footer counts what is now homeless.
///
/// ── AND WHY THERE IS NO NEXT-WEEK PAGE ──────────────────────────────────────
/// The founder's call. This is a one-week override for a one-week disruption;
/// a permanent change is `PlanView`'s "move this day" and belongs there, where
/// it also pins the part of the week that already happened. Two tiers with
/// clearly different jobs beats one control that quietly does both.
struct WeekOverrideSheet: View {
    let week: WorkoutWeek
    @Environment(\.dismiss) private var dismiss

    /// What the user has built. Seeded from the week as it stands.
    @State private var draft: WeekAssignment
    @State private var failed = false

    init(week: WorkoutWeek) {
        self.week = week
        _draft = State(initialValue: week.snapshot.weekCurrent)
    }

    private var snapshot: WorkoutWeek.Snapshot { week.snapshot }
    private var program: Program { snapshot.program }

    /// Recomputed on every change — it is seven comparisons over a dictionary,
    /// and a cached plan is a plan that disagrees with the rows above it.
    private var plan: WeekPlan {
        Swap.planWeek(
            base: snapshot.weekBase, current: snapshot.weekCurrent, draft: draft,
            logged: snapshot.loggedDays, scheduled: snapshot.scheduledKeys
        )
    }

    private var changed: Bool { draft != snapshot.weekCurrent }

    var body: some View {
        DaySheet(
            "This week", domain: .train,
            primary: ("Apply to this week", changed && plan.block == nil, confirm)
        ) {
            // ── THE ROWS COME FIRST ─────────────────────────────────────────
            // The caveat used to lead. At AX5 it is six lines, and the shot
            // showed a sheet whose entire first screen was explanatory text
            // with the control it explains below the fold — the reader has to
            // scroll past the reason to reach the thing.
            //
            // The rows say what they are without help ("Sun 30 Aug · Legs &
            // Core A"), and the caveat matters at the moment of confirming,
            // which is where the footer already lives. So it moved there.
            VStack(alignment: .leading, spacing: OnyxSpace.l) {
                VStack(spacing: OnyxSpace.xs) {
                    ForEach(draft.dates, id: \.self) { row($0) }
                }
                footer
                intro
            }
        }
    }

    // MARK: - The rows

    private var intro: some View {
        Text("Changes apply to this week only. The plan itself is untouched, and next week goes back to normal.")
            .onyxType(.caption)
            .foregroundStyle(Color.onyx.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// One day: its name, what it holds, and a menu of everything it could.
    ///
    /// A `Menu` and not a picker wheel or a drag handle. Seven rows of a wheel
    /// is a screen you scroll to read; drag-to-reorder cannot express "this day
    /// rests", which is half of what a holiday week needs to say.
    @ViewBuilder
    private func row(_ date: String) -> some View {
        let key = draft.key(on: date)
        let isRest = key == Schedule.restOverride
        let locked = snapshot.loggedDays.contains { $0.date == date }
        let tint = isRest ? Color.onyx.textTertiary : Color.onyx.day(key)

        Menu {
            Picker("", selection: binding(for: date)) {
                ForEach(program.days, id: \.key) { day in
                    Label(day.label, systemImage: "figure.strengthtraining.traditional").tag(day.key)
                }
                Divider()
                Label("Rest", systemImage: "moon.zzz").tag(Schedule.restOverride)
            }
            .labelsHidden()
        } label: {
            // ── ONE LINE UNTIL IT CANNOT BE ─────────────────────────────────
            // `ViewThatFits` takes the FIRST child that fits and falls back to
            // the LAST when none does, so the stacked variant is last — put it
            // first and a 375 pt phone at AX5 gets a truncated single line
            // instead of two honest ones.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: OnyxSpace.m) {
                    // Fixed width, so seven rows read as a column and not as
                    // seven differently-indented sentences.
                    dayName(date).frame(width: 92, alignment: .leading)
                    splitName(key, isRest: isRest, tint: tint)
                    trailingMark(locked: locked, key: key)
                }
                VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                    HStack(spacing: OnyxSpace.s) {
                        dayName(date)
                        Spacer(minLength: OnyxSpace.s)
                        trailingMark(locked: locked, key: key)
                    }
                    splitName(key, isRest: isRest, tint: tint)
                }
            }
            .padding(.horizontal, OnyxSpace.m)
            .padding(.vertical, OnyxSpace.s)
            .frame(minHeight: 48)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onyxGlass(.row)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        // The seal's own "Logged" label is swallowed by this one, and the row
        // whose edit is about to be refused is the last row VoiceOver should be
        // unable to tell apart — the visible seal exists to warn BEFORE the tap
        // (see the comment on it) and the spoken label owes the same warning.
        .accessibilityLabel(
            "\(Swap.shortDayLabel(date)), \(isRest ? "rest" : label(of: key))"
                + (locked ? ", logged" : "")
        )
        .accessibilityHint(locked ? "Logged days cannot be moved" : "Change what this day trains")
    }

    private func dayName(_ date: String) -> some View {
        Text(Swap.shortDayLabel(date))
            .onyxType(.secondary)
            .foregroundStyle(Color.onyx.textSecondary)
            .lineLimit(1)
    }

    private func splitName(_ key: String, isRest: Bool, tint: Color) -> some View {
        // `.firstTextBaseline`, so the dot sits beside the FIRST line of a name
        // that wrapped rather than floating in the middle of two.
        HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
            Circle().fill(tint).frame(width: 8, height: 8)
                .alignmentGuide(.firstTextBaseline) { $0.height }
            Text(isRest ? "Rest" : label(of: key))
                .onyxType(.body)
                .foregroundStyle(isRest ? Color.onyx.textSecondary : Color.onyx.textPrimary)
                .lineLimit(2).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A logged day is shown as done rather than hidden. The rule it is about
    /// to run into — a committed session cannot be told it held something else
    /// — is easier to accept before you tap than as a refusal afterwards.
    @ViewBuilder
    private func trailingMark(locked: Bool, key: String) -> some View {
        if locked {
            Image(systemName: "checkmark.seal.fill")
                .onyxType(.caption)
                // A fixed mark, not copy: at AX5 a scaling glyph pushes the
                // name it sits beside off the row.
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .foregroundStyle(Color.onyx.day(key))
                .accessibilityLabel("Logged")
        } else {
            Image(systemName: "chevron.up.chevron.down")
                .onyxType(.micro)
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .foregroundStyle(Color.onyx.textTertiary)
        }
    }

    /// Writes through `place`, which is what keeps a day key on exactly one
    /// date — a straight dictionary set would let two Thursdays both be Legs A.
    private func binding(for date: String) -> Binding<String> {
        Binding(
            get: { draft.key(on: date) },
            set: { next in
                // A failure names the state of the LAST confirm. Leaving it up
                // while the user rearranges the week further is the banner
                // describing a draft that no longer exists.
                failed = false
                withAnimation(OnyxMotion.move) { draft.place(next, on: date) }
            }
        )
    }

    private func label(of key: String) -> String {
        program.day(key: key)?.label ?? key
    }

    // MARK: - What it will do

    /// The sentence before the button, never after it.
    ///
    /// Three things can be true at once and each is stated separately: a
    /// refusal, a session left with nowhere to go, and the ordinary count of
    /// what will change. An action that rearranges your week silently is one
    /// you stop trusting, and a week that quietly loses a leg day is the
    /// original "Rest Day" bug wearing a nicer screen.
    @ViewBuilder
    private var footer: some View {
        let plan = self.plan
        VStack(alignment: .leading, spacing: OnyxSpace.s) {
            if let block = plan.block {
                Label(
                    Swap.describeBlock(block) { key in
                        key.flatMap { program.day(key: $0)?.label } ?? "That session"
                    },
                    systemImage: "lock"
                )
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.danger)
            } else if !changed {
                Text("Nothing changed yet.")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            } else {
                Text(summary(plan))
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
            }

            if !plan.dropped.isEmpty, plan.block == nil {
                Label(
                    plan.dropped.count == 1
                        ? "\(label(of: plan.dropped[0])) has nowhere to go this week."
                        : "\(plan.dropped.count) sessions have nowhere to go this week.",
                    systemImage: "exclamationmark.triangle"
                )
                // `danger`, not gold: §3.2 reserves gold for a personal record
                // and nothing else, and this is a destructive consequence of
                // the button directly below it — the week is about to lose a
                // session. It is exactly what the token is specified for.
                .onyxType(.caption)
                .foregroundStyle(Color.onyx.danger)
            }

            if failed {
                Label("The change could not be saved. Nothing was altered.", systemImage: "exclamationmark.triangle.fill")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.danger)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func summary(_ plan: WeekPlan) -> String {
        let moved = plan.writes.count
        let restored = plan.clears.count
        switch (moved, restored) {
        case (0, 0): return "Nothing changed yet."
        case (let m, 0): return m == 1 ? "1 day changes." : "\(m) days change."
        case (0, let r): return r == 1 ? "1 day goes back to the plan." : "\(r) days go back to the plan."
        case (let m, let r): return "\(m) day\(m == 1 ? "" : "s") change, \(r) go back to the plan."
        }
    }

    private func confirm() {
        failed = !week.applyWeekPlan(plan)
        if !failed { dismiss() }
    }
}
