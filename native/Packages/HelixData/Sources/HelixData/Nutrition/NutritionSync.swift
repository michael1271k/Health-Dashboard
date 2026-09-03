import Foundation
import Supabase

/// Pulls the Nutrition screen's window down from Postgres and lands it in the
/// local read cache.
///
/// ── THE ONE THING THIS IS NOT ───────────────────────────────────────────────
/// It is not the sync layer. Nothing here pushes: the outbox is untouched, no
/// `set_event.*` item finds a destination, and the local-to-Postgres column
/// translation those writes need is still unwritten (the header of `Models.swift`
/// carries the full diff). This is a one-directional read for one screen, and
/// naming it anything broader would be a claim the code does not support.
///
/// ── FOUR QUERIES, ONE ZIP, MATCHING `useDailyLogs` ──────────────────────────
/// The web app issues the same four selects in parallel and joins them by date
/// on the client. That is copied deliberately rather than replaced with a view
/// or an RPC: a database object is a schema change, schema changes here are
/// paste-SQL by hand, and this screen does not need one to work.
///
/// The queries run concurrently in a task group for the same reason the web
/// app's `Promise.all` does — four sequential round trips over a phone network
/// is most of a second, and they have no dependency on each other.
public struct NutritionSync: Sendable {

    private let database: AppDatabase
    private let client: SupabaseClient

    public init(database: AppDatabase, client: SupabaseClient) {
        self.database = database
        self.client = client
    }

    // MARK: Wire rows
    //
    // Deliberately separate from `NutritionDay`. These mirror POSTGRES — its
    // column names, its nullability, its four different tables — while
    // `NutritionDay` mirrors the screen. Collapsing them into one type is what
    // produces a model that is a bad fit for both, and it is exactly the mistake
    // the earlier "these columns match Supabase exactly" comment recorded.

    private struct EntryRow: Decodable {
        let date: String
        let calories: Double?
        let proteinG: Double?
        let carbsG: Double?
        let fatG: Double?
        let phase: String?

        enum CodingKeys: String, CodingKey {
            case date, calories, phase
            case proteinG = "protein_g"
            case carbsG = "carbs_g"
            case fatG = "fat_g"
        }
    }

    private struct MetricRow: Decodable {
        let date: String
        let steps: Double?
        let activeCal: Double?

        enum CodingKeys: String, CodingKey {
            case date, steps
            case activeCal = "active_cal"
        }
    }

    private struct DailyLogRow: Decodable {
        let date: String
        let waterMl: Double?
        let exception: String?
        /// `boolean NOT NULL` server-side, but decoded as optional: a column
        /// that is NOT NULL today is not NOT NULL forever, and a decode failure
        /// here would blank the whole screen rather than one flag.
        let estimated: Bool?

        enum CodingKeys: String, CodingKey {
            case date
            case waterMl = "water_ml"
            case exception = "nutrition_exception"
            case estimated = "nutrition_estimated"
        }
    }

    private struct GoalsRow: Decodable {
        let userId: String
        let calorieGoal: Int?
        let proteinGoalG: Int?
        let carbsGoalG: Int?
        let fatGoalG: Int?
        let waterGoalMl: Int?
        let stepsGoal: Int?
        let goalPreset: String?

        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case calorieGoal = "calorie_goal"
            case proteinGoalG = "protein_goal_g"
            case carbsGoalG = "carbs_goal_g"
            case fatGoalG = "fat_goal_g"
            case waterGoalMl = "water_goal_ml"
            case stepsGoal = "steps_goal"
            case goalPreset = "goal_preset"
        }
    }

    // MARK: Refresh

    /// Fetch `[from, to]` inclusive and replace that window locally.
    ///
    /// Throws only on a network or decode failure. A caller that is drawing from
    /// the cache should treat a throw as "the screen is stale", never as "the
    /// screen is empty" — which is the whole point of reading from GRDB.
    public func refresh(from: String, to: String, userId: UUID) async throws {
        async let entries = fetchEntries(from: from, to: to)
        async let metrics = fetchMetrics(from: from, to: to)
        async let logs = fetchDailyLogs(from: from, to: to)
        async let goals = fetchGoals(userId: userId)

        let days = try await zip(
            entries: entries, metrics: metrics, logs: logs
        )
        try await database.replaceNutritionDays(days, from: from, to: to)

        if let row = try await goals {
            try await database.saveStoredGoals(StoredGoals(
                userId: row.userId,
                calorieGoal: row.calorieGoal,
                proteinGoalG: row.proteinGoalG,
                carbsGoalG: row.carbsGoalG,
                fatGoalG: row.fatGoalG,
                waterGoalMl: row.waterGoalMl,
                stepsGoal: row.stepsGoal,
                goalPreset: row.goalPreset
            ))
        }
    }

    /// Join the three day-keyed tables into one row per date.
    ///
    /// A day appears if ANY of the three has something for it. Keying only off
    /// `nutrition_entries` would hide a day where the scale and the step count
    /// arrived but nothing was eaten yet — which is every morning.
    private func zip(
        entries: [EntryRow], metrics: [MetricRow], logs: [DailyLogRow]
    ) -> [NutritionDay] {
        let metricByDate = Dictionary(metrics.map { ($0.date, $0) }, uniquingKeysWith: { _, last in last })
        let logByDate = Dictionary(logs.map { ($0.date, $0) }, uniquingKeysWith: { _, last in last })
        let entryByDate = Dictionary(entries.map { ($0.date, $0) }, uniquingKeysWith: { _, last in last })

        let dates = Set(entryByDate.keys).union(metricByDate.keys).union(logByDate.keys)

        return dates.sorted(by: >).map { date in
            let entry = entryByDate[date]
            let metric = metricByDate[date]
            let log = logByDate[date]
            return NutritionDay(
                date: date,
                calories: entry?.calories,
                proteinG: entry?.proteinG,
                carbsG: entry?.carbsG,
                fatG: entry?.fatG,
                phase: entry?.phase,
                steps: metric?.steps,
                activeCal: metric?.activeCal,
                waterMl: log?.waterMl,
                exception: log?.exception,
                estimated: log?.estimated ?? false
            )
        }
    }

    // MARK: Queries

    private func fetchEntries(from: String, to: String) async throws -> [EntryRow] {
        try await client
            .from("nutrition_entries")
            .select("date,calories,protein_g,carbs_g,fat_g,phase")
            // The daily rollup row, not the individual meals. Without this
            // filter the same date comes back several times and the zip keeps
            // whichever arrived last, which is a coin flip.
            .eq("meal_type", value: "daily")
            .gte("date", value: from)
            .lte("date", value: to)
            .order("date", ascending: false)
            .execute()
            .value
    }

    private func fetchMetrics(from: String, to: String) async throws -> [MetricRow] {
        try await client
            .from("daily_metrics")
            .select("date,steps,active_cal")
            .gte("date", value: from)
            .lte("date", value: to)
            .execute()
            .value
    }

    private func fetchDailyLogs(from: String, to: String) async throws -> [DailyLogRow] {
        try await client
            .from("daily_logs")
            .select("date,water_ml,nutrition_exception,nutrition_estimated")
            .gte("date", value: from)
            .lte("date", value: to)
            .execute()
            .value
    }

    private func fetchGoals(userId: UUID) async throws -> GoalsRow? {
        let rows: [GoalsRow] = try await client
            .from("user_goals")
            .select("user_id,calorie_goal,protein_goal_g,carbs_goal_g,fat_goal_g,water_goal_ml,steps_goal,goal_preset")
            .eq("user_id", value: userId.uuidString)
            // `.single()` would throw on an account that has never saved goals,
            // and "no goals yet" is a state this screen renders rather than an
            // error it reports.
            .limit(1)
            .execute()
            .value
        return rows.first
    }
}
