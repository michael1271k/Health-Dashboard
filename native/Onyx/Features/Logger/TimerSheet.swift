import SwiftUI
import OnyxUI
import OnyxCore

/// The session clock, and the four things you can do to it.
///
/// ── WHY A CLOCK NEEDS AN EDITOR AT ALL ──────────────────────────────────────
/// `duration_min` is not decoration: it multiplies session RPE into the training
/// load that feeds ACWR, monotony and strain, and readiness reads 49 days of it
/// — so one session left running through lunch moves `battery_pct` on every day
/// for the next seven weeks. The Sept 6 Upper A in the live database recorded
/// **385 minutes** for a 60-minute workout, and there was no surface anywhere on
/// either client that could have said otherwise.
///
/// So: pause when you leave, resume when you are back, and two ways to correct
/// it afterwards — the START, when you forgot to open the app until set three,
/// and the ELAPSED, when you know the session was fifty minutes and do not want
/// to do the arithmetic backwards.
///
/// ── PAUSE IS NOT PERSISTED YET ──────────────────────────────────────────────
/// `LoggerClock` holds this in memory for the life of the screen. Wave E4 gives
/// `set_events` its `pause` / `resume` kinds and derives
/// `duration_min = ended − started − paused` at close; until then this corrects
/// what you SEE and the close path still subtracts nothing.
struct TimerSheet: View {
    let clock: any PauseControlling
    let accent: Color

    @Environment(\.dismiss) private var dismiss
    /// Bumped on pause and on resume — §3.4 gives the two a distinct feel from
    /// a set being ticked, because they are the only controls on this screen
    /// that change what the session MEANS rather than what is in it.
    @State private var toggles = 0

    /// ── THE STOPWATCH'S STATE IS THE LOGGER'S, NOT THIS SHEET'S ─────────────
    /// It was `@State` here, and a sheet's `@State` dies with the sheet. The
    /// whole point of this control is to run THROUGH a hold — and the reader
    /// swipes the sheet away to look at the deck while the hold is happening,
    /// which zeroed a running stopwatch and threw the laps away. It is the same
    /// argument `WorkoutTabView`'s header makes about `LoggerModel` and the
    /// Live Activity: the thing that must outlive the cover cannot live in it.
    ///
    /// So the logger owns all three and lends them. Defaulted to `.constant`
    /// for the previews and the screenshot harness, which present the sheet
    /// with nothing behind it.
    @Binding var watchStart: Date?
    /// What every PREVIOUS run added up to. Start/stop/start has to read
    /// continuously, and the anchor date alone cannot remember.
    @Binding var accumulated: TimeInterval
    /// Newest first, and each one is a SPLIT — the hold it timed, not the
    /// running total. See the `Lap` button.
    @Binding var laps: [TimeInterval]

    init(
        clock: any PauseControlling,
        accent: Color,
        watchStart: Binding<Date?> = .constant(nil),
        accumulated: Binding<TimeInterval> = .constant(0),
        laps: Binding<[TimeInterval]> = .constant([])
    ) {
        self.clock = clock
        self.accent = accent
        _watchStart = watchStart
        _accumulated = accumulated
        _laps = laps
    }

    /// Reads and writes the clock directly rather than through a draft.
    ///
    /// A `@State` copy would need re-seeding whenever the elapsed stepper moved
    /// `startedAt` underneath it, and the two controls would then be a
    /// synchronisation problem with a loop in it. One source, two controls.
    private var startBinding: Binding<Date> {
        Binding(get: { clock.startedAt }, set: { clock.setStart($0) })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: OnyxSpace.l) {
                    reading
                    pauseButton
                    // ── THE SET STOPWATCH SITS ABOVE THE CORRECTIONS ────────
                    // Two clocks, one sheet, and the order is how often each is
                    // wanted: the session's own reading and its pause are what
                    // this sheet was built for, the stopwatch is what you open
                    // it for DURING a plank, and the two corrections are read
                    // once a month. A second sheet with its own entry point
                    // would have cost the hero band a control it has no width
                    // for (`SetColumn`'s budget is the same argument one screen
                    // over) and given the reader two places to look for "time".
                    stopwatch
                    editors
                    footnote
                }
                .padding(OnyxSpace.l)
            }
            .onyxScreen(.train)
            .foregroundStyle(Color.onyx.textPrimary)
            .navigationTitle("Timers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.height(560), .large])
        .presentationDragIndicator(.visible)
        .presentationContentInteraction(.scrolls)
        .sensoryFeedback(.selection, trigger: toggles)
    }

    // MARK: - The reading

    private var reading: some View {
        VStack(spacing: OnyxSpace.xs) {
            Group {
                if clock.isPaused {
                    Text(Clock.format(clock.elapsed()))
                } else {
                    Text(clock.timerOrigin, style: .timer)
                }
            }
            .onyxClock()
            .foregroundStyle(clock.isPaused ? Color.onyx.textTertiary : accent)
            .lineLimit(1)
            .fixedSize()

            Text(clock.isPaused ? "Paused" : "Running")
                .onyxMicro()

            if clock.pausedTotal >= 1 {
                // Stated, because it is the difference between the wall clock
                // and the number that will be saved — and an unexplained gap
                // between the two is how someone stops trusting either.
                Text("\(Clock.format(clock.pausedTotal)) paused")
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    private var pauseButton: some View {
        Button {
            withAnimation(OnyxMotion.move) {
                if clock.isPaused { clock.resume() } else { clock.pause() }
            }
            toggles += 1
        } label: {
            Label(
                clock.isPaused ? "Resume session" : "Pause session",
                systemImage: clock.isPaused ? "play.fill" : "pause.fill"
            )
            .onyxType(.body).fontWeight(.semibold)
            .foregroundStyle(Color.onyx.base)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 50)
            .background(Capsule().fill(accent))
            .contentShape(Capsule())
        }
        .onyxPress()
    }

    // MARK: - The set stopwatch

    /// A free stopwatch for timing a hold, and nothing else.
    ///
    /// ── WHY IT WRITES NOTHING ───────────────────────────────────────────────
    /// The founder's call (2026-09-11): stop it, read it, type the number into
    /// the set. The alternative — Stop commits the elapsed seconds to a chosen
    /// row and ticks it — is one gesture fewer and a great deal more machinery:
    /// it needs a target row, a rule for which row when the sheet was opened
    /// from the band rather than from a set, and an answer for a stop that
    /// lands after the deck has been rebuilt by a watch sync. A stopwatch that
    /// only tells the time cannot be wrong about which set it belonged to.
    ///
    /// ── AND WHY THERE IS NO `Timer` BEHIND IT ───────────────────────────────
    /// The reading is `Text(_:style: .timer)` over an ANCHOR DATE, which the
    /// system draws from the same clock the status bar and the watch are drawn
    /// from. So it cannot drift, it survives the screen locking, backgrounding
    /// and a scroll that would starve a `Timer`, and coming back to the app
    /// mid-hold shows the true elapsed rather than the elapsed minus however
    /// long iOS declined to run us. A repeating timer would have been a
    /// counter that is CLOSE to the clock, which is exactly what the brief
    /// ("sync perfectly with the iPhone / Apple Watch clocks") rules out.
    ///
    /// `accumulated` is what previous runs added up to, so the anchor is
    /// `started − accumulated` and start/stop/start reads continuously.
    private var stopwatch: some View {
        VStack(spacing: OnyxSpace.s) {
            HStack {
                Text("Set stopwatch").onyxMicro()
                Spacer(minLength: OnyxSpace.s)
                if !laps.isEmpty {
                    Text("\(laps.count) lap\(laps.count == 1 ? "" : "s")")
                        .onyxType(.caption)
                        .foregroundStyle(Color.onyx.textTertiary)
                }
            }

            Group {
                if let watchStart {
                    Text(watchStart.addingTimeInterval(-accumulated), style: .timer)
                } else {
                    Text(Clock.format(accumulated))
                }
            }
            .onyxClock()
            .foregroundStyle(watchStart == nil ? Color.onyx.textPrimary : accent)
            .lineLimit(1)
            // NOT `fixedSize`, unlike the session reading above it. That one is
            // laid out once per state change; this one's glyphs are advanced by
            // the system WITHOUT a SwiftUI layout pass, so a face sized at
            // `0:00` has four characters of width and clips itself at `10:00`
            // and again at `1:00:00`. The full tile width below is what it gets
            // instead, which it is centred in either way.
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Stopwatch")
            // The `Text` overload, for the same reason: a `String` here is
            // evaluated once, at the render that started the run, so VoiceOver
            // read "0:00" for the whole hold — on the one control whose value
            // IS the reading. A `Text(_:style:)` is re-read on focus.
            .accessibilityValue(
                watchStart.map { Text($0.addingTimeInterval(-accumulated), style: .timer) }
                    ?? Text(Clock.format(accumulated))
            )

            HStack(spacing: OnyxSpace.s) {
                watchButton(watchStart == nil ? "Start" : "Stop",
                            systemImage: watchStart == nil ? "play.fill" : "stop.fill",
                            filled: true) {
                    if let started = watchStart {
                        accumulated += Date().timeIntervalSince(started)
                        watchStart = nil
                    } else {
                        watchStart = Date()
                    }
                    toggles += 1
                }
                // Lap while running, Reset while stopped. One slot, and never
                // both: a stopped stopwatch has no lap to take, and a running
                // one that could be zeroed by a mis-tap is a hold you have to
                // do again.
                if watchStart == nil {
                    watchButton("Reset", systemImage: "arrow.counterclockwise", filled: false) {
                        accumulated = 0
                        laps = []
                        toggles += 1
                    }
                    .disabled(accumulated == 0 && laps.isEmpty)
                } else {
                    watchButton("Lap", systemImage: "flag.fill", filled: false) {
                        // The SPLIT, not the running total. A lap list that
                        // prints cumulative time under the label "Lap 2" is a
                        // number the reader then types into a set — and two
                        // 60-second holds would be logged as 60 and 120.
                        laps.insert(watchElapsed - laps.reduce(0, +), at: 0)
                        toggles += 1
                    }
                }
            }

            if !laps.isEmpty {
                // Newest first, and capped: the sheet is 460 pt and a list that
                // grows without bound pushes the corrections off the bottom of
                // a screen the reader did not ask to scroll.
                VStack(spacing: 0) {
                    ForEach(Array(laps.prefix(4).enumerated()), id: \.offset) { i, lap in
                        HStack {
                            Text("Lap \(laps.count - i)")
                                .onyxType(.caption)
                                .foregroundStyle(Color.onyx.textSecondary)
                            Spacer(minLength: OnyxSpace.s)
                            Text(Clock.format(lap))
                                .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                        }
                        .frame(minHeight: 32)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
        .padding(OnyxSpace.m)
        .frame(maxWidth: .infinity)
        .onyxGlass(.tile)
    }

    /// Seconds on the face right now — for VoiceOver and for a lap, both of
    /// which need the NUMBER rather than the system's own rendering of it.
    private var watchElapsed: TimeInterval {
        accumulated + (watchStart.map { Date().timeIntervalSince($0) } ?? 0)
    }

    private func watchButton(
        _ title: String, systemImage: String, filled: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .onyxType(.body).fontWeight(.semibold)
                .foregroundStyle(filled ? Color.onyx.base : Color.onyx.textPrimary)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
                .background {
                    if filled {
                        Capsule().fill(accent)
                    } else {
                        Capsule().strokeBorder(Color.onyx.hairline, lineWidth: 1)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onyxPress()
    }

    // MARK: - The corrections

    private var editors: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: OnyxSpace.xs) {
                Text("Started")
                    .onyxMicro()
                // `.wheel`, not `.compact`: the compact style opens a second
                // popover over a sheet, and a sheet inside a sheet is where this
                // control stops being one gesture.
                DatePicker(
                    "Started",
                    selection: startBinding,
                    in: ...Date(),
                    displayedComponents: [.hourAndMinute]
                )
                .datePickerStyle(.wheel)
                .labelsHidden()
                .frame(maxWidth: .infinity)
                .frame(height: 150)
                .clipped()
            }
            .padding(.horizontal, OnyxSpace.m)
            .padding(.vertical, OnyxSpace.s)

            Divider().overlay(Color.onyx.hairline)

            Stepper {
                HStack {
                    Text("Elapsed")
                        .onyxType(.body)
                    Spacer(minLength: OnyxSpace.s)
                    // The same running/paused split the headline uses.
                    // `Clock.format(clock.elapsed())` depends on `Date()`, which
                    // is not observable, so the row only redrew when the clock
                    // was edited — it read 22:00 beside a headline saying 25:00.
                    Group {
                        if clock.isPaused {
                            Text(Clock.format(clock.elapsed()))
                        } else {
                            Text(clock.timerOrigin, style: .timer)
                        }
                    }
                    .onyxType(.body).fontWeight(.semibold).onyxNumeral()
                    .foregroundStyle(accent)
                }
            } onIncrement: {
                clock.setElapsed(clock.elapsed() + 60)
            } onDecrement: {
                clock.setElapsed(clock.elapsed() - 60)
            }
            .padding(.horizontal, OnyxSpace.m)
            .frame(minHeight: 44)
            .accessibilityHint("Adjusts the session length by one minute.")
        }
        .onyxGlass(.tile)
    }

    private var footnote: some View {
        Text("Pausing stops the clock the session is saved with. Correcting the start moves it; correcting the elapsed time moves the start to match.")
            .onyxType(.caption)
            .foregroundStyle(Color.onyx.textTertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#if DEBUG
#Preview("Timer sheet") {
    TimerSheet(
        clock: LoggerClock(startedAt: Date().addingTimeInterval(-22 * 60)),
        accent: Color.onyx.day("cb_b")
    )
    .preferredColorScheme(.dark)
}
#endif
