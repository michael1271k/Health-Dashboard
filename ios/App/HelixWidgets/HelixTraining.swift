import WidgetKit
import SwiftUI

// MARK: - Helix Training
//
// Six focuses over three sizes. Four of them are new surfaces built on payload
// that already existed or was added with this family — today's session
// metadata, the six-week calendar, the weekly tonnage trend and the streak —
// and two are the performance faces, reached here rather than through a widget
// of their own (see HelixPerformance.swift).
//
//   today     what is due, or what you finished
//   calendar  scheduled against logged, tinted by the day's own colour
//   volume    this week's tonnage against last, over eight weeks
//   streak    consecutive SCHEDULED days trained
//   records   the standing record ledger
//   oneRepMax where the main lifts are trending

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
        switch focus {
        case .today:
          if family == .systemSmall { TodayFace(entry: entry, mono: mono, compact: true) }
          else { TodayFace(entry: entry, mono: mono, compact: false) }
        case .calendar:
          CalendarFace(entry: entry, mono: mono, large: family == .systemLarge)
        case .volume:
          if family == .systemSmall { StreakFace(entry: entry, mono: mono) }
          else { VolumeFace(entry: entry, mono: mono) }
        case .streak:
          StreakFace(entry: entry, mono: mono)
        case .records:
          switch family {
          case .systemSmall: PerfFocusFace(entry: entry, focus: .records, mono: mono)
          case .systemLarge: RecordGridFace(entry: entry, mono: mono)
          default:           PerfLedgerFace(entry: entry, focus: .records, mono: mono)
          }
        case .oneRepMax:
          switch family {
          case .systemSmall: PerfFocusFace(entry: entry, focus: .oneRepMax, mono: mono)
          case .systemLarge: RecordGridFace(entry: entry, mono: mono)
          default:           PerfLedgerFace(entry: entry, focus: .oneRepMax, mono: mono)
          }
        }
      }
    }
    .containerBackground(Helix.background, for: .widget)
    .widgetURL(focus.link)
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
      HStack(spacing: 5) {
        Image(systemName: glyph)
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(isRest ? Helix.muted : accent)
        Caption(caption, color: isRest ? Helix.muted : accent)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }

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
        HStack(spacing: 0) {
          Stat(value: done.durationMin.map { "\($0)′" }, label: "TIME", color: .white)
          Stat(value: done.sessionRpe.map { String(format: "%.0f/10", $0) },
               label: "EFFORT", color: mono ? .white : Helix.ember)
          Stat(value: HelixSnapshot.tonnes(done.volumeKg), label: "VOLUME", color: .white)
          Stat(value: done.prCount.map { "\($0)" }, label: "RECORDS",
               color: (done.prCount ?? 0) > 0 ? (mono ? .white : Helix.gold) : Helix.muted)
        }
      } else if !compact {
        // A rail is the wrong shape for "not yet" — this is the week's progress,
        // which is the only thing there IS to say before a session exists.
        Hairline()
        HStack(spacing: 6) {
          Text(weekText)
            .font(.system(size: 10)).foregroundStyle(Helix.muted)
          Rail(progress: sessionProgress, color: isRest ? Helix.steel : accent, height: 3)
        }
      }
    }
  }

  private var glyph: String {
    if isRest { return "moon.zzz.fill" }
    return done != nil ? "checkmark.circle.fill" : "dumbbell.fill"
  }

  private var caption: String {
    if isRest { return "REST DAY" }
    return done != nil ? "DONE" : "DUE TODAY"
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

// MARK: - Calendar
//
// ── WHY A RING AND NOT A HEAT MAP ────────────────────────────────────────────
// The interesting fact about a training month is not how much you did on each
// day — it is whether the day the plan asked for happened. So each scheduled day
// is a ring in its OWN colour (`Helix.day`, mirroring `DAY_COLOR`): filled when
// a session landed, hollow when it did not, and a bare dot on a rest day. A
// heat map would say "Tuesday was a big day" and leave "Tuesday was missed"
// looking identical to "Tuesday was a rest day".

struct CalendarFace: View {
  let entry: HelixEntry
  let mono: Bool
  /// Large adds weekday headers and a footer; Medium is the grid alone.
  let large: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  /// Six weeks, oldest first. Medium shows the last four — 42 cells in a Medium
  /// puts each one under 9pt, which is a texture rather than a calendar.
  private var days: [HelixSnapshot.CalendarDay] {
    let all = s?.calendar ?? []
    let wanted = large ? 42 : 28
    return all.count > wanted ? Array(all.suffix(wanted)) : all
  }
  private var weeks: [[HelixSnapshot.CalendarDay]] {
    stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<min($0 + 7, days.count)]) }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: large ? 8 : 6) {
      HStack(spacing: 5) {
        Caption("CALENDAR", color: mono ? .white : Helix.steel)
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

      if large {
        HStack(spacing: 0) {
          ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { _, letter in
            Text(letter)
              .font(.system(size: 8, weight: .bold))
              .foregroundStyle(Helix.muted)
              .frame(maxWidth: .infinity)
          }
        }
      }

      if days.isEmpty {
        Text("no scheduled days yet")
          .font(.system(size: 10)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      } else {
        VStack(spacing: large ? 6 : 4) {
          ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
            HStack(spacing: 0) {
              ForEach(week) { day in
                DayDot(day: day, mono: mono, size: large ? 16 : 13)
                  .frame(maxWidth: .infinity)
              }
            }
          }
        }
      }

      if large {
        Spacer(minLength: 0)
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

/// One figure in a footer row: value above, label under it.
///
/// `Metric` puts the two side by side, which is right for a VERTICAL list of
/// facts and wrong for a horizontal one — four side-by-side pairs across a
/// Medium wrap into an unreadable mess.
private struct Stat: View {
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

/// One calendar cell.
///
/// Filled ring = trained. Hollow ring = a scheduled day that did not happen.
/// Bare dot = a rest day, which is not a failure and must not look like one.
private struct DayDot: View {
  let day: HelixSnapshot.CalendarDay
  let mono: Bool
  let size: CGFloat

  private var color: Color { mono ? .white : Helix.day(day.dayKey) }

  var body: some View {
    ZStack {
      if !day.scheduled && !day.logged {
        Circle()
          .fill(Helix.muted.opacity(0.35))
          .frame(width: 3, height: 3)
      } else if day.logged {
        Circle().fill(color).frame(width: size, height: size)
      } else {
        Circle()
          .strokeBorder(color.opacity(0.55), lineWidth: 1.5)
          .frame(width: size, height: size)
      }
    }
    .frame(height: size)
  }
}

// MARK: - Volume
//
// This week's tonnage, its delta against last week, and eight weeks of it as a
// sparkline. The same grammar as the body TrendFace on purpose: one headline,
// one chip, one line — so the two read as the same kind of statement about two
// different quantities.

struct VolumeFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var deltaTonnes: Double? {
    guard let now = s?.week.volumeKg, let then = s?.weekPrev?.volumeKg else { return nil }
    return (now - then) / 1000
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 5) {
        Caption("VOLUME", color: mono ? .white : Helix.emerald)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag() }
      }

      HStack(alignment: .bottom, spacing: 8) {
        BigValue(value: HelixSnapshot.tonnes(s?.week.volumeKg), size: 28, color: .white)
        DeltaChip(delta: deltaTonnes, decimals: 1, suffix: " t", monochrome: mono)
        Spacer(minLength: 0)
        Text("this week").font(.system(size: 9)).foregroundStyle(Helix.muted)
      }

      if let trend = s?.volumeTrend, trend.count >= 2 {
        Sparkline(points: trend.map(\.v), color: mono ? .white : Helix.emerald)
          .frame(maxHeight: .infinity)
        HStack(spacing: 0) {
          Text("\(trend.count) weeks").font(.system(size: 8)).foregroundStyle(Helix.muted)
          Spacer(minLength: 0)
          Text(HelixSnapshot.tonnes(trend.map(\.v).max()).map { "peak \($0)" } ?? "")
            .font(.system(size: 8)).foregroundStyle(Helix.muted)
        }
      } else {
        Text("a tonnage trend appears here\nonce there are two weeks of it")
          .font(.system(size: 9)).foregroundStyle(Helix.muted)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
  }
}

// MARK: - Streak
//
// ── WHY THE NUMBER IS NOT A RUN OF CALENDAR DAYS ─────────────────────────────
// Helix-5 rests Wednesday and Saturday, so a consecutive-day counter could never
// exceed three and would break every week by design — it would be measuring the
// plan rather than the athlete. `streakFrom` walks SCHEDULED days only, and today
// does not count against you until it is over.

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

      if let best = s?.streak?.best, best > 0 {
        Rail(progress: current.map { min(1, Double($0) / Double(best)) },
             color: mono ? .white : Helix.ember, height: 3)
        Text("best \(best)").font(.system(size: 9)).foregroundStyle(Helix.muted)
      }
    }
  }

  private var subtitle: String {
    guard let current else { return "no sessions on record" }
    if current == 0 { return "training days, not calendar days" }
    return current == 1 ? "scheduled day" : "scheduled days"
  }
}
