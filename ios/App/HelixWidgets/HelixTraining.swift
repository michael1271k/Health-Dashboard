import WidgetKit
import SwiftUI

// MARK: - Helix Training
//
// Six focuses over three sizes, and — since this file was written — eighteen
// distinct faces rather than eleven faces and seven fallbacks.
//
//   today     what is due, or what you finished
//   calendar  scheduled against logged, tinted by the day's own colour
//   volume    this week's tonnage against last, over eight weeks
//   streak    consecutive SCHEDULED days trained
//   records   the standing record ledger
//   oneRepMax where the main lifts are trending
//
// ── THE THREE THINGS THAT WERE WRONG HERE ────────────────────────────────────
// 1. `case .volume: if family == .systemSmall { StreakFace(…) }` — asking for
//    Volume at Small drew the streak. Not a fallback, not a near-miss: a literal
//    branch to a different focus's face.
// 2. `.records` and `.oneRepMax` both routed Large to `RecordGridFace`, so the
//    1RM Large WAS the Records Large.
// 3. `PerfLedgerFace` took a focus and used it only to pick a LINK, so the
//    Records Medium and the 1RM Medium drew identical content too.
//
// The dispatcher below switches on `(focus, HelixSize)` and is exhaustive with
// no `default:`. Adding a focus without a face is now a build error.

struct TrainingView: View {
  let entry: HelixEntry
  let focus: TrainingFocus
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var mode

  private var mono: Bool { mode == .accented }

  var body: some View {
    Group {
      if entry.isEmpty {
        Unavailable(status: entry.status, compact: family == .systemSmall)
      } else {
        face
      }
    }
    .containerBackground(Helix.background, for: .widget)
    .widgetURL(focus.link)
  }

  @ViewBuilder private var face: some View {
    switch (focus, HelixSize(family)) {
    case (.today, .small):      TodayFace(entry: entry, mono: mono, compact: true)
    case (.today, .medium):     TodayFace(entry: entry, mono: mono, compact: false)
    case (.today, .large):      TodayLargeFace(entry: entry, mono: mono)

    case (.calendar, .small):   CalendarFace(entry: entry, mono: mono, weeks: 1)
    case (.calendar, .medium):  CalendarFace(entry: entry, mono: mono, weeks: 4)
    case (.calendar, .large):   CalendarFace(entry: entry, mono: mono, weeks: 6)

    // Was `StreakFace`, literally.
    case (.volume, .small):     VolumeFocusFace(entry: entry, mono: mono)
    case (.volume, .medium):    VolumeFace(entry: entry, mono: mono)
    case (.volume, .large):     VolumeLargeFace(entry: entry, mono: mono)

    case (.streak, .small):     StreakFace(entry: entry, mono: mono)
    case (.streak, .medium):    ConsistencyFace(entry: entry, mono: mono, large: false)
    case (.streak, .large):     ConsistencyFace(entry: entry, mono: mono, large: true)

    case (.records, .small):    RecordFocusFace(entry: entry, mono: mono)
    case (.records, .medium):   RecordLedgerFace(entry: entry, mono: mono)
    case (.records, .large):    RecordGridFace(entry: entry, mono: mono)

    case (.oneRepMax, .small):  OneRepMaxFocusFace(entry: entry, mono: mono)
    case (.oneRepMax, .medium): OneRepMaxLedgerFace(entry: entry, mono: mono, large: false)
    case (.oneRepMax, .large):  OneRepMaxLedgerFace(entry: entry, mono: mono, large: true)
    }
  }
}

// MARK: - Today
//
// ── THREE STATES, ONE LAYOUT ─────────────────────────────────────────────────
// Rest, due, done. They are the same shape deliberately: a widget whose height
// and layout change with the day is one you have to re-read every morning to
// find out where the number went.
//
// The DONE state is the one that earned this face. `today` — duration, RPE,
// tonnage, sets, records — used to be thrown away by the route after the week
// aggregates were computed, so the widget could say a session existed and
// nothing whatsoever about it.

struct TodayFace: View {
  let entry: HelixEntry
  let mono: Bool
  /// Small drops the metadata row; there is no room for four figures under a
  /// headline, and a Small that tries becomes an unreadable Medium.
  let compact: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var accent: Color {
    mono ? .white : Helix.day(s?.workout.dayKey)
  }
  private var isRest: Bool { s?.workout.isRestDay == true }
  private var done: HelixSnapshot.Today? { s?.today }

  var body: some View {
    VStack(alignment: .leading, spacing: compact ? 6 : 8) {
      TodayHeader(entry: entry, mono: mono)

      Text(s?.workout.label ?? "—")
        .font(.system(size: compact ? 15 : 18, weight: .bold))
        .foregroundStyle(.white)
        .lineLimit(2)
        .minimumScaleFactor(0.8)

      if let sub {
        Text(sub).font(.system(size: 10)).foregroundStyle(Helix.muted).lineLimit(1)
      }

      Spacer(minLength: 0)

      if !compact, let done {
        Hairline()
        TodayStats(done: done, mono: mono)
      }

      if !compact {
        // ── CONTEXT, NOT A COUNT ────────────────────────────────────────────
        // This used to be "3/5 this week" over a rail, which is a number you
        // cannot act on: it says how many sessions happened and nothing about
        // WHICH, so a week of three leg days and a week of a proper rotation
        // rendered identically. The chips name the sessions in their own
        // `DAY_COLOR`, so the shape of the week is visible rather than counted.
        Hairline()
        HStack(spacing: 5) {
          Text(weekText)
            .font(.system(size: 9, weight: .semibold)).foregroundStyle(Helix.muted)
            .lineLimit(1)
          Spacer(minLength: 4)
          SessionChips(entry: entry, mono: mono)
        }
      }
    }
  }

  /// Rest says what is NEXT; due says how much of it there is; done says nothing
  /// here, because the metadata row below is already saying it.
  private var sub: String? {
    if isRest { return "recovery is the session" }
    if done != nil { return nil }
    guard let sets = s?.today?.setCount, sets > 0 else { return "not logged yet" }
    return "\(sets) sets logged"
  }

  private var weekText: String {
    guard let week = s?.week else { return "—" }
    if let target = week.sessionTarget, target > 0 { return "\(week.sessions)/\(target) this week" }
    return "\(week.sessions) this week"
  }

  private var sessionProgress: Double? {
    guard let week = s?.week, let target = week.sessionTarget, target > 0 else { return nil }
    return min(1, Double(week.sessions) / Double(target))
  }
}

/// This week's sessions, newest last, each in its own day colour.
///
/// Filled = trained, hollow outline = a scheduled day that did not happen. Rest
/// days are absent entirely: they are not sessions, and including them as a
/// third state would make the row a calendar, which is a different focus.
///
/// The label comes from `CalendarDay.label` — the plan's own words, resolved
/// server-side and previously discarded. A colour identifies a session; it
/// cannot name one, so before the payload carried the label there was nothing
/// here but dots.
private struct SessionChips: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }

  /// The trailing week of the 42-day window, scheduled days only, oldest first.
  private var week: [HelixSnapshot.CalendarDay] {
    let all = s?.calendar ?? []
    return (all.count > 7 ? Array(all.suffix(7)) : all).filter(\.scheduled)
  }

  var body: some View {
    if week.isEmpty {
      // The Fuel and Body scopes do not carry a calendar, and neither does a
      // fresh install. Silence beats an empty row of placeholder pills.
      EmptyView()
    } else {
      HStack(spacing: 3) {
        ForEach(week) { day in
          let color = mono ? Color.white : Helix.day(day.dayKey)
          Text(shortLabel(day))
            .font(.system(size: 8, weight: .bold))
            .lineLimit(1)
            .foregroundStyle(day.logged ? Helix.background : color)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(
              RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(day.logged ? color : .clear)
                .strokeBorder(color.opacity(day.logged ? 0 : 0.55), lineWidth: 1)
            )
        }
      }
    }
  }

  /// "Legs & Core B" in a chip is a chip full of ellipsis. The initials of the
  /// significant words carry it — "LCB" — and the colour does the rest.
  private func shortLabel(_ day: HelixSnapshot.CalendarDay) -> String {
    guard let label = day.label, !label.isEmpty else { return "·" }
    let initials = label
      .split(separator: " ")
      .filter { $0 != "&" }
      .compactMap { $0.first.map(String.init) }
      .joined()
      .uppercased()
    return initials.isEmpty ? "·" : String(initials.prefix(3))
  }
}

/// Glyph, state caption, stale tag. Shared so the Medium and the Large open the
/// same way — the state of the day is the first thing both have to say.
private struct TodayHeader: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var isRest: Bool { s?.workout.isRestDay == true }
  private var accent: Color { mono ? .white : Helix.day(s?.workout.dayKey) }

  var body: some View {
    HStack(spacing: 5) {
      Image(systemName: glyph)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(isRest ? Helix.muted : accent)
      Caption(caption, color: isRest ? Helix.muted : accent)
      Spacer(minLength: 0)
      if entry.isStale { StaleTag() }
    }
  }

  private var glyph: String {
    if isRest { return "moon.zzz.fill" }
    return s?.today != nil ? "checkmark.circle.fill" : "dumbbell.fill"
  }

  private var caption: String {
    if isRest { return "REST DAY" }
    return s?.today != nil ? "DONE" : "DUE TODAY"
  }
}

private struct TodayStats: View {
  let done: HelixSnapshot.Today
  let mono: Bool

  var body: some View {
    HStack(spacing: 0) {
      Stat(value: done.durationMin.map { "\($0)′" }, label: "TIME", color: .white)
      Stat(value: done.sessionRpe.map { String(format: "%.0f/10", $0) },
           label: "EFFORT", color: mono ? .white : Helix.ember)
      Stat(value: HelixSnapshot.tonnes(done.volumeKg), label: "VOLUME", color: .white)
      Stat(value: done.prCount.map { "\($0)" }, label: "RECORDS",
           color: (done.prCount ?? 0) > 0 ? (mono ? .white : Helix.gold) : Helix.muted)
    }
  }
}

/// Large · today in the context of the week it belongs to.
///
/// ── WHY THE OLD ONE WAS 70% AIR ──────────────────────────────────────────────
/// It was the Medium. A rest day has a two-word headline and a progress rail, so
/// rendering that at Large left "Rest · 5/5" floating over most of a screen's
/// worth of obsidian. The fix is not more padding — it is a second register of a
/// different kind. The week's sessions are already in the `calendar` slice, one
/// row each with the day's own colour and its tonnage, which is the thing a rest
/// day most wants to show you: what the rest is FOR.
struct TodayLargeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var accent: Color { mono ? .white : Helix.day(s?.workout.dayKey) }

  /// This week's calendar days, oldest first. The window is 42 days ending
  /// today, so the last seven ARE the trailing week.
  private var recent: [HelixSnapshot.CalendarDay] {
    let all = s?.calendar ?? []
    return all.count > 7 ? Array(all.suffix(7)) : all
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Register(title: "TODAY", accent: mono ? .white : accent) {
        TodayHeader(entry: entry, mono: mono)
        Text(s?.workout.label ?? "—")
          .font(.system(size: 24, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
        if let done = s?.today {
          TodayStats(done: done, mono: mono)
        } else if s?.workout.isRestDay == true {
          Text("recovery is the session")
            .font(.system(size: 10)).foregroundStyle(Helix.muted)
        } else {
          Text("not logged yet").font(.system(size: 10)).foregroundStyle(Helix.muted)
        }
      }

      Hairline()

      Register(title: "THE LAST SEVEN DAYS", accent: mono ? .white : Helix.emerald) {
        if recent.isEmpty {
          Text("no scheduled days on record yet")
            .font(.system(size: 10)).foregroundStyle(Helix.muted)
        } else {
          VStack(spacing: 0) {
            ForEach(Array(recent.enumerated()), id: \.element.id) { index, day in
              if index > 0 { Hairline().padding(.vertical, 3) }
              DayRow(day: day, today: s?.date, mono: mono)
            }
          }
          .frame(maxHeight: .infinity)
        }
      }
      .frame(maxHeight: .infinity)

      Hairline()

      HStack(spacing: 0) {
        Stat(value: s.map { "\($0.week.sessions)" }, label: "SESSIONS", color: .white)
        Stat(value: HelixSnapshot.tonnes(s?.week.volumeKg), label: "VOLUME", color: .white)
        Stat(value: s.map { "\($0.week.sets)" }, label: "SETS", color: .white)
        Stat(value: s?.streak.map { "\($0.current)" }, label: "STREAK",
             color: mono ? .white : Helix.ember)
      }
    }
  }
}

/// One day of the week, as a row: colour, weekday, and what happened.
private struct DayRow: View {
  let day: HelixSnapshot.CalendarDay
  let today: String?
  let mono: Bool

  private var color: Color { mono ? .white : Helix.day(day.dayKey) }
  private var isToday: Bool { day.d == today }

  var body: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(day.logged ? color : .clear)
        .strokeBorder(day.scheduled ? color.opacity(0.6) : Helix.muted.opacity(0.3), lineWidth: 1.5)
        .frame(width: 10, height: 10)
      Text(HelixSnapshot.weekdayInitial(day.d) + (HelixSnapshot.dayOfMonth(day.d).map { " \($0)" } ?? ""))
        .font(.system(size: 11, weight: isToday ? .bold : .semibold))
        .foregroundStyle(isToday ? .white : Helix.muted)
        .frame(width: 42, alignment: .leading)
      // The plan's own name for the session, which the payload now carries. A
      // week of rows reading "trained · trained · trained" said only that they
      // happened, never which ones — and which ones is the whole question a rest
      // day is asking.
      Text(day.label ?? state)
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(day.logged ? .white : Helix.muted)
        .lineLimit(1)
      Text(state)
        .font(.system(size: 9))
        .foregroundStyle(stateColor)
        .lineLimit(1)
      Spacer(minLength: 4)
      if let volume = HelixSnapshot.tonnes(day.volumeKg) {
        Text(volume)
          .font(.system(size: 11, weight: .bold, design: .monospaced))
          .foregroundStyle(.white)
      }
    }
  }

  /// A rest day is not a failure and must never be worded like one. A scheduled
  /// day still ahead of the clock is not a miss either.
  private var state: String {
    if day.logged { return "done" }
    if !day.scheduled { return "rest" }
    if isToday { return "due" }
    return "missed"
  }

  private var stateColor: Color {
    if day.logged { return mono ? .white : Helix.emerald }
    if day.scheduled && !isToday { return mono ? .white : Helix.oxide }
    return Helix.muted
  }
}

/// One figure in a footer row: value above, label under it.
///
/// `Metric` puts the two side by side, which is right for a VERTICAL list of
/// facts and wrong for a horizontal one — four side-by-side pairs across a
/// Medium wrap into an unreadable mess.
struct Stat: View {
  let value: String?
  let label: String
  var color: Color = .white

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(value ?? "—")
        .font(.system(size: 13, weight: .bold, design: .monospaced))
        .foregroundStyle(color)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(label)
        .font(.system(size: 7, weight: .bold))
        .foregroundStyle(Helix.muted)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

// MARK: - Calendar
//
// ── WHY A RING AND NOT A HEAT MAP ────────────────────────────────────────────
// The interesting fact about a training month is not how much you did on each
// day — it is whether the day the plan asked for happened. So each scheduled day
// is a ring in its OWN colour (`Helix.day`, mirroring `DAY_COLOR`): filled when
// a session landed, hollow when it did not, and a bare number on a rest day. A
// heat map would say "Tuesday was a big day" and leave "Tuesday was missed"
// looking identical to "Tuesday was a rest day".
//
// ── THE THREE THINGS THAT MADE IT UNREADABLE ─────────────────────────────────
// 1. No dates. `DayDot` drew a circle and nothing else, so the grid was a field
//    of identical rings with no way to find a day in it. `CalendarDay.d` carried
//    the date the whole time.
// 2. The columns were mislabelled. The payload window is 42 days ENDING TODAY,
//    and the grid chunked it seven at a time from index zero, then printed a
//    hardcoded "S M T W T F S" over the result. With today on a Friday the rows
//    began on a Saturday, so every column was off by one — and by a different
//    amount tomorrow. `MonthGrid` now PADS to the week boundary using the real
//    weekday of the first cell, which makes the header true by construction.
// 3. Fixed 13/16pt cells in a stack that could not grow, so a Medium filled
//    about half its height and a Large about a third. Cells are now sized from
//    the space actually available.

struct CalendarFace: View {
  let entry: HelixEntry
  let mono: Bool
  /// How many weeks this size can hold legibly. 42 cells in a Small is a
  /// texture, not a calendar.
  let weeks: Int

  private var s: HelixSnapshot? { entry.snapshot }

  /// The trailing `weeks × 7` days. Sliced by DAY count rather than by row so
  /// the padding below decides where the weeks actually break.
  private var days: [HelixSnapshot.CalendarDay] {
    let all = s?.calendar ?? []
    let wanted = weeks * 7
    return all.count > wanted ? Array(all.suffix(wanted)) : all
  }

  var body: some View {
    VStack(alignment: .leading, spacing: weeks > 1 ? 7 : 6) {
      HStack(spacing: 5) {
        Caption(weeks == 1 ? "THIS WEEK" : "CALENDAR", color: mono ? .white : Helix.steel)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
        if let streak = s?.streak, streak.current > 0 {
          HStack(spacing: 3) {
            Image(systemName: "flame.fill")
              .font(.system(size: 9))
              .foregroundStyle(mono ? .white : Helix.ember)
            Text("\(streak.current)")
              .font(.system(size: 10, weight: .bold, design: .monospaced))
              .foregroundStyle(.white)
          }
        }
      }

      if days.isEmpty {
        Text("no scheduled days yet")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      } else {
        MonthGrid(days: days, today: s?.date, mono: mono, showHeader: weeks > 1)
          .frame(maxHeight: .infinity)
      }

      if weeks >= 6 {
        Hairline()
        HStack(spacing: 0) {
          Stat(value: s.map { "\($0.week.sessions)" }, label: "THIS WEEK", color: .white)
          Stat(value: s?.streak.map { "\($0.best)" },
               label: "BEST STREAK", color: mono ? .white : Helix.ember)
          Stat(value: HelixSnapshot.tonnes(s?.week.volumeKg), label: "VOLUME", color: .white)
        }
      }
    }
  }
}

/// A week-aligned month grid with dated cells.
///
/// The alignment is the whole reason this is a type rather than a `ForEach`: the
/// payload window starts on an arbitrary weekday, so the first row is PADDED
/// with empty cells until it does. Once column zero is genuinely Sunday, the
/// header is simply true — no derived letters, no offset arithmetic at the call
/// site, and no way for the two to drift apart again.
struct MonthGrid: View {
  let days: [HelixSnapshot.CalendarDay]
  let today: String?
  let mono: Bool
  var showHeader = true

  /// Nil is a padding cell — a slot that exists so the column lines up, and
  /// which must draw nothing at all rather than an empty ring implying a day.
  private var rows: [[HelixSnapshot.CalendarDay?]] {
    guard let first = days.first else { return [] }
    let lead = HelixSnapshot.weekdayIndex(first.d) ?? 0
    var cells: [HelixSnapshot.CalendarDay?] = Array(repeating: nil, count: lead)
    cells.append(contentsOf: days.map { Optional($0) })
    // Trailing pad, so the final row is a full week and the cell width matches
    // every row above it.
    while cells.count % 7 != 0 { cells.append(nil) }
    return stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<$0 + 7]) }
  }

  var body: some View {
    GeometryReader { geo in
      let all = rows
      let headerHeight: CGFloat = showHeader ? 12 : 0
      let rowSpacing: CGFloat = 3
      let available = geo.size.height - headerHeight - rowSpacing * CGFloat(max(all.count - 1, 0))
      // Cells are square and fit BOTH axes, so the grid grows into a Large
      // instead of sitting at 16pt with a hand's width of obsidian under it.
      let cell = max(11, min(geo.size.width / 7, available / CGFloat(max(all.count, 1))))

      VStack(alignment: .leading, spacing: rowSpacing) {
        if showHeader {
          HStack(spacing: 0) {
            // True by construction: `rows` padded column zero to Sunday.
            ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { _, letter in
              Text(letter)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(Helix.muted)
                .frame(maxWidth: .infinity)
            }
          }
          .frame(height: headerHeight)
        }
        ForEach(Array(all.enumerated()), id: \.offset) { _, week in
          HStack(spacing: 0) {
            ForEach(Array(week.enumerated()), id: \.offset) { _, day in
              Group {
                if let day {
                  DayCell(day: day, isToday: day.d == today, mono: mono, size: cell)
                } else {
                  Color.clear
                }
              }
              .frame(maxWidth: .infinity)
            }
          }
          .frame(height: cell)
        }
        Spacer(minLength: 0)
      }
    }
  }
}

/// One calendar cell: a date, and what the plan and the log say about it.
///
/// Filled ring = trained. Hollow ring = a scheduled day that did not happen.
/// Bare number = a rest day, which is not a failure and must not look like one.
/// The number is the part that was missing entirely — a grid of undated rings is
/// a texture, and the complaint that it showed "white circles with no dates" was
/// exactly right.
private struct DayCell: View {
  let day: HelixSnapshot.CalendarDay
  let isToday: Bool
  let mono: Bool
  let size: CGFloat

  /// A rest day has no `dayKey`, and `Helix.day(nil)` answers steel — which is
  /// pale enough to read as white. Rest days therefore never ask for it.
  private var color: Color { mono ? .white : Helix.day(day.dayKey) }

  var body: some View {
    ZStack {
      if day.logged {
        Circle().fill(color)
      } else if day.scheduled {
        Circle().strokeBorder(color.opacity(0.55), lineWidth: 1.5)
      }
      if isToday {
        Circle().strokeBorder(.white.opacity(0.85), lineWidth: 1)
          .frame(width: size + 3, height: size + 3)
      }
      Text(HelixSnapshot.dayOfMonth(day.d).map { "\($0)" } ?? "")
        .font(.system(size: max(7, size * 0.42), weight: day.logged ? .bold : .semibold))
        // On a filled ring the number sits ON the colour, so it takes the widget
        // background rather than white-on-gold, which is unreadable.
        .foregroundStyle(day.logged ? Helix.background : (day.scheduled ? .white : Helix.muted))
        .minimumScaleFactor(0.7)
    }
    .frame(width: size, height: size)
  }
}

// MARK: - Volume
//
// This week's tonnage, its delta against last week, and eight weeks of it as a
// sparkline. The same grammar as the body WeightTrendFace on purpose: one headline,
// one chip, one line — so the two read as the same kind of statement about two
// different quantities.
//
// Zero-based, unlike weight. Tonnage has a meaningful zero and weeks between
// 12.1 t and 14.2 t drawn on a 12.1–14.2 band look like a collapse and a
// recovery; drawn against zero they look like what they are.

struct VolumeFocusFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var deltaTonnes: Double? {
    guard let now = s?.week.volumeKg, let then = s?.weekPrev?.volumeKg else { return nil }
    return (now - then) / 1000
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 4) {
        Caption("VOLUME", color: mono ? .white : Helix.emerald)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }
      BigValue(value: HelixSnapshot.tonnes(s?.week.volumeKg), size: 28, color: .white)
      HStack(spacing: 5) {
        Text("this week").font(.system(size: 9)).foregroundStyle(Helix.muted)
        DeltaChip(delta: deltaTonnes, decimals: 1, suffix: " t", monochrome: mono)
      }
      Spacer(minLength: 0)
      if let trend = s?.volumeTrend, trend.count >= 2 {
        Sparkline(points: trend.map(\.v), color: mono ? .white : Helix.emerald, zeroBased: true)
          .frame(height: 26)
      }
    }
  }
}

/// Medium · the figures on the left, the eight weeks on the right.
///
/// ── WHY BARS REPLACED THE LINE ───────────────────────────────────────────────
/// The old face drew a six-point line on a band of exactly min…max, so the
/// lightest week was always pinned to the floor and the heaviest to the ceiling
/// however small the real spread — twelve tonnes to fourteen drew the same cliff
/// as two to twenty. And a LINE claims the quantity existed between its points,
/// which for weekly tonnage is simply untrue: a week is a bucket, and the space
/// between two of them is not a slower Tuesday, it is nothing at all.
///
/// `BarChart` is zero-based, so the bars are in proportion to each other and to
/// nothing invented, with the trailing mean as a dotted rule to read them against.
struct VolumeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var accent: Color { mono ? .white : Helix.emerald }

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 4) {
          Caption("VOLUME", color: accent)
          if entry.isStale { StaleTag() }
        }
        Spacer(minLength: 0)
        BigValue(value: HelixSnapshot.tonnes(s?.week.volumeKg), size: 30, color: .white)
        Text("this week").font(.system(size: 9)).foregroundStyle(Helix.muted)
        DeltaChip(delta: volumeDeltaTonnes(s), decimals: 1, suffix: " t", monochrome: mono)
        Spacer(minLength: 0)
        Hairline()
        LedgerRow(label: "SESSIONS", value: sessionsText(s), color: .white)
        LedgerRow(label: "SETS", value: s.map { "\($0.week.sets)" }, color: Helix.steel)
      }
      .frame(width: 118, alignment: .leading)

      Hairline(vertical: true)

      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 4) {
          Caption("EIGHT WEEKS", color: Helix.muted)
          Spacer(minLength: 0)
          if let mean = trailingMean(s) {
            Text("mean \(HelixSnapshot.tonnes(mean) ?? "—")")
              .font(.system(size: 8)).foregroundStyle(Helix.muted)
          }
        }
        BarChart(points: s?.volumeTrend ?? [], goal: trailingMean(s), color: accent,
                 label: { weekLabel($0.d) })
          .frame(maxHeight: .infinity)
      }
      .frame(maxWidth: .infinity)
    }
  }
}

/// Large · the week, the eight weeks, and where the tonnage actually went.
struct VolumeLargeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private func tint(_ c: Color) -> Color { mono ? .white : c }

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      Register(title: "THIS WEEK", accent: tint(Helix.emerald)) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          BigValue(value: HelixSnapshot.tonnes(s?.week.volumeKg), size: 34, color: .white)
          DeltaChip(delta: volumeDeltaTonnes(s), decimals: 1, suffix: " t", monochrome: mono)
          Spacer(minLength: 0)
          if entry.isStale { StaleTag() }
        }
        HStack(spacing: 0) {
          Stat(value: sessionsText(s), label: "SESSIONS", color: .white)
          Stat(value: s.map { "\($0.week.sets)" }, label: "SETS", color: .white)
          Stat(value: s.map { "\($0.week.prs)" }, label: "RECORDS",
               color: (s?.week.prs ?? 0) > 0 ? tint(Helix.gold) : Helix.muted)
          Stat(value: HelixSnapshot.tonnes(s?.weekPrev?.volumeKg), label: "LAST WEEK",
               color: Helix.steel)
        }
      }

      Hairline()

      Register(title: "EIGHT WEEKS", accent: tint(Helix.sapphire)) {
        BarChart(points: s?.volumeTrend ?? [], goal: trailingMean(s), color: tint(Helix.emerald),
                 label: { weekLabel($0.d) })
          .frame(maxHeight: .infinity)
      }
      .frame(maxHeight: .infinity)

      Hairline()

      Register(title: "WHERE IT WENT", accent: tint(Helix.amethyst)) {
        FamilySplit(families: s?.volumeByFamily ?? [], mono: mono, height: 30)
      }
    }
  }
}

/// This week against last, in tonnes. Nil when either week is missing — a first
/// week compared against nothing is "new", not "+everything".
private func volumeDeltaTonnes(_ s: HelixSnapshot?) -> Double? {
  guard let now = s?.week.volumeKg, let then = s?.weekPrev?.volumeKg else { return nil }
  return (now - then) / 1000
}

/// "3/5" when the plan states a target, "3" when it does not. A session count
/// with no denominator is not a fact you can act on at a glance.
private func sessionsText(_ s: HelixSnapshot?) -> String? {
  guard let week = s?.week else { return nil }
  if let target = week.sessionTarget, target > 0 { return "\(week.sessions)/\(target)" }
  return "\(week.sessions)"
}

/// The mean of the COMPLETED weeks — this one is excluded because it is still
/// being written, and a Monday would drag the rule down to a level no week has
/// ever finished at. Nil with fewer than two completed weeks to average.
private func trailingMean(_ s: HelixSnapshot?) -> Double? {
  let trend = s?.volumeTrend ?? []
  let completed = trend.count > 1 ? Array(trend.dropLast()) : []
  guard completed.count >= 2 else { return nil }
  return completed.reduce(0) { $0 + $1.v } / Double(completed.count)
}

/// A week bucket's label: the day of its START date. Eight "W"s would be no
/// label at all, and a week number would need a programme epoch the payload
/// does not carry.
private func weekLabel(_ iso: String) -> String {
  HelixSnapshot.dayOfMonth(iso).map { "\($0)" } ?? ""
}

// MARK: - Streak
//
// ── WHY THE NUMBER IS NOT A RUN OF CALENDAR DAYS ─────────────────────────────
// Helix-5 rests Wednesday and Saturday, so a consecutive-day counter could never
// exceed three and would break every week by design — it would be measuring the
// plan rather than the athlete. `streakFrom` walks SCHEDULED days only, and today
// does not count against you until it is over.
//
// This IS the number on the dashboard orb, as of the streak unification. The orb
// used to show `programDay()` — days elapsed since the cut began — which is how
// the two came to disagree by ten while both sitting under a flame. That counter
// is deleted; `streakFrom` (src/lib/training/streak.ts) is the only derivation
// left, and the app reads it through `useStreak()` over the same 42-day window
// this payload is built from. If this face and the orb ever differ again, the
// cause is staleness, not arithmetic.

struct StreakFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var current: Int? { s?.streak?.current }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Caption("STREAK", color: mono ? .white : Helix.ember)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }

      Spacer(minLength: 0)

      HStack(alignment: .center, spacing: 8) {
        Image(systemName: "flame.fill")
          .font(.system(size: 26))
          .foregroundStyle(mono ? .white : (current ?? 0) > 0 ? Helix.ember : Helix.muted)
        BigValue(value: current.map { "\($0)" }, size: 34, color: .white)
      }

      Text(subtitle).font(.system(size: 10)).foregroundStyle(Helix.muted).lineLimit(1)

      Spacer(minLength: 0)
    }
  }

  /// ── WHY THERE IS NO LONGER A BAR ───────────────────────────────────────────
  /// A `Rail` used to draw `current / best` with a "best 27" caption under it.
  /// That is a progress bar toward your own record, and it reads as a target —
  /// so the better your best gets, the emptier a perfectly good streak looks.
  /// A streak has no denominator. The flame and the number are the whole idea,
  /// and `best` still lives on the Medium/Large face where it is a LEDGER ROW
  /// rather than a finish line.
  private var subtitle: String {
    guard let current else { return "no sessions on record" }
    if current == 0 { return "training days, not calendar days" }
    return "day streak"
  }
}

/// Medium and Large · the streak, plus the thing it is a summary OF.
///
/// A streak on its own is one integer and a best, which is a Small's worth of
/// content — rendering it at Large was a flame the size of a fist over a hand's
/// width of nothing. Adherence is the honest way to fill the space: how many of
/// the days the plan asked for actually happened, which is the question the
/// streak is a lossy answer to. Every figure here comes off `calendar`, which
/// the training scope already ships.
struct ConsistencyFace: View {
  let entry: HelixEntry
  let mono: Bool
  let large: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var accent: Color { mono ? .white : Helix.ember }

  /// Scheduled days that are OVER. Today counts only once it is logged, on the
  /// same principle as `streakFrom`: an unfinished day is not a missed one, and
  /// a widget that marks you down at breakfast is a widget that lies until dusk.
  private var judged: [HelixSnapshot.CalendarDay] {
    let today = s?.date ?? ""
    return (s?.calendar ?? []).filter { day in
      guard day.scheduled, day.d <= today else { return false }
      return day.d != today || day.logged
    }
  }

  private var done: Int { judged.filter(\.logged).count }
  private var adherence: Double? {
    judged.isEmpty ? nil : Double(done) / Double(judged.count)
  }

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 4) {
          Caption("STREAK", color: accent)
          if entry.isStale { StaleTag() }
        }
        Spacer(minLength: 0)
        HStack(alignment: .center, spacing: 6) {
          Image(systemName: "flame.fill")
            .font(.system(size: large ? 30 : 22))
            .foregroundStyle((s?.streak?.current ?? 0) > 0 ? accent : Helix.muted)
          // `.map` on the STREAK, not on `current` — `streak` is the optional and
          // `current` is a plain Int, so `s?.streak?.current.map` asks an Int for
          // a `map` it does not have. Same trap as `week.volumeKg`.
          BigValue(value: s?.streak.map { "\($0.current)" }, size: large ? 40 : 30, color: .white)
        }
        Text("day streak")
          .font(.system(size: 9)).foregroundStyle(Helix.muted).lineLimit(1)
        Spacer(minLength: 0)
      }
      .frame(width: large ? 130 : 104, alignment: .leading)

      Hairline(vertical: true)

      VStack(alignment: .leading, spacing: large ? 9 : 6) {
        LedgerRow(label: "ADHERENCE",
                  value: adherence.map { "\(Int(($0 * 100).rounded()))" },
                  color: .white, trailing: "%")
        Hairline()
        LedgerRow(label: "BEST", value: s?.streak.map { "\($0.best)" }, color: accent)
        Hairline()
        LedgerRow(label: "MISSED",
                  value: judged.isEmpty ? nil : "\(judged.count - done) of \(judged.count)",
                  color: judged.count == done ? Helix.muted : (mono ? .white : Helix.oxide))

        if large { Hairline() }

        // The strip is the evidence behind the percentage. Filled = trained,
        // hollow = a scheduled day that did not happen; rest days are simply not
        // here, because they were never being judged.
        AdherenceStrip(days: judged, mono: mono, dot: large ? 9 : 7)
          .frame(maxHeight: large ? .infinity : 22)
      }
      .frame(maxWidth: .infinity)
    }
  }
}

/// Every judged day as a dot, oldest first, wrapping.
private struct AdherenceStrip: View {
  let days: [HelixSnapshot.CalendarDay]
  let mono: Bool
  let dot: CGFloat

  var body: some View {
    if days.isEmpty {
      Text("no scheduled days behind you yet")
        .font(.system(size: 9)).foregroundStyle(Helix.muted)
    } else {
      // Ten a row keeps the dots legible at both sizes; a single row of thirty
      // shrinks each one to a speck on a Medium.
      let rows = stride(from: 0, to: days.count, by: 10).map {
        Array(days[$0..<min($0 + 10, days.count)])
      }
      VStack(alignment: .leading, spacing: 3) {
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          HStack(spacing: 3) {
            ForEach(row) { day in
              Circle()
                .fill(day.logged ? (mono ? .white : Helix.day(day.dayKey)) : .clear)
                .strokeBorder(day.logged ? .clear : Helix.muted.opacity(0.5), lineWidth: 1)
                .frame(width: dot, height: dot)
            }
            Spacer(minLength: 0)
          }
        }
        Spacer(minLength: 0)
      }
    }
  }
}
