import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// Training-phase anchors — the pure half of `src/lib/phases.ts`.
//
// A programme phase is a direction (`cut` / `bulk`), a polished end state
// (`peak`), or a bounded easing-off (`deload`). It is never a diet: the
// nutrition "maintenance week" is a LEVER (see `Levers`), and the one-week
// phase that used to duplicate it was deleted on 2026-08-30 after the two
// copies drifted apart. What is left on this axis is the historical deloads
// (Thailand, the Transition) that predate levers entirely.
//
// Colours are not here. `PHASE_HEX` and friends are HelixUI tokens.
// ─────────────────────────────────────────────────────────────────────────────

public enum PhaseKind: String, Codable, Sendable, CaseIterable { case cut, peak, bulk, deload }
public enum PhaseEra: String, Codable, Sendable { case ppl, helix }

public struct PhaseDef: Codable, Equatable, Sendable {
    public var kind: PhaseKind
    public var name: String
    /// YYYY-MM-DD, a Sunday.
    public var start: String
    public var weeks: Int
    /// Append "Week N" per week.
    public var numbered: Bool?
    /// Compact override.
    public var short: String?
    /// Week numbering offset (blocks split around a deload).
    public var firstWeek: Int?
    /// Era-distinct tag (defaults to the name).
    public var eraTag: String?
    public var era: PhaseEra?

    public init(kind: PhaseKind, name: String, start: String, weeks: Int, numbered: Bool? = nil, short: String? = nil, firstWeek: Int? = nil, era: PhaseEra? = nil, eraTag: String? = nil) {
        self.kind = kind; self.name = name; self.start = start; self.weeks = weeks
        self.numbered = numbered; self.short = short; self.firstWeek = firstWeek; self.eraTag = eraTag; self.era = era
    }
}

/// The phase for a Sunday week start.
public struct WeekPhase: Codable, Equatable, Sendable {
    public var kind: PhaseKind
    /// Full label, e.g. "Helix Cut · Week 3".
    public var label: String
    /// Compact label, e.g. "Cut W3" / "Peak".
    public var short: String
    public var eraTag: String
    public var era: PhaseEra
    /// The phase on its own — "Cut", "Lean Bulk".
    public var name: String
    /// Week number within the phase, or nil on an unnumbered phase.
    public var n: Int?
}

public struct ProgramWeek: Codable, Equatable, Sendable {
    public var weekStart: String
    public var weekEnd: String
    public var kind: PhaseKind
    public var n: Int
    public var label: String
    public var eraTag: String
    public var era: PhaseEra
}

/// The phase a DATE falls in and how far into it that date is.
public struct PhaseSpan: Equatable, Sendable {
    public var def: PhaseDef
    public var start: String
    public var dayIndex: Int
}

public enum Phases {
    public static let all: [PhaseDef] = [
        // PPL Legacy era — the historical 50-day cut MUST stay visually separate.
        PhaseDef(kind: .bulk, name: "Bulk",                    start: "2026-03-08", weeks: 9, numbered: true, era: .ppl, eraTag: "PPL Bulk"),
        PhaseDef(kind: .cut,  name: "Cut",                     start: "2026-05-10", weeks: 6, numbered: true, era: .ppl, eraTag: "PPL Cut"),
        PhaseDef(kind: .peak, name: "Peak Week (Maintenance)", start: "2026-06-21", weeks: 1, short: "Peak",  era: .ppl, eraTag: "PPL Peak"),
        // Thailand trip deload — Jun 28–Jul 11. The only PPL-era deload.
        PhaseDef(kind: .deload, name: "Thailand Vacation", start: "2026-06-28", weeks: 2, short: "Thailand", era: .ppl, eraTag: "Thailand Vacation (Deload)"),
        // HELIX era. One unbroken 13-week cut; the maintenance week inside it is
        // a lever, not a phase.
        PhaseDef(kind: .peak,   name: "Week 0 · Transition", start: "2026-07-12", weeks: 1,  short: "W0", era: .helix, eraTag: "HELIX · Week 0"),
        PhaseDef(kind: .cut,    name: "Cut",                 start: "2026-07-19", weeks: 13, numbered: true, era: .helix, eraTag: "Helix Cut"),
        PhaseDef(kind: .deload, name: "Transition",          start: "2026-10-18", weeks: 2,  numbered: true, short: "Trans", era: .helix, eraTag: "HELIX Transition"),
        PhaseDef(kind: .bulk,   name: "Lean Bulk",           start: "2026-11-01", weeks: 11, numbered: true, era: .helix, eraTag: "HELIX Lean Bulk"),
    ]

    /// `phaseSpanFor` — first match in table order; nil between phases and for
    /// a date that does not parse.
    public static func span(for dateISO: String) -> PhaseSpan? {
        guard let t = ISODate.dayNumber(dateISO) else { return nil }
        for def in all {
            guard let start = ISODate.dayNumber(def.start) else { continue }
            let idx = t - start
            if idx >= 0 && idx < def.weeks * 7 { return PhaseSpan(def: def, start: def.start, dayIndex: idx) }
        }
        return nil
    }

    /// `getWeekPhase` — the phase for a Sunday week start, or nil.
    public static func weekPhase(weekStart: String) -> WeekPhase? {
        for p in all {
            guard let start = ISODate.dayNumber(p.start) else { continue }
            for i in 0..<p.weeks where ISODate.iso(dayNumber: start + i * 7) == weekStart {
                let era = p.era ?? .ppl
                let eraTag = p.eraTag ?? p.name
                if p.numbered == true {
                    let n = i + (p.firstWeek ?? 1)
                    return WeekPhase(kind: p.kind, label: "\(eraTag) · Week \(n)", short: "\(p.short ?? p.name) W\(n)", eraTag: eraTag, era: era, name: p.name, n: n)
                }
                return WeekPhase(kind: p.kind, label: eraTag, short: p.short ?? p.name, eraTag: eraTag, era: era, name: p.name, n: nil)
            }
        }
        return nil
    }

    /// `enumerateWeeks` — every week of the given kinds as a folder, NEWEST FIRST.
    public static func enumerateWeeks(_ kinds: [PhaseKind]) -> [ProgramWeek] {
        var out: [ProgramWeek] = []
        for p in all where kinds.contains(p.kind) {
            guard let start = ISODate.dayNumber(p.start) else { continue }
            for i in 0..<p.weeks {
                let ws = start + i * 7
                let n = i + (p.firstWeek ?? 1)
                out.append(ProgramWeek(
                    weekStart: ISODate.iso(dayNumber: ws), weekEnd: ISODate.iso(dayNumber: ws + 6), kind: p.kind, n: n,
                    label: p.numbered == true ? "Week \(n)" : p.name, eraTag: p.eraTag ?? p.name, era: p.era ?? .ppl
                ))
            }
        }
        return out.reversed()
    }
}
