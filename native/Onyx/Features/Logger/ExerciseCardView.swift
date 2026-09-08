import SwiftUI
import OnyxUI
import OnyxCore

/// One movement, and the sets you are logging into it — a single page of the
/// deck.
///
/// ── WHAT THE WEB CARD WAS, AND WHAT THIS IS INSTEAD ─────────────────────────
/// `ExerciseCard.tsx` is 1,435 lines and `SetEditorRow.tsx` another 832, and
/// most of that is a six-column HTML table fighting a 390 pt screen: SET,
/// PREVIOUS, KG, REPS, RPE, ✓, each one narrower than a thumb. The data
/// hierarchy is right and the layout is a spreadsheet.
///
/// ── ONE VERTICAL SCROLL, AND NO CHEVRONS ────────────────────────────────────
/// Wave 1 stacked every movement in one vertical scroll, each card with its own
/// expand chevron — so the screen you logged into was a list of eleven
/// accordions and the set in front of you was wherever you last left the
/// scroll. Wave 2.4 answered that by making the cards a horizontal DECK, one
/// page per movement, which fixed the accordions and cost the ability to look
/// ahead; §U puts the vertical scroll back and leaves the chevrons out, because
/// it was never the scrolling that was wrong. See `LiveLoggerView.deck`.
///
/// A card is therefore always open, always full height, and prints its position
/// in the header — `3 of 11` is what a scroll bar cannot say.
///
/// ── THE ROW, AFTER WAVE U2 ──────────────────────────────────────────────────
/// The row is 44 pt — the platform's own minimum, not a number chosen here —
/// and it is driven by the SET NUMBER: tap to log, hold for the set's options.
/// The horizontal swipe it used to carry is gone; see `SetRowView`.
struct ExerciseCardView: View {
    @Bindable var exercise: LoggerModel.ExerciseState
    let model: LoggerModel
    /// Where this movement sits in the deck, for the "3 of 11" register.
    let position: (index: Int, total: Int)

    @Environment(\.dynamicTypeSize) private var typeSize

    /// ── WHY THE SHEETS LIVE ON THE CARD AND NOT ON THE ROW ──────────────────
    /// They were on `SetRowView`, and "Delete set" in the options sheet removes
    /// the row — which destroys the view PRESENTING the sheet, in the same
    /// frame the sheet asks to be dismissed. Swapping the two calls does not
    /// help: `dismiss()` starts an animation, it does not finish one. The card
    /// outlives every row in it, so it is the correct presenter; it also takes
    /// the deck from two sheet modifiers per row to two per card, and stops the
    /// `LazyVStack` recycling a presenter out from under an open sheet.
    @State private var optionsFor: SetTarget?
    @State private var effortFor: SetTarget?

    /// A movement is being dragged over this card right now.
    ///
    /// A drop target with no feedback is a guess: the deck is eleven cards of
    /// one shape and the finger is over the one you are aiming at.
    @State private var isDropTarget = false

    /// The muscle this movement is FOR — its first primary mover, which is what
    /// gives the card its rail colour. A card striped in the day's accent tells
    /// you which workout you are in, which you know; striped by muscle it tells
    /// you what the next twenty minutes are for.
    private var family: LandmarkMuscle? {
        guard let token = exercise.plan.movers.primary.first else { return nil }
        return LandmarkMuscle.from(token: token)
    }

    private var rail: Color {
        guard let family else { return Color.onyx.day(model.day.key) }
        return Color.onyx.muscle(family)
    }

    /// The bottom half of the rail — the movement's first ASSISTING mover.
    ///
    /// Read from `plan.movers.secondary`, the same place `family` reads its
    /// primary, so the deck and the session ledger are answering one question
    /// from one source rather than agreeing by coincidence.
    private var assist: Color? {
        guard let token = exercise.plan.movers.secondary.first,
              let muscle = LandmarkMuscle.from(token: token)
        else { return nil }
        return Color.onyx.muscle(muscle)
    }

    /// A movement with no external load — reps, or seconds, are the record.
    ///
    /// ── WHY THE NAME AND NOT `wk1Kg == nil` ────────────────────────────────
    /// `wk1Kg` is nil for two unrelated reasons. A Reverse Crunch has no seed
    /// load because it never carries one; a Hack Squat has none because nobody
    /// has logged it yet — and hiding the load column on the Hack Squat would
    /// remove the only control that could ever give it one. `ProgramExercise`
    /// says so itself. `BodyweightExercise` and `TimedExercise` are the
    /// predicates OnyxCore already uses for exactly this distinction, and both
    /// anchor around a machine qualifier so `Crunch Machine` stays loaded
    /// while `Reverse Crunch` does not.
    private var isWeightless: Bool {
        BodyweightExercise.isBodyweight(exercise.plan.name)
            || TimedExercise.isTimed(exercise.plan.name)
    }

    /// Seconds rather than reps — a plank's `55s` window.
    private var isTimed: Bool { TimedExercise.isTimed(exercise.plan.name) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(Color.onyx.hairline)
            sets
        }
        .onyxGlass(.tile)
        // ── THE SAME WASH THE SESSION LEDGER WEARS ──────────────────────────
        // This card used to paint its own: a 10 %→0 gradient clamped to the
        // first 120 pt, plus a solid 3 pt rail. The ledger's card painted a
        // different one — 28 %→4 %, left to right, on the HEADER only. Two
        // screens drawing the same object in two colour languages, and the
        // review read them as belonging to different apps.
        //
        // `onyxMuscleWash` is now the single answer for both: 6 %→2 % top to
        // bottom across the whole card, and a rail that carries the assisting
        // muscle in its lower half. The card's own `clipShape` goes with the
        // hand-rolled rail — the modifier clips to the same radius, and two
        // clips of the same shape is one of them doing nothing.
        .onyxMuscleWash(rail, secondary: assist)
        // The landing zone, lit only while something is over it.
        .overlay {
            RoundedRectangle(cornerRadius: OnyxCorner.tile, style: .continuous)
                .strokeBorder(Color.onyx.day(model.day.key), lineWidth: 2)
                .opacity(isDropTarget ? 1 : 0)
                // `.opacity(0)` does not remove a view from the accessibility
                // tree, and a decorative border has no business in it either way.
                .accessibilityHidden(true)
        }
        .animation(OnyxMotion.move, value: isDropTarget)
        // ── THE WHOLE CARD RECEIVES, ONLY THE GRIP SENDS ────────────────────
        // Aiming at a 30 pt handle with a card in your other hand is a game;
        // aiming at the card is not. Making the card DRAGGABLE would be the
        // symmetric mistake — every set row inside it is interactive, and the
        // system's drag interaction would start competing with them.
        //
        // `String` is what `DashboardGrid` drags too, which means the payload
        // can also arrive from another app. Anything that is not one of this
        // deck's own movements is refused, which is what `firstIndex` returning
        // nil says.
        .dropDestination(for: String.self) { items, _ in
            guard let dragged = items.first,
                  let from = model.exercises.firstIndex(where: { $0.id == dragged }),
                  from != position.index
            else { return false }
            withAnimation(OnyxMotion.move) { model.moveExercise(from: from, to: position.index) }
            return true
        } isTargeted: { isDropTarget = $0 }
        .animation(OnyxMotion.move, value: exercise.rows.count)
        .sheet(item: $optionsFor) { target in
            // Looked up by id rather than held by reference: between the tap
            // that opened this and the frame that presents it, a watch sync or
            // a phase rebuild can have replaced `exercise.rows`. A stale
            // reference would edit a row that is no longer in the session.
            if let row = exercise.rows.first(where: { $0.id == target.id }) {
                SetOptionsSheet(
                    ordinal: target.ordinal, exerciseName: exercise.name, row: row,
                    onKind: { model.setKind($0, on: row, in: exercise) },
                    onQuality: { model.setQuality($0, on: row, in: exercise) },
                    onDelete: { withAnimation(OnyxMotion.move) { model.removeSet(row, from: exercise) } }
                )
            } else {
                // The row went while the sheet was open — deleted, or replaced
                // by a rebuild. `.sheet(item:)` only closes when the item goes
                // nil, so without this the reader is left holding a blank modal
                // with a drag indicator for an exit.
                Color.clear.onAppear { optionsFor = nil }
            }
        }
        .sheet(item: $effortFor) { target in
            if let row = exercise.rows.first(where: { $0.id == target.id }) {
                EffortPickerSheet(
                    ordinal: target.ordinal, exerciseName: exercise.name, row: row,
                    wasStale: target.wasStale,
                    onPick: { value in
                        row.rpe = value
                        // Rating a set answers the question the pip was asking,
                        // whatever the answer is — including "not rated".
                        row.rpeStale = false
                        model.commitEdit(row, in: exercise)
                    }
                )
            } else {
                Color.clear.onAppear { effortFor = nil }
            }
        }
    }

    // MARK: - Header

    /// ── TWO LINES, AND WHAT EACH ONE IS FOR ─────────────────────────────────
    /// Identity on the first line, PRESCRIPTION on the second: what this
    /// movement is (the muscle the rail is coloured for, and its load class or
    /// equipment), the rep window it has to land in, and whether the engine
    /// says the load goes up today. That is the whole of what you need before
    /// the first rep, and it is 56 pt.
    ///
    /// The third line is the seed's own "last time" and exists only when the
    /// seed HAS one — a new movement gets a two-line header rather than a line
    /// reading "—", which is a row of nothing occupying the height of
    /// something.
    ///
    /// ── WHY THE MUSCLE IS A CHIP AND NOT JUST THE RAIL ──────────────────────
    /// The rail has been coloured by muscle family since Wave 2.4 and has never
    /// said which one. A colour with no key is decoration: it can tell you two
    /// cards differ and never what either of them is. The chip is the key, in
    /// the same colour, and it costs the line 46 pt it can afford now that the
    /// row below has stopped spelling its own widths.
    private var header: some View {
        VStack(alignment: .leading, spacing: OnyxSpace.xs) {
            // ── WHY THE REGISTER LEAVES THE TITLE'S LINE AT AX5 ─────────────
            // It is baseline-aligned to the first line of a title that wraps,
            // so "Chest Press" over three lines put `1 OF 7` beside
            // the word "Chest" — a line that reads as a claim about the chest
            // and is not one. Below the title it is unambiguous and costs the
            // header nothing it was not already spending on a wrapped name.
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    title
                    HStack(spacing: OnyxSpace.s) {
                        register
                        Spacer(minLength: 0)
                        grip
                    }
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: OnyxSpace.s) {
                    title
                    Spacer(minLength: OnyxSpace.xs)
                    register.layoutPriority(1)
                    grip
                }
            }

            prescription

            // ── THE `last · 40kg × 11` LINE IS GONE ─────────────────────────
            // It was the seed's answer to "what did I do last time", and the
            // seed is ALSO what every unticked row in the table below is
            // already showing: the row's own load and rep count open on exactly
            // the numbers this line named. So on the card where it mattered
            // most — a fresh movement, nothing ticked — it printed the first
            // row's two figures a second time, eighteen points above them, and
            // cost the header a line to do it.
            //
            // What it did carry that the rows do not is the DATE, and that has
            // its own home: the seed's provenance is on the card's source chip,
            // and the full history is one tap away in the exercise sheet.
            // Founder asked for the line gone; it was restating the table.

            if !exercise.note.isEmpty {
                Text(exercise.note)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, OnyxSpace.m)
        .padding(.vertical, OnyxSpace.s)
    }

    private var title: some View {
        Text(exercise.name)
            .onyxDisplay()
            .foregroundStyle(Color.onyx.textPrimary)
            // At AX5 "Single Arm Cable Cross-over" ran to five lines and pushed
            // every set off the card. Three lines and a little optical shrink
            // keeps the whole name AND the work it names.
            .lineLimit(3)
            .minimumScaleFactor(0.7)
            .fixedSize(horizontal: false, vertical: true)
            // ── THE REORDER, WITHOUT THE DRAG ───────────────────────────────
            // The grip is a drag affordance and a drag affordance alone is not
            // an affordance: VoiceOver cannot lift it, and neither can anyone
            // holding a barbell in the other hand. These are the same call the
            // drop makes, on the element you land on first when you swipe onto
            // a card — the movement's own name.
            .accessibilityActions {
                if position.index > 0 {
                    Button("Move up") {
                        withAnimation(OnyxMotion.move) {
                            model.moveExercise(from: position.index, to: position.index - 1)
                        }
                    }
                }
                if position.index < position.total - 1 {
                    Button("Move down") {
                        withAnimation(OnyxMotion.move) {
                            model.moveExercise(from: position.index, to: position.index + 1)
                        }
                    }
                }
            }
    }

    /// The drag handle — what the web deck puts in the same corner.
    ///
    /// ── WHY `.draggable` AND NOT A GESTURE ──────────────────────────────────
    /// `AtlasFigure` records what a hand-rolled `.gesture` inside a `ScrollView`
    /// costs: it WINS against the scroll pan, and a 300 pt figure became a dead
    /// zone until it was rewritten as a `.simultaneousGesture` with a one-shot
    /// axis lock. There is nothing to arbitrate here — the system's drag
    /// interaction and the scroll already know about each other, they hand off
    /// on the long press, and the deck keeps scrolling under a lifted card.
    /// `DashboardGrid` drags the same way for the same reason.
    ///
    /// Narrow and full-height: 30 pt is all the width a header with a
    /// three-line name at AX5 can spare on a 375 pt phone, and 44 pt of height
    /// is the platform's minimum for the finger that has to find it.
    private var grip: some View {
        Image(systemName: "line.3.horizontal")
            // A ROLE, never `.system(size:)` — `native-token-discipline` fails
            // the build on one, and a symbol sized in points ignores the type
            // setting the rest of the header respects.
            .onyxType(.caption)
            .foregroundStyle(Color.onyx.textTertiary)
            .frame(width: 30, height: 44)
            .contentShape(.rect)
            .draggable(exercise.id) {
                // The name, not a screenshot of the card. A lifted preview of a
                // 300 pt card covers the deck it is being dropped into.
                Text(exercise.name)
                    .onyxType(.secondary)
                    .foregroundStyle(Color.onyx.textPrimary)
                    .padding(.horizontal, OnyxSpace.m)
                    .padding(.vertical, OnyxSpace.s)
                    .onyxGlass(.row)
            }
            // The reorder is reachable from the title's own rotor actions, and
            // a handle VoiceOver cannot lift is an element it should not stop on.
            .accessibilityHidden(true)
    }

    private var register: some View {
        Text("\(position.index + 1) of \(position.total)")
            .onyxMicro()
            .accessibilityLabel("Movement \(position.index + 1) of \(position.total)")
    }

    /// The instruction line: what this movement is, what it has to land in, and
    /// whether the load goes up today.
    ///
    /// ── WHY IT STACKS AT AN ACCESSIBILITY SIZE ──────────────────────────────
    /// The chips are `fixedSize` — a rep window that truncates is a prescription
    /// with a number missing, which is worse than one on a second line. At AX5
    /// `@ 10–12` alone is about 200 pt and the progression chip another 150, so
    /// on a 375 pt phone the single line overflowed by roughly 27 pt and the
    /// CARD took it out of the deck's 12 pt gutter: it drew to both edges of the
    /// glass and the sets-done fraction was pushed off the screen entirely.
    /// That is the same failure the set row itself used to have, one line up.
    ///
    /// So at an accessibility size the line becomes two, exactly as the set row
    /// below it becomes three. The metadata chips leave rather than wrap: they
    /// are the least load-bearing thing here, and "Compound" is not worth a
    /// third line of a header on a phone that has room for two sets.
    @ViewBuilder
    private var prescription: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                HStack(spacing: OnyxSpace.xs) {
                    repWindow
                    Spacer(minLength: 0)
                    progress
                }
                progression
            }
            .lineLimit(1)
        } else {
            HStack(spacing: OnyxSpace.xs) {
                if let family {
                    tag(family.displayName, Color.onyx.muscle(family))
                }
                if let first = tags.first {
                    tag(first.label, Color.onyx.textSecondary)
                }
                repWindow
                progression
                Spacer(minLength: 0)
                progress
            }
            .lineLimit(1)
        }
    }

    /// What the movement IS, from `OnyxCore.ExerciseTags` — the same list the
    /// weekly export and the library read, so a lift described as a compound
    /// here is not an isolation there. One chip, not the whole row: the header
    /// is 56 pt and the tags are the least load-bearing thing on it.
    private var tags: [ExerciseTag] {
        ExerciseTags.tags(for: exercise.name, compound: exercise.plan.isCompound)
    }

    @ViewBuilder
    private var progress: some View {
        if exercise.isComplete {
            Label("Done", systemImage: "checkmark.seal.fill")
                .onyxType(.caption).fontWeight(.semibold)
                .foregroundStyle(Color.onyx.good)
                .transition(.scale.combined(with: .opacity))
        } else {
            Text("\(exercise.workingSets)/\(exercise.plan.sets(for: model.phase))")
                .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
                .foregroundStyle(Color.onyx.textSecondary)
                // Or VoiceOver reads the glyph: "3 slash 4".
                .accessibilityLabel(
                    "\(exercise.workingSets) of \(exercise.plan.sets(for: model.phase)) sets done"
                )
        }
    }

    /// The double-progression window, with the CEILING called out.
    ///
    /// The floor is where the set starts and the ceiling is the thing you are
    /// trying to reach — "increase load only when ALL work sets hit the ceiling
    /// at RPE ≤ 8.5". Printing both in the same colour makes the rule invisible.
    ///
    /// `@` rather than a bare range: on a line that also carries a muscle, a
    /// tag and a bump, `8–12` alone reads as one more chip of metadata. `@ 8–12`
    /// reads as an instruction, which is what it is.
    @ViewBuilder
    private var repWindow: some View {
        if let window = exercise.plan.repWindow {
            HStack(spacing: 1) {
                Text("@ ").foregroundStyle(Color.onyx.textTertiary)
                Text("\(window.floor)").foregroundStyle(Color.onyx.textSecondary)
                Text("–").foregroundStyle(Color.onyx.textTertiary)
                Text("\(window.ceiling)").foregroundStyle(Color.onyx.accent(.train))
            }
            .onyxType(.caption).fontWeight(.semibold).onyxNumeral()
            .fixedSize()
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, OnyxSpace.xs)
            .onyxGlass(.row)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Rep window \(window.floor) to \(window.ceiling)")
        } else {
            tag(exercise.plan.reps, Color.onyx.textSecondary)
        }
    }

    /// The engine said the load goes up today, and this row opened on it.
    ///
    /// Read from the ROWS rather than from `progressionAlerts`: the alert is
    /// what the queue published at open, and the seed is what actually landed
    /// in the field. If a rebuild has since dropped the bump — a phase change,
    /// a set trimmed — the chip goes with it, which an alert-backed chip would
    /// not. `E4` sets `progressed` on exactly the rows it pre-filled.
    @ViewBuilder
    private var progression: some View {
        if let bump = exercise.rows.first(where: { $0.progressed }), let kg = bump.weightKg {
            HStack(spacing: 2) {
                Image(systemName: "arrow.up.right")
                Text(OnyxFormat.kg(kg)).onyxNumeral()
            }
            .onyxType(.caption).fontWeight(.bold)
            .foregroundStyle(Color.onyx.good)
            .fixedSize()
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, OnyxSpace.xs)
            .background(
                Capsule(style: .continuous).fill(Color.onyx.good.opacity(0.16))
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Load goes up today, to \(OnyxFormat.kg(kg)) kilograms")
        }
    }

    private func tag(_ text: String, _ color: Color) -> some View {
        Text(text)
            .onyxType(.caption)
            .foregroundStyle(color)
            .fixedSize()
            .padding(.horizontal, OnyxSpace.s)
            .padding(.vertical, OnyxSpace.xs)
            .onyxGlass(.row)
    }

    // MARK: - Sets

    /// ── WHY THIS IS NOT A `ScrollView` ──────────────────────────────────────
    /// It was, and a scroll view takes every point of height it is offered — so
    /// a two-set movement drew a card with 900 pt of nothing under the last row,
    /// which is §3.6's "no tile taller than its content" in the file that was
    /// supposed to fix it. The card hugs its rows; the DECK PAGE around it is
    /// the scroll view, so a movement with eight sets still scrolls and one with
    /// two is two rows tall.
    private var sets: some View {
        VStack(spacing: OnyxSpace.xs) {
            columnHeaders
            ForEach(Array(exercise.rows.enumerated()), id: \.element.id) { index, row in
                SetRowView(
                    row: row,
                    ordinal: index + 1,
                    rail: rail,
                    isWeightless: isWeightless,
                    isTimed: isTimed,
                    onLog: { model.toggleDone(row, in: exercise) },
                    onCommit: { model.commitEdit(row, in: exercise) },
                    onDelete: { withAnimation(OnyxMotion.move) { model.removeSet(row, from: exercise) } },
                    onOptions: {
                        optionsFor = SetTarget(id: row.id, ordinal: index + 1, wasStale: row.rpeStale)
                    },
                    onEffort: {
                        effortFor = SetTarget(id: row.id, ordinal: index + 1, wasStale: row.rpeStale)
                    }
                )
            }

            Button {
                withAnimation(OnyxMotion.move) { model.addSet(to: exercise) }
            } label: {
                Label("Add set", systemImage: "plus")
                    .onyxType(.secondary)
                    .foregroundStyle(Color.onyx.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .onyxGlass(.row)
            }
            .onyxPress(scale: 0.98)
        }
        // ── WHY THE GUTTER IS 4 AND NOT 8 ───────────────────────────────
        // A set row is a badge, two steppers and an effort word, and their
        // minimum widths add up to within a few points of a 402 pt screen. Every
        // point of padding between the card's edge and the row is a point the
        // row takes back by overflowing — which it did, silently: the deck's own
        // 16 pt inset vanished and the cards drew edge to edge, because a
        // `ScrollView` does not clip an over-wide child, it just lets it win.
        // The gutters are the cheapest thing in that budget and the tap targets
        // are the most expensive, so the gutters pay.
        .padding(.horizontal, OnyxSpace.xs)
        .padding(.bottom, OnyxSpace.m)
    }

    /// What the columns are.
    ///
    /// The rows carried no header at all: a bare `47`, a `×` and a `12`, with
    /// the load's unit printed once per row and the rep count's not printed
    /// anywhere. It reads as an equation rather than as a table, and which
    /// number is which is something you infer from their size.
    ///
    /// ── AND WHY IT AGREES WITH THE ROW BY CONSTRUCTION ──────────────────────
    /// It does not repeat the row's widths — it repeats the row's SHAPE. Both
    /// are an `HStack` of a fixed badge, a flexible column, a fixed rep column
    /// and a second flexible column, so the two flexible tracks are handed the
    /// same share of the same leftover by the same layout pass. Spelling the
    /// widths twice is how a header reading `KG` ends up over a column of rep
    /// counts, and nothing in the type system notices. See `SetColumn`.
    ///
    /// ── AND WHY IT IS ABSENT AT AN ACCESSIBILITY SIZE ───────────────────────
    /// There the row stacks the load OVER the reps, so there are no columns for
    /// a header to name; four labels over a two-line row would be a caption on
    /// a photograph of itself. The fields keep their own spoken labels, which is
    /// the thing that was actually load-bearing.
    @ViewBuilder
    private var columnHeaders: some View {
        if !typeSize.isAccessibilitySize {
            HStack(spacing: SetColumn.gap) {
                head("SET").frame(width: SetColumn.badge)
                // Centred on the CELL, which is where the numeral is centred
                // too — the two stepper ends are the same width, so the field
                // sits in the middle of the group and a label in the middle of
                // the group sits over it.
                //
                // ── AND WHY BOTH FLOORS ARE NAMED HERE ──────────────────────
                // "Same shape, therefore same split" was not enough. The row's
                // kg track cannot go below `weightGroup` (two 32 pt ends and a
                // 44 pt field), while a bare `Text` in a flexible frame has a
                // floor of nothing — so on a 375 pt phone the row's kg track
                // took its 108 pt minimum and the header's took an even share
                // of 91.5, and `KG` sat eight points left of the number it
                // names. It converged only at about 430 pt: correct on the
                // widest phone and wrong on the narrowest, which is backwards.
                // The floors are the same on both sides now, so the two stacks
                // squeeze identically.
                // ── AND THE COLUMN IS ABSENT, NOT EMPTY, ON A REPS-ONLY
                // MOVEMENT ──────────────────────────────────────────────────
                // A Reverse Crunch has no external load and a Plank has no
                // reps at all; a `0 kg` stepper on either is a control that
                // cannot be right. Dropping the whole track gives the two
                // columns that DO mean something the width, which at 375 pt is
                // the difference between "Max Effort" and "Max Eff…".
                if !isWeightless {
                    head("KG").frame(minWidth: SetColumn.weightGroup, maxWidth: .infinity)
                }
                head(isTimed ? "TIME" : "REPS").frame(minWidth: SetColumn.reps)
                head("EFFORT")
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, OnyxSpace.xs)
            .padding(.top, OnyxSpace.xs)
            .accessibilityHidden(true)
        }
    }

    /// ── WHY THE HEADERS ARE UPPERCASE AND THE ROW IS NOT ────────────────────
    /// `Set / kg / Reps / Effort` in sentence case read as four more words on a
    /// screen already full of them, one of which — `kg` — is also a unit that
    /// used to be printed on every row. Small caps put the header in a
    /// different REGISTER from its column: nothing in the table is uppercase,
    /// so nothing in the table can be mistaken for a heading.
    ///
    /// `fixedSize` because the column it names is narrower than the word:
    /// `REPS` over a 32 pt rep field truncated to `RE…`, which is a header that
    /// has stopped being one. A label wider than its track overflows into the
    /// stepper's own padding either side and stays centred on the value, which
    /// is the only property that mattered.
    private func head(_ text: String) -> some View {
        Text(text)
            .onyxMicro()
            .fontWeight(.semibold)
            .tracking(0.6)
            .foregroundStyle(Color.onyx.textTertiary)
            .lineLimit(1)
            .fixedSize()
            .multilineTextAlignment(.center)
    }
}

// MARK: - The columns

/// ── ONE SET OF WIDTHS, DECLARED ONCE — AND TWO THAT ARE NOT WIDTHS ──────────
/// The header and the rows under it are different views, and the only thing
/// that makes them a table is that they agree about their columns. The web
/// app's `setGrid.ts` exists for exactly this reason; this is its half.
///
/// ── WHY THE TWO WIDE COLUMNS HAVE NO NUMBER HERE ────────────────────────────
/// They used to. Badge 44, four stepper ends at 34, a 50 pt load, a 32 pt rep
/// count, an 18 pt unit and a 68 pt effort word add up — with the row's own
/// gaps — to 362 pt, and the row is handed 362 pt on a 402 pt phone and **335
/// on a 375 pt one**. It did not fit, it did not say so, and what it did
/// instead was take the 12 pt deck gutter and draw the cards to the edge of the
/// glass: the exact failure `logger-wave-u` describes. A record set was worse
/// still — the trophy was a sixth column, and 380 pt of row never fitted any
/// phone this app runs on. (The trophy now lives in the badge, where the set's
/// state already is, and costs the row nothing.)
///
/// A table whose columns sum to the width of one particular phone is a table
/// that is wrong on every other one, and adding a point anywhere is a silent
/// overflow. So the load and the effort are FLEXIBLE tracks: the fixed chrome
/// is declared here, the leftover is split between those two by the layout
/// pass, and the header — being the same shape — gets the identical split for
/// free. 375 pt now leaves 59 pt a side and 402 pt leaves 73, and neither is a
/// number anybody has to maintain.
private enum SetColumn {
    /// The badge: the platform's minimum target, and the row's identity.
    static let badge: CGFloat = 44
    /// A stepper end. 32 rather than 44 because a badge, four of these, a rep
    /// count and two flexible tracks share 335 pt on the narrowest phone this
    /// app runs on, and adjacent targets in a control GROUP are the one place
    /// the HIG lets a 44 pt square breathe sideways. The full 44 is kept
    /// vertically, which is the axis a thumb actually misses on.
    static let step: CGFloat = 32
    /// Rep counts are two glyphs and never more: this is the one number column
    /// that can be fixed without lying about the values it holds.
    static let repsField: CGFloat = 32
    /// The narrowest a load is ever drawn. A floor and not a track: `137.5`
    /// takes more than this and is allowed to, on the stacked accessibility row
    /// where nothing is lining up under a header anyway.
    ///
    /// ── WHY 56 AND NOT 44 ───────────────────────────────────────────────────
    /// 44 was the tap-target minimum reused as a text width, and the two are
    /// not the same question. A cable stack beaten by the fine step lands on
    /// `11.25` and `13.75` — five glyphs of semibold body monospaced numerals,
    /// which is about 45 pt before the field's own insets — so the number the
    /// half-plate progression exists to produce was the one number the row
    /// could not show, and it rendered `11…`. 56 fits six (`123.75`), which is
    /// every load this app can propose. Past that `minimumScaleFactor` on the
    /// field takes over, because a load that scales down is legible and a load
    /// that ellipsises is not a load.
    ///
    /// It costs the row 12 pt out of the effort track: 375 pt still leaves it
    /// 95 and 402 leaves 122, against the 68 that column needs for a word.
    static let weightFloor: CGFloat = 56
    /// The whole rep group — the field and its two ends. The header names the
    /// GROUP, so it needs the group's width and not the field's. A FLOOR on
    /// both sides rather than a fixed width: three digits, or a non-accessibility
    /// size large enough to widen the numeral, pushes the row's group past this
    /// and a header pinned to it would stop agreeing.
    static let reps: CGFloat = repsField + step * 2
    /// The whole load group, and the row's true minimum for it.
    static let weightGroup: CGFloat = weightFloor + step * 2
    /// Between columns. 4 rather than 8 for the same reason the card's gutter
    /// is: the row is the one place in this app where a gap competes with a tap
    /// target, and the target wins.
    static let gap: CGFloat = OnyxSpace.xs
}

// MARK: - Addressing a row

/// Which set a sheet is about — by ID, never by reference.
///
/// The row is a `@MainActor` reference type that the session can replace under
/// the presenter (a watch sync, a phase rebuild, a set trimmed). A sheet that
/// held one would go on editing a row the session no longer contains, and the
/// edit would land in the log as an amend to a set nobody performed.
private struct SetTarget: Identifiable, Equatable {
    let id: String
    let ordinal: Int
    /// Whether the seeded rating had gone stale WHEN THE SHEET OPENED.
    ///
    /// A `let`, and captured here rather than read off the row, because the
    /// effort sheet's height depends on it and picking a rung clears it: read
    /// live, the sheet lost its note and shrank 80 pt under the thumb that was
    /// still on the ladder.
    let wasStale: Bool
}

// MARK: - One set

/// A set: 44 pt, driven from its own number.
///
/// ── WHY THE SWIPE IS GONE ───────────────────────────────────────────────────
/// You used to log a set by pushing the row to the right and open its options
/// by pushing it left. The gesture was good and the cost was everywhere else:
/// it owned the row's whole horizontal axis, so the long press that opened the
/// options had to hide BEHIND the controls to avoid the steppers, a duplicate
/// fired at 0.45 s from anywhere on the row that was not a button, and the deck
/// under it could not be flicked sideways without a set being logged by
/// accident. It also had no home for a state: `armed`, `dragX` and a
/// rubber-banding curve existed to describe a gesture whose entire output was
/// one boolean.
///
/// The badge does both jobs and always did — tap logs, hold opens the options —
/// and it is a 44 pt target rather than a 320 pt one that must first be told
/// apart from a scroll. What the swipe was really buying was a way to log
/// without aiming, and holding the whole row hostage for it cost the row more
/// than it was worth.
///
/// ── THE HAPTICS ─────────────────────────────────────────────────────────────
/// The ones §3.4 names and no others: `.impact(.soft)` on the commit,
/// `.success` on a record, `.selection` on a detent — all landing on the same
/// frame as the motion, because latency between the senses is what destroys the
/// illusion that the gesture caused the feedback.
private struct SetRowView: View {
    @Bindable var row: LoggerModel.SetRow
    let ordinal: Int
    let rail: Color
    /// Resolved by the CARD, not the row: it is a property of the movement and
    /// the header has to agree with every row under it. Two answers to one
    /// question is how the header and the row ended up eight points apart at
    /// 375 pt the last time this table was touched.
    var isWeightless = false
    var isTimed = false
    let onLog: () -> Bool
    let onCommit: () -> Void
    let onDelete: () -> Void
    /// Both sheets belong to the CARD — see `ExerciseCardView.optionsFor`. The
    /// row only says which one to open, and about which set.
    let onOptions: () -> Void
    let onEffort: () -> Void

    @State private var justLogged = false
    /// Which log the current flash belongs to. Two ticks inside 300 ms had the
    /// first one's timer clear the second one's receipt.
    @State private var flashToken = UUID()
    /// The badge's own press state. It is not a `Button` — see `badge` — so the
    /// press scale a `buttonStyle` used to give it is driven from here.
    @State private var badgeDown = false
    /// Separate counters because `.sensoryFeedback` fires on a CHANGE and the
    /// events are independent — a record must not be swallowed by a commit that
    /// happens to land in the same frame.
    @State private var commitTicks = 0
    @State private var recordTicks = 0
    @Environment(\.dynamicTypeSize) private var typeSize

    private var canLog: Bool { (row.reps ?? 0) > 0 }

    var body: some View {
        content
            .background(rowFill)
            .overlay { rowBorder }
            .clipShape(RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous))
            .frame(minHeight: 44)
            .opacity(row.kind == .ghost ? 0.45 : 1)
            .animation(OnyxMotion.move, value: row.isDone)
            .animation(OnyxMotion.fade, value: justLogged)
            .sensoryFeedback(.impact(flexibility: .soft), trigger: commitTicks)
            .sensoryFeedback(.success, trigger: recordTicks)
            .accessibilityElement(children: .contain)
    }

    // MARK: The row itself

    private var content: some View {
        HStack(spacing: SetColumn.gap) {
            badge
            // Side by side until the type size says otherwise: at AX5 a load, a
            // rep count and four stepper targets cannot share one line, and a
            // row that truncates its own numbers is worse than one that is two
            // lines tall (§3.1 allows exactly that, and only that).
            if typeSize.isAccessibilitySize {
                // THE EFFORT COMES DOWN HERE TOO. It is a word now, and the
                // widest of them — "Challenging" — cannot share a line with an
                // AX5 load and its two steppers. A third line costs this row
                // 30 pt at a size where it is already 120 tall.
                VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                    if !isWeightless { weightField }
                    repsField
                    effort
                }
                .padding(.vertical, OnyxSpace.s)
                Spacer(minLength: 0)
            } else {
                // No `×` between them any more. It was the row's way of saying
                // which number was which, and the column headers say it better
                // and once — where this said it on all forty rows, in the width
                // that the effort word now uses to say something.
                if !isWeightless { weightField }
                repsField
                effort
            }
        }
        .padding(.horizontal, OnyxSpace.xs)
        .frame(minHeight: 44)
        .frame(maxWidth: .infinity)
    }

    /// The ordinal — and the tap path.
    ///
    /// ── AND THE RECORD ──────────────────────────────────────────────────────
    /// The trophy used to be its own column between the rep count and the
    /// effort, which meant a record row was 18 pt wider than a normal one and
    /// no phone was wide enough for it. It belongs here anyway: the badge is
    /// already where this set's STATE is drawn — logged, warm-up, ghost — and
    /// "this one has never been beaten" is the same kind of fact. Gold fill,
    /// trophy in place of the tick, and the row keeps its gold sweep.
    private var badge: some View {
        ZStack {
            badgeSurface
            if row.isDone && row.kind == .normal {
                // ── THREE OUTCOMES, ONE GLYPH SLOT ──────────────────────────
                // A record outranks a failure: both are true of a set taken to
                // the stop that beat something, and "you beat it" is the fact
                // worth the slot. `F` then says the set went to failure, which
                // the effort column ALSO says in words — deliberately, because
                // the badge is what you see in peripheral vision scrolling the
                // deck and the word is what you read when you stop.
                Group {
                    if isRecord {
                        Image(systemName: "trophy.fill")
                    } else if isFailure {
                        Text("F")
                    } else {
                        Image(systemName: "checkmark")
                    }
                }
                    .onyxType(.caption).fontWeight(.heavy)
                    .foregroundStyle(Color.onyx.base)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            } else {
                Text(row.kind.badge ?? "\(ordinal)")
                    .onyxType(.caption).fontWeight(.bold).onyxNumeral()
                    .foregroundStyle(badgeInk)
                    // The badge is the one column that must NOT grow with the
                    // type size — it is the row's identity and its 44 pt
                    // target, and a badge that grew would take the width from
                    // the two numbers beside it. So the glyph scales inside it
                    // instead: at AX5 an unscaled `W` drew wider than the box
                    // and clipped to a shape that was no longer a letter.
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
        }
        .frame(width: 32, height: 32)
        // A set carrying a technique note says so, or the second axis is data
        // you can only see by opening the sheet that wrote it. A dot rather
        // than a chip: the row has no width for a sixth thing, and what the
        // note SAYS is a question, not a glance.
        .overlay(alignment: .topTrailing) {
            if row.quality != nil {
                Circle()
                    .fill(Color.onyx.accent(.train))
                    .frame(width: 6, height: 6)
                    .offset(x: 3, y: -3)
            }
        }
        .frame(width: SetColumn.badge, height: SetColumn.badge)
        .scaleEffect(badgeDown ? 0.9 : 1)
        .animation(OnyxMotion.flick, value: badgeDown)
        // AFTER the scale, or the hit region shrinks with the press — the
        // target gets smaller at exactly the moment a finger is on it.
        .contentShape(Rectangle())
        // The badge is a hand-rolled control (see below), and the traits under
        // this only mean something if there IS an element to put them on. A
        // logged set's badge contains an unlabelled `Image` and a `Shape`,
        // neither of which is one — so without this, ticking a set removed the
        // badge, its default action and its whole rotor from VoiceOver.
        .accessibilityElement(children: .ignore)
        // ── WHY THIS IS NOT A `Button` ──────────────────────────────────────
        // It needs two gestures on one target: a tap that logs the set and a
        // hold that opens the set's options. A `Button` with a long press
        // attached is the arrangement `WaterRow` documents at length and does
        // not use — the two contend for the same touch sequence, and the two
        // outcomes are "the hold never fires" and "both fire", which here would
        // mean opening the options sheet on top of a set you just logged by
        // accident. So: a plain surface with both gestures, the press scale a
        // `buttonStyle` was giving it driven from `pressing:`, and the button
        // trait and default action put back by hand for VoiceOver.
        .onTapGesture { log() }
        .onLongPressGesture(
            minimumDuration: 0.45,
            pressing: { badgeDown = $0 },
            perform: { onOptions() }
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(
            (row.isDone ? "Set \(ordinal), logged" : "Set \(ordinal), not logged")
            + (row.kind == .normal ? "" : ", \(row.kind.label)")
            + (row.quality.map { ", \($0.label)" } ?? "")
            + (isRecord ? ". Personal record." : "")
        )
        .accessibilityHint("Tap to log. Hold for set options.")
        .accessibilityAction { log() }
        // The actions hang off the BADGE, not off the row.
        //
        // `.accessibilityElement(children: .contain)` makes the row a
        // container, and VoiceOver does not focus a container — so actions
        // attached there have no host, and delete and set-kind were reachable
        // only by a long press. Here they are on the element a VoiceOver user
        // is already sitting on.
        .accessibilityActions {
            Button("Set options") { onOptions() }
            Button("Delete set") { onDelete() }
        }
    }

    private var isRecord: Bool { row.isRecord && row.isDone }

    /// Taken to failure — the ladder's top rung, `RpeLadder` value 10.
    ///
    /// Read off the RATING and not off `SetKind.failure`. They are two
    /// different facts: the kind is how the set was PROGRAMMED (a planned
    /// failure set), the rating is how it went. A set rated 10 is one that
    /// missed a rep or lost position, whatever it was planned as, and that is
    /// the one worth marking on the badge.
    private var isFailure: Bool {
        row.isDone && row.rpe == RpeLadder.stops.last?.value
    }

    /// ── STATE IS THE FILL TREATMENT, NOT THE HUE ────────────────────────────
    /// A warm-up and a logged set were both a solid fill in the card's accent,
    /// separated by one 13 pt glyph; a ghost and an unlogged set were both a
    /// solid neutral, separated by row opacity. And because the accent IS the
    /// muscle family, "logged" was teal on one card and lavender on the next —
    /// a colour with nothing to learn from it.
    ///
    /// Filled / outlined / dashed is separable before the glyph resolves, at
    /// 32 pt, in peripheral vision, on a dim screen — and it spends no new
    /// colour, which §3.2 has none of to spend.
    @ViewBuilder
    private var badgeSurface: some View {
        let shape = RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
        switch row.kind {
        case .warmup:
            shape.strokeBorder(rail, lineWidth: 2)
        case .ghost:
            shape.strokeBorder(
                Color.onyx.textTertiary,
                style: StrokeStyle(lineWidth: 1.5, dash: [3, 3])
            )
        default:
            shape.fill(row.isDone ? (isRecord ? Color.onyx.record : rail) : Color.onyx.hairline)
        }
    }

    /// Ink that survives every one of the five surfaces above: on a solid fill
    /// it is the base colour, on an outline it is the outline's own.
    private var badgeInk: Color {
        switch row.kind {
        case .warmup: rail
        case .ghost:  Color.onyx.textTertiary
        default:      row.isDone ? Color.onyx.base : Color.onyx.textSecondary
        }
    }

    private var weightField: some View {
        stepper(
            // ── THE UNIT MOVED UP ONE ROW ───────────────────────────────────
            // The header says `KG` once per card; printing it again on every
            // row is the same word forty times, in the width the effort rating
            // needs to be a word rather than a number. At an accessibility size
            // there IS no header — the row stacks and the columns stop existing
            // — so that is exactly where the unit is still worth its space.
            unit: "kg", showsUnit: typeSize.isAccessibilitySize,
            // 2.5 is `Ceilings.loadStepKg` — the plate that goes on a bar and
            // the notch on this athlete's stacks. 1.25 is `loadStepFineKg`, the
            // half-plate and the pin-and-magnet, and it is what the ceiling rule
            // increments by when a cable stack has finally been beaten.
            coarse: Ceilings.loadStepKg, fine: Ceilings.loadStepFineKg,
            label: "weight",
            apply: { delta in
                let next = max(0, (row.weightKg ?? 0) + delta)
                guard next != row.weightKg else { return false }
                row.weightKg = next
                return true
            }
        ) {
            NumericField(
                value: $row.weightKg, unit: "kilograms", decimals: true,
                minWidth: SetColumn.weightFloor, fills: !typeSize.isAccessibilitySize,
                prominent: true,
                // The one number on the card that CHANGED today, in the same
                // green as the header chip that explains why. The chip is four
                // rows and 180 pt away from the load it is about; without this
                // the bumped row is drawn exactly like the three that were not.
                tint: row.progressed && !row.isDone ? Color.onyx.good : nil,
                onCommit: onCommit
            )
        }
        // Flexible only while there ARE columns. On the stacked accessibility
        // row the load is not in a track — it is a line — and a stepper told to
        // fill takes the whole width and leaves its own `+` at the far edge of
        // the card, a thumb's width from the number it changes.
        .frame(maxWidth: typeSize.isAccessibilitySize ? nil : .infinity)
    }

    /// Reps take no printed unit while there is a header saying `REPS`: "7.5 kg
    /// × 12 reps" says the same thing twice on a 44 pt row.
    private var repsField: some View {
        stepper(
            // Printed only where the header is not: on the stacked row `40kg`
            // is labelled and a bare `12` beside it is not, which leaves the
            // reader inferring the second number from the first.
            unit: "reps", showsUnit: typeSize.isAccessibilitySize,
            // No fine step: a rep is already the smallest one there is, so a
            // hold repeats the coarse step rather than switching to a finer one
            // that does not exist.
            coarse: 1, fine: nil,
            label: "reps",
            apply: { delta in
                let next = max(0, (row.reps ?? 0) + Int(delta))
                guard next != row.reps else { return false }
                row.reps = next
                return true
            }
        ) {
            NumericField(
                value: Binding(
                    get: { row.reps.map(Double.init) },
                    set: { row.reps = $0.map { Int($0.rounded()) } }
                ),
                unit: "reps", decimals: false,
                minWidth: SetColumn.repsField, fills: false,
                prominent: false, tint: nil, onCommit: onCommit
            )
        }
    }

    /// A number with a minus and a plus around it.
    private func stepper<Field: View>(
        unit: String, showsUnit: Bool,
        coarse: Double, fine: Double?,
        label: String,
        apply: @escaping (Double) -> Bool,
        @ViewBuilder field: () -> Field
    ) -> some View {
        // Zero in a column — the two ends and the field ARE the control, and a
        // gap inside it reads as three things. On the stacked accessibility row
        // there is no column to hold them together, and `−40kg+` set solid is
        // one long token rather than a number with two buttons.
        HStack(spacing: typeSize.isAccessibilitySize ? OnyxSpace.xs : 0) {
            StepControl(
                symbol: "minus", coarse: coarse, fine: fine, label: label,
                sign: -1, apply: apply, onRelease: onCommit
            )
            // Swipe up and down to adjust, which is the gesture the platform's
            // own `Stepper` teaches — on the FIELD, because that is the element
            // VoiceOver focuses. Hung on the group instead, it had no host and
            // could not be reached, which is the same mistake the badge's
            // rotor documents two hundred lines up.
            field()
                .accessibilityAdjustableAction { direction in
                    switch direction {
                    case .increment: _ = apply(coarse); onCommit()
                    case .decrement: _ = apply(-coarse); onCommit()
                    @unknown default: break
                    }
                }
            if showsUnit {
                Text(unit)
                    .onyxType(.micro)
                    .foregroundStyle(Color.onyx.textTertiary)
                    // `fixedSize` because at AX5 `kg` in a fixed box wrapped to
                    // a `k` over a `g`, which is not a unit, it is a decoration.
                    // It is only ever drawn on the stacked row, where there is
                    // no header for a fixed track to hold it under — so there
                    // is no track.
                    .lineLimit(1)
                    .fixedSize()
                    .accessibilityHidden(true)
            }
            StepControl(
                symbol: "plus", coarse: coarse, fine: fine, label: label,
                sign: 1, apply: apply, onRelease: onCommit
            )
        }
        .accessibilityElement(children: .contain)
    }

    /// Effort, in WORDS, behind a picker.
    ///
    /// ── WHY THE NUMBER IS NOT THE CONTROL ───────────────────────────────────
    /// It was nine menu entries reading `10`, `9.5`, `9`, `8.5` … down to `6`.
    /// A number on a ten-point scale means nothing to anyone who has not
    /// memorised the scale, and the question being asked — how close to failure
    /// was that — has an answer everyone can give in words and almost nobody can
    /// give in decimals. `RPE_LADDER` in the web app answered it eight ways and
    /// this is the same eight, the same stored values: see `RpeLadder`.
    ///
    /// ── AND WHY THE `Menu` IS GONE ──────────────────────────────────────────
    /// A menu prints eight rungs as eight equal rows and hides the one thing
    /// this scale IS: an ordered ramp where the neighbours matter. Picking
    /// "Hard" when you meant "Very Hard" is a one-notch mistake and the menu
    /// made it look like any other. See `EffortPickerSheet`.
    private var effort: some View {
        Button { onEffort() } label: {
            // ── WHY "RATE" WEARS AN OUTLINE ─────────────────────────────────
            // Effort below 8 is drawn in secondary ink on purpose, so an
            // unrated set and a set rated 6.5 rendered as the same grey word in
            // the same place — and they demand opposite actions when you are
            // scanning the column to decide whether the next set moves up. An
            // empty slot is a stroked capsule; a reading is bare text. Shape,
            // not hue, and the ink rule survives.
            Text(RpeLadder.label(row.rpe) ?? "Rate")
                .onyxType(.caption).fontWeight(.bold)
                .foregroundStyle(row.rpe.map(Color.onyx.effort) ?? Color.onyx.textTertiary)
                .padding(.horizontal, row.rpe == nil ? OnyxSpace.s : 0)
                .padding(.vertical, row.rpe == nil ? 3 : 0)
                .overlay {
                    if row.rpe == nil {
                        Capsule(style: .continuous)
                            .strokeBorder(Color.onyx.textTertiary.opacity(0.5), lineWidth: 1)
                    }
                }
                // One line, always. "Challenging" is the longest rung and the
                // flexible track is sized by the phone rather than by the word;
                // a rating that wraps takes the row's height with it, and forty
                // of those is a card you scroll past the set you are standing in
                // front of.
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
                .frame(
                    maxWidth: .infinity,
                    alignment: typeSize.isAccessibilitySize ? .leading : .trailing
                )
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                // ── THE STALE PIP ───────────────────────────────────────────
                // `E4`'s RPE memory carries last session's rating forward, and
                // DROPS it when this row's work is harder than the set it was
                // remembered from — which is the moment the remembered answer
                // stopped being true. The pip says "this one still wants
                // rating" without claiming the row is wrong, which a red field
                // would.
                .overlay(alignment: .topTrailing) {
                    if row.rpeStale {
                        // A GLYPH and not a dot. A bare coloured dot is colour
                        // as the only channel (WCAG 1.4.1) and it is also the
                        // platform's "unread" convention — so the one mark
                        // asking you to re-enter a value read as "new", which
                        // is a thing you dismiss. An overlay, so it is still
                        // free: the row has no width to give it.
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .onyxType(.micro).fontWeight(.bold)
                            .foregroundStyle(Color.onyx.accent(.train))
                            .padding(.top, 2)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Effort")
        .accessibilityValue(
            (RpeLadder.readout(row.rpe) ?? "Not rated")
            + (row.rpeStale ? ", needs re-rating" : "")
        )
        .accessibilityHint("Opens the effort picker")
    }

    // MARK: Surfaces

    private var rowFill: some View {
        // Good for 300 ms after a commit, then back to the rail's own wash. The
        // flash is the receipt: the row you logged is the row that changed
        // colour, which no toast at the top of a screen can say.
        // A record carries the SAME hue at twice the strength. Not gold: the
        // badge is already gold and the gold sweep runs along the edge, so a
        // third gold surface would make the row a colour swatch. Twice the
        // rail's wash reads as "this row is more than the others" while still
        // saying which muscle it belongs to — which is the whole reason the
        // rail is the muscle's colour and not the day's.
        RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
            .fill(justLogged ? Color.onyx.good.opacity(0.22)
                  : isRecord ? rail.opacity(0.20)
                  : row.isDone ? rail.opacity(0.10)
                  : Color.onyx.hairline.opacity(0.35))
    }

    @ViewBuilder
    private var rowBorder: some View {
        let shape = RoundedRectangle(cornerRadius: OnyxCorner.row, style: .continuous)
        if isRecord {
            // The gold sweep. A record is the one thing on this screen worth
            // interrupting the eye for, and it is a moving highlight rather
            // than a static border so it reads as an ANNOUNCEMENT that then
            // settles, instead of a decoration the row is wearing.
            shape.strokeBorder(
                LinearGradient(
                    colors: [Color.onyx.record.opacity(0.35), Color.onyx.record, Color.onyx.record.opacity(0.35)],
                    startPoint: .leading, endPoint: .trailing
                ),
                lineWidth: 1
            )
            .phaseAnimator([0.35, 1.0], trigger: recordTicks) { border, phase in
                border.opacity(phase)
            } animation: { _ in .easeOut(duration: 0.45) }
        }
    }

    private func log() {
        // The badge used to be a `Button` and carried `.disabled(!canLog &&
        // !row.isDone)`. It is not one — a disabled view takes no gestures at
        // all, which would have taken the HOLD with it, and setting a set to be
        // a warm-up before you perform it is exactly the moment you want the
        // options. So the refusal lives here, where it only stops the tap: no
        // event, and no haptic claiming one was written.
        guard canLog || row.isDone else { return }
        let wasRecord = row.isRecord
        let became = onLog()
        commitTicks += 1
        guard became else { return }
        if row.isRecord && !wasRecord { recordTicks += 1 }
        justLogged = true
        let token = UUID()
        flashToken = token
        Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard flashToken == token else { return }
            justLogged = false
        }
    }
}

// MARK: - A stepper end

/// One end of a stepper: tap for the coarse step, hold for the fine one.
///
/// ── WHY NOT `buttonRepeatBehavior(.enabled)` ────────────────────────────────
/// That is what this was, and it repeats the SAME action — so holding `+` on a
/// load ramped it 2.5 kg at a time and the only way to reach 43.75 was to stop
/// holding and type. The two step sizes are not a preference: `Ceilings` has
/// both because a bar takes plates and a cable stack takes a pin.
///
/// So the coarse step fires on TOUCH-DOWN, which is where apple-design §1 puts
/// every response. Hold past 0.45 s and it drops into the fine step and
/// repeats, with a badge naming the step it has switched to — a control that
/// silently changes its own increment is one you cannot trust with a number you
/// care about. The store is written once, on release.
///
/// ── WHY A `Button` AND A `ButtonStyle`, NOT A GESTURE ───────────────────────
/// This was `onLongPressGesture(minimumDuration: 3600, pressing:)`, which
/// reports the two edges and yields to the scroll view — and depends entirely
/// on SwiftUI delivering a `pressing(false)` that it does not contractually
/// deliver when the view leaves the hierarchy. `ButtonStyle.Configuration`'s
/// `isPressed` is the same primitive UIKit's own buttons use: true on
/// touch-down, false on touch-up, on touch-cancel, and when the scroll view
/// steals the touch. It also hands back the button trait, the default action,
/// Full Keyboard Access and Switch Control, all of which the gesture version
/// was re-implementing by hand and getting half right.
private struct StepControl: View {
    let symbol: String
    /// The step a TAP takes.
    let coarse: Double
    /// The step a HOLD switches to, or nil where none exists (reps).
    let fine: Double?
    /// Spoken as "increase weight" / "decrease reps".
    let label: String
    /// `+1` or `-1`.
    let sign: Double
    /// Returns whether the value actually MOVED. A load clamped at zero does
    /// not, and a ramp that kept firing into the clamp was a haptic and a
    /// re-render ten times a second against a frozen number.
    let apply: (Double) -> Bool
    /// Called once, when the finger comes off — see `SetRowView.step`.
    let onRelease: () -> Void

    @State private var ramping = false
    @State private var ramp: Task<Void, Never>?
    @State private var detentTicks = 0

    /// ── HOW A PRESS IS TOLD FROM AN ACTIVATION, WITHOUT DEPENDING ON ORDER ──
    /// The press path applies the coarse step on touch-DOWN, so the `Button`'s
    /// own action must not apply it again on touch-UP — but it MUST apply it
    /// for an activation that produced no press at all (VoiceOver, Switch
    /// Control, Full Keyboard Access), which is the only reason the action
    /// exists.
    ///
    /// A single "the press handled it" flag cannot express that, and got it
    /// exactly backwards: the button's action runs synchronously inside the
    /// gesture callback while `onChange(of: isPressed)` runs on the next update
    /// pass, so the action cleared the flag before the release ever saw it —
    /// and `onRelease()`, the ONLY path from a stepper to `commitEdit`, was
    /// called zero times per press. Correcting a logged set moved the number on
    /// screen and wrote nothing to `set_events`, so the row and the ledger (and
    /// the weekly export) disagreed, permanently and silently.
    ///
    /// Two counters instead. A press bumps one; its release matches them. The
    /// release is therefore idempotent — a scene-phase teardown and a real
    /// touch-up cannot both commit — and the action's test is a comparison
    /// rather than a race: while they differ a press owns this control, and
    /// while they agree nothing does.
    ///
    /// ── AND WHY THE MATCH IS DEFERRED BY ONE TURN ───────────────────────────
    /// The paragraph above assumed an order — action first, `isPressed` second
    /// — and SwiftUI does not contract for one. Delivered the other way round,
    /// the release matched the generations BEFORE the action ran, the action's
    /// `guard !pressActive` then read false, and it applied the coarse step a
    /// second time. Every tap moved the number twice: reps by 2 where the
    /// control is declared `coarse: 1`, load by 5 where it is declared 2.5, and
    /// a hold's fine step by 2.5 where `Ceilings.loadStepFineKg` is 1.25 —
    /// three "wrong constant" bug reports with the right constants in the
    /// source, and `onRelease` committing twice underneath them.
    ///
    /// Matching them on the NEXT main-actor turn makes the guard hold under
    /// either order: whichever edge arrives first, anything else in the same
    /// turn still sees the press as owning the step. An assistive activation
    /// produces no press edges at all, so the two are equal from the start and
    /// the action still falls through — which is the only reason it exists.
    @State private var pressGeneration = 0
    @State private var releasedGeneration = 0

    private var pressActive: Bool { pressGeneration != releasedGeneration }

    @Environment(\.scenePhase) private var scenePhase

    /// Long enough that a firm tap is never mistaken for a hold, short enough
    /// that the ramp starts before the thumb asks why it has not.
    private static let holdDelay = Duration.milliseconds(450)
    /// 12.5 kg/s at the fine step: fast enough to cross a stack, slow enough to
    /// stop on the number you wanted.
    private static let repeatInterval = Duration.milliseconds(100)
    /// A ceiling on the ramp, in ticks — sixty seconds.
    ///
    /// Not a tuning knob: it is the backstop for a press-up that never arrives.
    /// A real hold is under ten seconds, and a loop that can only be stopped by
    /// a callback is a loop that runs forever the one time the callback is not
    /// delivered.
    private static let maxTicks = 600

    var body: some View {
        Button {
            // Touch-up lands here first, with the press still open — the press
            // path owns the step and the commit, so this returns. An assistive
            // activation produces no press edges at all and falls through.
            guard !pressActive else { return }
            _ = apply(sign * coarse)
            onRelease()
        } label: {
            Image(systemName: symbol)
                .onyxType(.caption).fontWeight(.bold)
                // See `SetColumn.step` for why 32 and not 44 — the full 44 is
                // kept vertically, which is the axis a thumb misses on.
                .frame(width: SetColumn.step, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(StepPressStyle(onPress: press))
        .overlay(alignment: .top) {
            if ramping, let fine {
                Text(OnyxFormat.kg(fine))
                    .onyxType(.micro).fontWeight(.bold).onyxNumeral()
                    .foregroundStyle(Color.onyx.base)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(Capsule(style: .continuous).fill(Color.onyx.accent(.train)))
                    .fixedSize()
                    .offset(y: -6)
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
                    .allowsHitTesting(false)
            }
        }
        .animation(OnyxMotion.flick, value: ramping)
        .sensoryFeedback(.selection, trigger: detentTicks)
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: ramping) { _, now in now }
        // `onDisappear` covers the row being recycled by the deck's LazyVStack
        // and nothing else — it does not fire when a sheet covers the row, and
        // it does not fire on backgrounding. Those are the scene phase's job.
        .onDisappear { release() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { release() } }
        .accessibilityLabel(symbol == "plus" ? "Increase \(label)" : "Decrease \(label)")
    }

    /// Down takes the coarse step and arms the ramp; up cancels it and writes
    /// the result down. A press cancelled by the deck scrolling out from under
    /// the thumb arrives here as an up, which is the point of driving this from
    /// a button's own press state.
    private func press(_ isDown: Bool) {
        guard isDown else { return release() }
        // UNCONDITIONALLY, and first. A `Task` is not cancelled when its last
        // reference is dropped, so overwriting `ramp` with a new one on a
        // second press-down without an intervening press-up stranded the first
        // — still looping, still adding 1.25 kg and committing ten times a
        // second, with nothing left holding a handle to cancel it.
        cancelRamp()
        pressGeneration += 1
        _ = apply(sign * coarse)
        // The detent, once per press. It used to live on the row and be bumped
        // by every ramp tick, which is ten selection haptics a second — a buzz
        // rather than a detent, and the opposite of what §3.4 asks for.
        detentTicks += 1
        ramp = Task { @MainActor in
            try? await Task.sleep(for: Self.holdDelay)
            guard !Task.isCancelled else { return }
            // Only where a fine step EXISTS. On reps the ramp keeps stepping by
            // one, and a haptic announcing a change that did not happen — with
            // no badge, correctly, to explain it — is the control lying.
            if fine != nil { ramping = true }
            for _ in 0 ..< Self.maxTicks {
                guard !Task.isCancelled else { return }
                guard apply(sign * (fine ?? coarse)) else {
                    // The value has hit its floor. The badge must stop claiming
                    // the control is still stepping, or holding `−` at zero
                    // reads as a stuck number rather than a finished one.
                    ramping = false
                    return
                }
                try? await Task.sleep(for: Self.repeatInterval)
            }
        }
    }

    /// The end of a press, from wherever it arrives: the finger lifting, the
    /// deck scrolling out from under it, the row being recycled, the scene
    /// leaving the foreground. Whichever comes first commits; the rest are
    /// no-ops, because the generation has already been matched.
    private func release() {
        cancelRamp()
        guard pressActive else { return }
        let generation = pressGeneration
        onRelease()
        // NOT `releasedGeneration = pressGeneration` here. Clearing the press's
        // ownership inside the same turn is what let the `Button`'s own action
        // — which may arrive after this — step the value a second time. One
        // hop, and the guard holds whichever edge SwiftUI delivers first.
        //
        // Idempotent across a second release in between (a scroll steal
        // followed by a real touch-up): `pressActive` is false by then, so this
        // returns above. A press that starts before the hop lands bumps
        // `pressGeneration` past `generation`, and the assignment then leaves
        // the NEW press owning the control, which is correct.
        Task { @MainActor in releasedGeneration = generation }
    }

    private func cancelRamp() {
        ramp?.cancel()
        ramp = nil
        ramping = false
    }
}

/// Reports a button's press edges, and gives it the press scale the rest of the
/// app's controls have.
///
/// The report goes through `onChange` rather than straight out of `makeBody`:
/// writing to state during a view update is the classic "Modifying state during
/// view update" runtime warning, and it is the reason this is a style rather
/// than a binding read inline.
private struct StepPressStyle: ButtonStyle {
    let onPress: (Bool) -> Void

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(configuration.isPressed ? Color.onyx.textPrimary : Color.onyx.textSecondary)
            .scaleEffect(configuration.isPressed ? 0.86 : 1)
            .animation(OnyxMotion.flick, value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, isPressed in onPress(isPressed) }
    }
}

// MARK: - Numeric entry

/// A load or a rep count, typed.
///
/// ── WHY IT KEEPS ITS OWN STRING ─────────────────────────────────────────────
/// Binding a `TextField` straight to a `Double?` through a formatter makes "49."
/// unrepresentable: the moment the decimal point is typed the value is still 49,
/// the formatter re-renders "49", and the point you just typed disappears from
/// under the cursor. The field therefore owns the text and publishes the parsed
/// value, which is the only arrangement where a half-typed number survives.
///
/// Both separators are accepted. The device's own locale here formats 1074.0 as
/// "1 074,0", and a keypad that produces a comma the parser rejects is a keypad
/// that silently discards decimals.
///
/// ── THE TWO WAYS IT IS SIZED, AND WHY BOTH EXIST ────────────────────────────
/// `fills` is the column case: the field takes the track the row's layout hands
/// it and never asks for a width of its own. That is what stopped the four
/// rigid columns adding up to more phone than exists — see `SetColumn`.
///
/// `fills == false` is the OTHER case, and dropping it was a real regression
/// for one build: on the stacked accessibility row there are no tracks, so a
/// field that only fills is a field with no width at all — the rep count drew
/// on top of its own `+` and both drew over the badge. There the field takes
/// its INTRINSIC width with a floor, which is also what the rep column wants at
/// a shipping size, since two glyphs never need more than 32 pt and a track
/// that flexed would only move the header off them.
private struct NumericField: View {
    @Binding var value: Double?
    /// Spoken, not printed. The row prints "kg" once and nothing for reps; a
    /// VoiceOver user gets both, because there is no `×` to hear.
    let unit: String
    let decimals: Bool
    /// The narrowest this field is drawn — a floor, never a cap.
    let minWidth: CGFloat
    /// Take the track the row offers (a column), or the field's own intrinsic
    /// width (a stacked row, and the rep count).
    let fills: Bool
    /// The load is the number you decide; the rep count is the number you
    /// achieve.
    ///
    /// ── AND WHY THIS IS A SIZE AND NOT JUST A WEIGHT ────────────────────────
    /// It was one weight step apart, so the only cues telling `40` from `12`
    /// were column position and a header 30 pt above that does not exist at an
    /// accessibility size — and the third cue, a decimal point, fails on
    /// exactly the common case: `40 / 12`, `40 / 10`. Two type ROLES apart, the
    /// two cells have different silhouettes at any glance angle, which is what
    /// a number read for under a second from an arm's length actually needs.
    let prominent: Bool
    /// Overrides the ink. Used for the one load a progression bumped today.
    let tint: Color?
    let onCommit: () -> Void

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField("—", text: $text)
            .keyboardType(decimals ? .decimalPad : .numberPad)
            .multilineTextAlignment(.center)
            .onyxType(prominent ? .body : .secondary)
            .fontWeight(prominent ? .semibold : .regular)
            .onyxNumeral()
            // ── A LOAD MUST NEVER ELLIPSISE ─────────────────────────────────
            // A `TextField` truncates by default, and the field is inside a
            // FLEXIBLE track — so at 375 pt `11.25` and `13.75`, the two loads
            // the fine step exists to produce, both rendered `11…`. Half a
            // number is worse than a small one: `11…` and `13…` are the same
            // glyph count and read as `11` and `13`, which are real loads two
            // plates away from the truth.
            //
            // The floor stays at `SetColumn.weightFloor`, which now fits six
            // glyphs — this only catches what is past it (a 1074 kg leg press
            // at a large non-accessibility type size), and 0.6 keeps body-size
            // numerals above the 11 pt the token discipline calls the smallest
            // legible role.
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .foregroundStyle(
                value == nil ? Color.onyx.textTertiary : (tint ?? Color.onyx.textPrimary)
            )
            .frame(minWidth: minWidth, maxWidth: fills ? .infinity : nil)
            .fixedSize(horizontal: !fills, vertical: false)
            .focused($focused)
            .accessibilityLabel(unit)
            .onAppear { text = Self.render(value) }
            // Guarded, because `onAppear` seeds `text` and that fires this on
            // the same cycle — so every row scrolling into view wrote its own
            // value back. `@Observable` setters notify unconditionally, so each
            // of those invalidated every reader of the row (the progression
            // chip reads `weightKg`, so: the whole card), and `OnyxFormat.kg`
            // rounds to two places, so a more precise load was silently
            // rewritten in memory with no commit behind it.
            .onChange(of: text) { _, next in
                let parsed = Self.parse(next)
                if parsed != value { value = parsed }
            }
            .onChange(of: focused) { _, isFocused in
                if !isFocused {
                    text = Self.render(value)
                    onCommit()
                }
            }
            // A value changed from outside the field (a stepper, a phase
            // rebuild, a row restored from the log) has to reach the text, or
            // the field keeps showing the number it was seeded with.
            .onChange(of: value) { _, next in
                guard !focused else { return }
                text = Self.render(next)
            }
            .toolbar {
                if focused {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") { focused = false }
                    }
                }
            }
    }

    private static func render(_ value: Double?) -> String {
        guard let value else { return "" }
        return OnyxFormat.kg(value)
    }

    /// ── WHY THIS CLAMPS ────────────────────────────────────────────────────
    /// `Double("99999999999999999999")` is 1e20, and the reps binding rounds
    /// that into an `Int` — which TRAPS above `Int.max` (9.22e18). A `.numberPad`
    /// has no length limit, so holding a finger on the `9` key crashed the app
    /// mid-set. `Double("1e999")` is `+infinity` and traps the same way, and
    /// `.nan` compares false against every bound, so it is rejected first.
    ///
    /// The bound is deliberately absurd rather than domain-tight: a real limit
    /// belongs to the field's owner (reps and kilograms disagree about it), and
    /// silently rewriting someone's 200 into a 20 mid-entry is worse than
    /// letting an implausible number through. This only has to keep the cast
    /// safe.
    private static let limit = 100_000.0

    private static func parse(_ text: String) -> Double? {
        let normalised = text.replacingOccurrences(of: ",", with: ".")
        guard !normalised.isEmpty, let value = Double(normalised), value.isFinite else { return nil }
        return min(max(value, -limit), limit)
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Exercise card") {
    let model = LoggerModel.previewUpperB(logged: true)
    return ExerciseCardView(exercise: model.exercises[1], model: model, position: (1, model.exercises.count))
        .padding(OnyxSpace.l)
        .frame(maxHeight: .infinity)
        .onyxScreen(.train)
}
#endif
