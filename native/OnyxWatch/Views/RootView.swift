import OnyxCore
import OnyxData
import OnyxUI
import SwiftUI

/// What the app opens on.
///
/// ── IT IS THE SET, NOT A DASHBOARD ──────────────────────────────────────────
/// The first design made a dashboard the root, and that is the phone's
/// information architecture rotated onto a wrist. Nobody raises a wrist mid-gym
/// to read "week so far", and every screen that is not the set in front of you
/// is a tap on the way to the set in front of you. So: a live session opens
/// straight into `SetView`; no live session opens a card that starts today's
/// split in one tap.
///
/// The dashboard is still here — it is one swipe away, in `DashboardView` —
/// because a glance at readiness before you start is a real thing to want. It
/// simply does not stand between you and a barbell.
struct RootView: View {

    @Environment(WatchModel.self) private var model

    var body: some View {
        NavigationStack {
            Group {
                if model.storeError != nil {
                    StoreErrorView()
                } else if model.sessionId != nil {
                    SetView()
                } else {
                    StartView()
                }
            }
        }
        // ── REST IS A STATE, NOT A PAGE ─────────────────────────────────────
        // A cover rather than a tab, because rest is not somewhere you can
        // usefully navigate TO — it is a thing that is happening to you, and it
        // ends on its own. Presenting it this way is also what lets it dismiss
        // itself at zero, which is what makes "not rated" the outcome of doing
        // nothing.
        .fullScreenCover(item: Binding(get: { model.rest }, set: { if $0 == nil { model.stopRest() } })) { pulse in
            RestView(pulse: pulse)
        }
    }
}

/// No session yet.
///
/// One tap starts today's split. The "Change" row exists because a swap is
/// real — the plan moves days — but it is deliberately the second thing on the
/// screen and not a picker you have to get through first.
struct StartView: View {

    @Environment(WatchModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                if let day = model.day {
                    Text(day.label)
                        .font(WatchType.value)
                        .foregroundStyle(WatchInk.primary)
                        .lineLimit(2)
                    Text("\(day.exercises(for: model.phase).count) movements")
                        .font(WatchType.label)
                        .foregroundStyle(WatchInk.secondary)
                } else if model.context == nil {
                    // The honest empty state. The watch cannot sign in — by
                    // design, Wave 10 — so the only way it learns who you are
                    // and what today is, is the phone's application context.
                    Text("Open Onyx on your iPhone")
                        .font(WatchType.name)
                        .foregroundStyle(WatchInk.primary)
                        .lineLimit(3)
                    Text("It sends this watch your plan.")
                        .font(WatchType.label)
                        .foregroundStyle(WatchInk.secondary)
                        .lineLimit(2)
                } else {
                    Text("Rest day")
                        .font(WatchType.value)
                        .foregroundStyle(WatchInk.primary)
                }

                NavigationLink { DashboardView() } label: {
                    Label("Today", systemImage: "chart.bar.fill")
                        .font(WatchType.label)
                }
                .tint(WatchInk.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .safeAreaInset(edge: .bottom) {
            if model.day != nil {
                Button {
                    model.beginSession()
                } label: {
                    Label("Start", systemImage: "play.fill")
                        .font(WatchType.value)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(WatchInk.commit)
                .foregroundStyle(WatchInk.onCommit)
                .handGestureShortcut(.primaryAction)
            }
        }
        .containerBackground(WatchInk.ground, for: .navigation)
        .navigationTitle("Onyx")
    }
}

/// The phone holds the pencil.
///
/// ── ONE WRITER, AND THE OTHER ONE WATCHES ───────────────────────────────────
/// The event log tolerates two devices writing at once — `SetEventFold` is why
/// nothing can be lost — so this is not a correctness mechanism. It is a user
/// experience one: without it you log set 4 on the watch, glance at a phone
/// showing a stale list, log set 4 again, and spend the middle of your workout
/// cleaning up. With it exactly one device offers a keyboard.
///
/// The button is the whole escape hatch, and it always works: `claimPencil(force:
/// true)` is the deliberate takeover that `ingestOwnership` lets through even
/// when the other device is mid-set, because somebody pressed it.
struct MirrorView: View {

    @Environment(WatchModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                Text("iPhone is logging")
                    .font(WatchType.name)
                    .foregroundStyle(WatchInk.primary)
                    .lineLimit(2)
                Text("\(model.sets.count) sets so far")
                    .font(WatchType.label)
                    .foregroundStyle(WatchInk.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .safeAreaInset(edge: .bottom) {
            Button("Log here") { model.takePencil() }
                .font(WatchType.value)
                .buttonStyle(.borderedProminent)
                .tint(WatchInk.commit)
                .foregroundStyle(WatchInk.onCommit)
        }
    }
}

/// Every planned set is in. The tick becomes a finish button.
struct FinishView: View {

    @Environment(WatchModel.self) private var model
    @State private var isFinishing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                Text("Deck complete")
                    .font(WatchType.value)
                    .foregroundStyle(WatchInk.primary)
                Text("\(model.sets.count) sets")
                    .font(WatchType.label)
                    .foregroundStyle(WatchInk.secondary)
                if let bpm = model.workout.averageHeartRate {
                    Text("\(bpm) bpm average")
                        .font(WatchType.label)
                        .foregroundStyle(WatchInk.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .safeAreaInset(edge: .bottom) {
            Button {
                isFinishing = true
                Task {
                    await model.finish()
                    isFinishing = false
                }
            } label: {
                Label("Finish", systemImage: "flag.checkered")
                    .font(WatchType.value)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(WatchInk.commit)
            .foregroundStyle(WatchInk.onCommit)
            .disabled(isFinishing)
        }
    }
}

/// The store would not open. Rare, and not something a person under a bar can
/// act on — so it says what happened and nothing else.
struct StoreErrorView: View {

    @Environment(WatchModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OnyxSpace.s) {
                Text("Store unavailable")
                    .font(WatchType.name)
                    .foregroundStyle(WatchInk.danger)
                Text(model.storeError ?? "")
                    .font(WatchType.label)
                    .foregroundStyle(WatchInk.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
