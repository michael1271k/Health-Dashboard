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
                    editors
                    footnote
                }
                .padding(OnyxSpace.l)
            }
            .onyxScreen(.train)
            .foregroundStyle(Color.onyx.textPrimary)
            .navigationTitle("Session timer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.height(460), .large])
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
