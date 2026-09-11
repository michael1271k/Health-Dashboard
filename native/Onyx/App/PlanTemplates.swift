import Foundation
import OnyxCore

/// The bundled plan templates — `Resources/plan-templates.json`.
///
/// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
/// The three decks a NEW account can pick from at onboarding (W5), generated
/// beside the founder's seed SQL by `SeedDumpTests` so the numbers were never
/// typed twice. It is data in the app bundle, not domain: nothing in OnyxCore
/// or OnyxData reads it, and the running app resolves its deck from
/// `routines` rows through `ScheduleContext`. The only readers today are the
/// previews and the screenshot harness, which need a plausible day to draw
/// and no longer have `Program.onyx5` to reach for.
enum PlanTemplates {

    struct TemplateDay: Decodable {
        var key: String
        var label: String
        var sub: String?
        var weekday: Int
        var accent: Int
        var sort: Int
        var exercises: [RoutineExercise]
    }

    struct TemplatePlan: Decodable {
        var id: String
        var label: String
        var blurb: String
        var isLegacy: Bool
        var sort: Int
        var days: [TemplateDay]
    }

    struct File: Decodable {
        var version: Int
        var plans: [TemplatePlan]
    }

    static let plans: [TemplatePlan] = {
        guard let url = Bundle.main.url(forResource: "plan-templates", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data)
        else { return [] }
        return file.plans
    }()

    /// The template decks as programs, in template order.
    static let programs: [Program] = plans.map { p in
        Program(
            id: p.id, label: p.label, blurb: p.blurb,
            days: p.days.sorted { $0.sort < $1.sort }.map { d in
                ProgramDay(
                    key: d.key, label: d.label, sub: d.sub, accent: UInt32(truncatingIfNeeded: max(0, d.accent)),
                    weekday: d.weekday, exercises: d.exercises.map(\.programExercise)
                )
            }
        )
    }

    static func program(_ id: String) -> Program? { programs.first { $0.id == id } }

    /// One template day, for a preview. Falls back to an empty day under the
    /// key so a preview never crashes on a missing resource.
    static func day(_ programId: String, _ key: String) -> ProgramDay {
        program(programId)?.day(key: key)
            ?? ProgramDay(key: key, label: key, accent: 0x8A8A8E, weekday: 0, exercises: [])
    }

    /// The template plans as catalogue entries, for a seeded preview store.
    static var planInfos: [PlanInfo] {
        plans.map { PlanInfo(id: $0.id, label: $0.label, blurb: $0.blurb, isLegacy: $0.isLegacy, sort: $0.sort) }
    }
}
