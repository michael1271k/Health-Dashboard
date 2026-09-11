import Foundation
import GRDB
import OnyxCore
import OnyxData

/// The catalogue a preview store needs to draw a deck, a plan, a rung or a
/// phase — as ROWS, the way the app reads them since W2.
///
/// The decks come from `plan-templates.json`; the rungs, the phases and the
/// stack are preview data in the same spirit as `PreviewHarness.sampleBouts`:
/// enough of a plausible account to photograph every screen, not the
/// founder's account. Nothing here reaches OnyxCore or a running app.
enum PreviewCatalogue {

    static let userId = "00000000-0000-0000-0000-000000000001"

    /// Plans, routines, phase goals, weekly set targets, phases and rungs.
    static func seed(_ database: AppDatabase, userId: String = userId, today: String = LogicalDay.today()) {
        let t = Date(timeIntervalSince1970: 1_756_000_000)
        try? database.seedRows { conn in
            for (i, plan) in PlanTemplates.plans.enumerated() {
                let active = plan.id == "onyx5"
                try PlanRow(
                    id: "plan-\(plan.id)", userId: userId, name: plan.label, programId: plan.id, active: active,
                    startedOn: active ? "2026-07-15" : (plan.isLegacy ? "2026-03-08" : nil), createdAt: t,
                    blurb: plan.blurb, isLegacy: plan.isLegacy, sort: i
                ).save(conn)
                for day in plan.days.sorted(by: { $0.sort < $1.sort }) {
                    try RoutineRow(
                        userId: userId, programId: plan.id, dayKey: day.key, label: day.label, sub: day.sub,
                        weekday: day.weekday, accent: day.accent, sort: day.sort,
                        payload: JSONText(raw: RoutinePayload(exercises: day.exercises).encoded()), updatedAt: t
                    ).save(conn)
                }
            }
            // The phase goals and set targets the template carries, decoded
            // straight off the file so the numbers are typed nowhere else.
            if let url = Bundle.main.url(forResource: "plan-templates", withExtension: "json"),
               let data = try? Data(contentsOf: url),
               let file = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let plans = file["plans"] as? [[String: Any]] {
                for plan in plans {
                    guard let id = plan["id"] as? String else { continue }
                    for (phase, g) in (plan["phaseGoals"] as? [String: [String: Any]]) ?? [:] {
                        func d(_ k: String) -> Double? { (g[k] as? NSNumber)?.doubleValue }
                        try PlanPhaseGoalRow(
                            userId: userId, planId: id, phase: phase,
                            kcal: d("kcal").map(Int.init), proteinG: d("proteinG").map(Int.init),
                            carbsG: d("carbsG").map(Int.init), fatG: d("fatG").map(Int.init),
                            fiberMin: d("fiberMin").map(Int.init), fiberMax: d("fiberMax").map(Int.init),
                            updatedAt: t, stepsGoal: d("stepsGoal").map(Int.init),
                            targetWeightKg: d("targetWeightKg"), targetBodyFatPct: d("targetBodyFatPct"),
                            targetMuscleMassKg: d("targetMuscleMassKg"), rateMinKgWk: d("rateMinKgWk"), rateMaxKgWk: d("rateMaxKgWk"),
                            label: g["label"] as? String, fiberG: d("fiberG").map(Int.init), bodyFatCeilingPct: d("bodyFatCeilingPct")
                        ).save(conn)
                    }
                    for (phase, targets) in (plan["volumeTargets"] as? [String: [String: Any]]) ?? [:] {
                        for (muscle, sets) in targets {
                            try PlanPhaseVolumeRow(
                                userId: userId, planId: id, phase: phase, muscle: muscle,
                                targetSets: (sets as? NSNumber)?.intValue ?? 0, updatedAt: t
                            ).save(conn)
                        }
                    }
                }
            }
            // The dated blocks — what week labels, phase pills and the ledger window read.
            let phases: [(String, String, String, String, String?, Int, Bool, String, String)] = [
                ("ppl", "2026-03-08", "bulk", "Bulk", nil, 9, true, "ppl", "PPL Bulk"),
                ("ppl", "2026-05-10", "cut", "Cut", nil, 6, true, "ppl", "PPL Cut"),
                ("ppl", "2026-06-21", "peak", "Peak Week (Maintenance)", "Peak", 1, false, "ppl", "PPL Peak"),
                ("ppl", "2026-06-28", "deload", "Thailand Vacation", "Thailand", 2, false, "ppl", "Thailand Vacation (Deload)"),
                ("onyx5", "2026-07-12", "peak", "Week 0 · Transition", "W0", 1, false, "helix", "Onyx · Week 0"),
                ("onyx5", "2026-07-19", "cut", "Cut", nil, 13, true, "helix", "Onyx Cut"),
                ("onyx5", "2026-10-18", "deload", "Transition", "Trans", 2, true, "helix", "Onyx Transition"),
                ("onyx5", "2026-11-01", "bulk", "Lean Bulk", nil, 11, true, "helix", "Onyx Lean Bulk"),
            ]
            for (plan, start, kind, name, short, weeks, numbered, era, tag) in phases {
                try PlanPhaseRow(
                    userId: userId, planId: plan, start: start, kind: kind, name: name, short: short,
                    weeks: weeks, numbered: numbered, era: era, eraTag: tag, updatedAt: t
                ).save(conn)
            }
            // The ladder: three deficit rungs and one release, plus the day shapes.
            let rungs: [(String, String, String, Int, Int, Int?, Int?, Int?, String)] = [
                ("home", "Home", "Cooked and weighed — every macro is a real target.", 0, 1935, 190, 55, nil, "day"),
                ("restaurant", "Restaurant", "Eating out — hit the protein, let the split go.", 1, 2400, nil, nil, nil, "day"),
                ("baseline", "Baseline", "The plan as written — 190 g carbs, 10k steps.", 10, 1935, 190, 55, 10000, "deficit"),
                ("lever-1", "Lever 1", "−70 kcal off carbs and fat, steps to 10k.", 11, 1885, 182, 53, 10000, "deficit"),
                ("lever-2", "Lever 2", "Same food as Lever 1, steps 12k–15k. The last rung.", 12, 1885, 182, 53, 12000, "deficit"),
                ("maintenance-week", "Maintenance Week", "A planned week at maintenance — full food, lighter steps. Still cutting.", 13, 2151, 244, 55, 7500, "release"),
            ]
            for (key, label, summary, sort, kcal, carbs, fat, steps, kind) in rungs {
                try TargetProfileRow(
                    userId: userId, key: key, label: label, summary: summary, sort: sort,
                    kcal: kcal, proteinG: 170, carbsG: carbs, fatG: fat, stepsGoal: steps, updatedAt: t, kind: kind
                ).save(conn)
            }
            let periods: [(String, String?)] = [
                ("2026-07-15", "baseline"), ("2026-08-16", "lever-1"), ("2026-08-20", nil),
                ("2026-08-30", "maintenance-week"), ("2026-09-06", "baseline"),
            ]
            for (from, key) in periods {
                try LeverPeriodRow(
                    userId: userId, startsOn: from, profileKey: key,
                    goals: key == nil ? JSONText(raw: #"{"calorie":1999,"protein":170,"carbs":206,"fat":55,"steps":10000}"#) : nil,
                    updatedAt: t
                ).save(conn)
            }
        }
    }

    /// A supplement stack as rows — the seed W2 stopped compiling in.
    static func seedStack(_ database: AppDatabase, userId: String = userId) {
        let items: [(String, String, String, String, String, String, Bool?, String?)] = [
            ("multivitamin", "Two Per Day Multivitamin", "1 tab", "#3E9E7A", "10:30", "Morning", nil, "2 tabs on Monday & Friday (Leg Days)"),
            ("d3k2", "Vitamin D3 + K2", "125 mcg", "#3E9E7A", "10:30", "Morning", nil, nil),
            ("citrulline", "L-Citrulline", "6 g", "#8E9AAC", "11:45", "Pre-Workout", true, nil),
            ("caffeine", "Nutricost Caffeine", "200 mg", "#8E9AAC", "11:45", "Pre-Workout", true, nil),
            ("creatine", "Creatine Monohydrate", "5 g", "#3D7AB8", "15:00", "Lunch / Post-Workout", nil, nil),
            ("omega3", "Omega-3 Fish Oil", "2 caps", "#3D7AB8", "15:00", "Lunch / Post-Workout", nil, nil),
            ("magnesium", "Magnesium Glycinate", "300 mg", "#8A6FA8", "22:00", "Before Bed", nil, nil),
            ("glycine", "Glycine", "5 g", "#8A6FA8", "22:00", "Before Bed", nil, nil),
            ("theanine", "L-Theanine", "200 mg", "#8A6FA8", "22:00", "Before Bed", nil, nil),
        ]
        for (key, name, dose, color, time, slot, trainingOnly, notes) in items {
            _ = try? database.addCustomSupplement(
                userId: userId, name: name, dose: dose, color: color, form: nil, time: time,
                schedule: CustomSchedule(key: key, slot: slot, notes: notes, trainingOnly: trainingOnly),
                micros: SupplementNutrients.table[key]
            )
        }
    }
}
