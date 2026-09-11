import SwiftUI
import OnyxUI
import OnyxCore

/// Where it hurts, on the body it hurts on.
///
/// ── THE MAP IS THE INTERFACE ────────────────────────────────────────────────
/// What this replaces: a thumbnail of the body that was not a control, a
/// sentence listing the sore muscles in words, a chevron, and a sheet holding
/// nine named rows each with a five-segment picker. Two representations of one
/// nine-number fact, and the one that actually looks like a body was the one
/// you could not touch.
///
/// Now the figure IS the control — tap a muscle, rate it, done — and the words
/// are gone (§5.7: "no text label list"). The severity ramp is §3.2's: mild
/// Good, moderate Record, severe Danger, unsore left as the plain fill.
///
/// ── WHY A FLIP AND NOT TWO FIGURES SIDE BY SIDE ─────────────────────────────
/// Both bodies at once is what the old tile drew, and at tile width that is two
/// 44 pt figures — too small for a finger, let alone for a finger aiming at a
/// rear delt. One body at readable size, swiped over, keeps the hit targets big
/// enough to be a control at all. The dots say which side you are on.
struct DomsTile: View {
    let model: DayModel

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The body is the CONTROL on this tile, so it is sized as one: a quad has
    /// to be a target a thumb can hit, and the atlas is 120 × 260 — height is
    /// what buys width. Capped, because past 360 the figure is taller than the
    /// tile it lives in.
    @ScaledMetric(relativeTo: .body) private var figureHeight: CGFloat = 280

    @State private var showingBack = false
    /// The muscle group whose popover is up. A GROUP, not a landmark: a sore
    /// arm is a sore arm, and rating "biceps" separately from "triceps" is a
    /// precision the body does not have.
    @State private var rating: String?
    /// Every rating tap, so one `.selection` trigger serves the whole tile.
    @State private var taps = 0

    private var severity: [String: Int] { model.domsSeverity }

    /// Landmark → severity colour, for every landmark of every sore group.
    private var colors: [LandmarkMuscle: Color] {
        var out: [LandmarkMuscle: Color] = [:]
        for (group, level) in severity where level > 0 {
            for landmark in DomsMap.landmarks[group] ?? [] {
                out[landmark] = Color.onyx.severity(level)
            }
        }
        return out
    }

    var body: some View {
        DayTile("Soreness", .recover) {
            figure
            HStack(spacing: OnyxSpace.s) {
                sideDots
                Text(caption)
                    .onyxType(.caption)
                    .foregroundStyle(Color.onyx.textTertiary)
                    .lineLimit(2)
                Spacer(minLength: 0)
            }
        } trailing: {
            Text(showingBack ? "Back" : "Front").onyxMicro()
        }
        .sensoryFeedback(.selection, trigger: taps)
        // One `contextMenu`-shaped affordance for VoiceOver and for anyone who
        // cannot aim at a 20 pt calf: the same ten groups as named actions,
        // reachable from the rotor without a text list on screen. (Ten since
        // `Inner thighs` — the adductors were drawn on this map from the day it
        // was written and could never be rated.)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Soreness map, \(showingBack ? "back" : "front")")
        .accessibilityValue(spoken)
        .accessibilityActions {
            ForEach(DomsMap.muscles, id: \.self) { group in
                Button("Rate \(group)") { rating = group }
            }
            Button(showingBack ? "Show front" : "Show back") { flip() }
        }
    }

    // MARK: The body

    private var figure: some View {
        ZStack {
            side(.front).opacity(showingBack ? 0 : 1)
            // Counter-rotated so the back is a back and not a mirror of one.
            side(.back).opacity(showingBack ? 1 : 0)
                .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
        }
        .rotation3DEffect(.degrees(showingBack ? 180 : 0), axis: (x: 0, y: 1, z: 0))
        .frame(maxWidth: .infinity)
        .frame(height: min(figureHeight, 360))
        .contentShape(.rect)
        // A swipe turns the body over; §3.4 gives every drag a spring, and
        // Reduce Motion gets the cross-fade the opacity pair already provides.
        .gesture(
            DragGesture(minimumDistance: 24)
                .onEnded { drag in
                    if abs(drag.translation.width) > abs(drag.translation.height) { flip() }
                }
        )
        .popover(item: Binding(get: { rating.map(Group.init) }, set: { rating = $0?.name })) { group in
            SeverityPopover(
                group: group.name,
                current: severity[group.name] ?? 0
            ) { level in
                model.setDoms(group.name, severity: level)
                taps += 1
                rating = nil
            }
            .presentationCompactAdaptation(.popover)
        }
    }

    private func side(_ view: OnyxAtlasView) -> some View {
        // Only the SORE landmarks are handed over: `AtlasFigure` already draws
        // an unrated muscle as the plain fill, and the hit test walks
        // `OnyxAtlas.muscles` rather than this dictionary — so the whole body
        // is tappable whether or not any of it hurts.
        AtlasFigure(
            side: view == .front ? .front : .back,
            worked: DomsMap.worked(severity),
            colors: colors,
            values: spokenValues,
            onPick: { landmark in
                guard let group = DomsMap.group(of: landmark) else { return }
                rating = group
            }
        )
        .frame(maxWidth: .infinity)
    }

    /// Landmark → "Moderate", for VoiceOver's walk over the body.
    private var spokenValues: [LandmarkMuscle: String] {
        var out: [LandmarkMuscle: String] = [:]
        for (group, landmarks) in DomsMap.landmarks {
            let level = severity[group] ?? 0
            for landmark in landmarks { out[landmark] = DomsMap.levels[min(level, DomsMap.maxSeverity)] }
        }
        return out
    }

    private func flip() {
        withAnimation(reduceMotion ? OnyxMotion.fade : OnyxMotion.move) { showingBack.toggle() }
    }

    private var sideDots: some View {
        HStack(spacing: OnyxSpace.xs) {
            ForEach([false, true], id: \.self) { back in
                Circle()
                    .fill(showingBack == back ? Color.onyx.accent(.recover) : Color.onyx.hairline)
                    .frame(width: 6, height: 6)
            }
        }
        .accessibilityHidden(true)
    }

    /// What caused it, when the row says — `doms_logs` carries the session that
    /// is credited (`source_day_key`). When nothing does, the caption is the
    /// protocol instead, because "rate this in 24 hours" is the only thing an
    /// empty soreness map has to say.
    private var caption: String {
        let credited = model.doms.compactMap(\.sourceDayKey).first
        if let credited, let label = SessionAnalysis.dayLabel(credited, in: model.program) {
            return "Credited to \(label)"
        }
        return "Tap a muscle · swipe to turn"
    }

    private var spoken: String {
        DomsMap.summary(severity) ?? "nothing sore"
    }

    /// `popover(item:)` wants an `Identifiable`; a muscle group is a `String`.
    private struct Group: Identifiable {
        let name: String
        var id: String { name }
    }
}

/// Four words, one tap each.
///
/// A popover rather than a sheet: the answer is one of four and the question is
/// "this muscle" — a half-screen sheet for that loses the body you were just
/// pointing at, which is the context that makes the question answerable.
private struct SeverityPopover: View {
    let group: String
    let current: Int
    let onPick: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(group.uppercased())
                .onyxMicro()
                .padding(.horizontal, OnyxSpace.m)
                .padding(.top, OnyxSpace.m)
                .padding(.bottom, OnyxSpace.s)
            ForEach(Array(DomsMap.levels.enumerated()), id: \.offset) { level, label in
                Button { onPick(level) } label: {
                    HStack(spacing: OnyxSpace.s) {
                        Circle()
                            .fill(Color.onyx.severity(level))
                            .frame(width: 8, height: 8)
                        Text(label)
                            .onyxType(.body)
                            .foregroundStyle(Color.onyx.textPrimary)
                        Spacer(minLength: OnyxSpace.l)
                        if level == current {
                            Image(systemName: "checkmark")
                                .onyxType(.caption).fontWeight(.bold)
                                .foregroundStyle(Color.onyx.accent(.recover))
                        }
                    }
                    .padding(.horizontal, OnyxSpace.m)
                    .frame(minHeight: 44)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(level == current ? .isSelected : [])
            }
        }
        .frame(minWidth: 220)
        .presentationBackground(Color.onyx.base)
    }
}

// MARK: - The door

/// Soreness, as a 44 pt row (§W11).
///
/// ── WHY THE BODY LEFT THE SCREEN ────────────────────────────────────────────
/// `DomsTile` is 280–360 pt of figure plus its caption, which was the right
/// answer to "the map is the interface" and the wrong answer to "Pulse is four
/// screens tall". A body that size is a CONTROL, and a control you use once a
/// day does not earn a third of the screen it is used from — the same argument
/// that turned fatigue, the scale and the stack into rows in Wave 2.9, arriving
/// late for soreness because the tile drew something worth looking at.
///
/// So the tile keeps every pixel of what it was; it moves into a sheet. The row
/// carries the ANSWER — how sore, where, and a glyph in the worst severity's
/// own ink — which is what the tile's caption was doing between ratings anyway.
struct SorenessRow: View {
    let model: DayModel
    let onOpen: () -> Void

    private var severity: [String: Int] { model.domsSeverity }

    /// The groups with something on them, WORST FIRST.
    ///
    /// Not `DomsMap`'s display order, which is what `DomsMap.summary` uses: the
    /// row has one line and truncates, and in display order the sentence "Chest
    /// mild · Quads moderate" cuts the severe half off the end. Ties keep
    /// display order, so the list is still stable between ratings — a dictionary
    /// order would reshuffle the dots on every tap.
    private var sore: [(group: String, level: Int)] {
        DomsMap.muscles
            .compactMap { group -> (group: String, level: Int)? in
                guard let level = severity[group], level > 0 else { return nil }
                return (group, level)
            }
            .enumerated()
            .sorted { a, b in
                a.element.level != b.element.level ? a.element.level > b.element.level : a.offset < b.offset
            }
            .map(\.element)
    }

    private var worst: Int { sore.map(\.level).max() ?? 0 }

    /// "Quads moderate · Chest mild", or the invitation when nothing is rated.
    /// The row states it in words because the map that states it in colour is
    /// now behind a tap; worst first, so a truncated line still names the
    /// muscle worth knowing about.
    private var detail: String {
        guard !sore.isEmpty else { return "Nothing sore" }
        return sore
            .map { "\($0.group) \(DomsMap.levels[min($0.level, DomsMap.maxSeverity)].lowercased())" }
            .joined(separator: " · ")
    }

    var body: some View {
        PulseRow(
            symbol: "figure.arms.open",
            title: "Soreness map",
            detail: detail,
            // The glyph carries the worst reading, which is the one that
            // decides whether today's plan is worth a second look (§3.2: the
            // severity ramp's gold is a THRESHOLD, not a decoration).
            tint: Color.onyx.severity(worst),
            spoken: sore.isEmpty ? "nothing sore, tap to rate" : detail,
            action: onOpen
        ) {
            dots
        }
    }

    /// One dot per sore group, in its own severity's ink. Capped at four: a
    /// fifth dot in a row that also holds a sentence is a dot with nowhere to
    /// go, and the count beside it says how many were left out.
    @ViewBuilder
    private var dots: some View {
        if !sore.isEmpty {
            HStack(spacing: OnyxSpace.xs) {
                ForEach(sore.prefix(4), id: \.group) { entry in
                    Circle()
                        .fill(Color.onyx.severity(entry.level))
                        .frame(width: 7, height: 7)
                }
                if sore.count > 4 {
                    Text("+\(sore.count - 4)")
                        .onyxType(.micro).onyxNumeral()
                        .foregroundStyle(Color.onyx.textTertiary)
                }
            }
            .accessibilityHidden(true)
        }
    }
}

/// The atlas at the size it is a control at, in a sheet.
///
/// `.large` alone rather than `[.medium, .large]`: the figure is 280 pt before
/// its caption, and a medium detent opens onto a body cropped at the ribs —
/// which is the half you cannot aim a thumb at.
struct SorenessSheet: View {
    let model: DayModel

    var body: some View {
        DaySheet("Soreness", domain: .recover, glass: false, detents: [.large]) {
            ScrollView {
                DomsTile(model: model)
                    .padding(OnyxSpace.l)
            }
            .scrollContentBackground(.hidden)
            .onyxScreen(.recover)
        }
    }
}
