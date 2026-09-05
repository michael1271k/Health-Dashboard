import Foundation

/// Which query keys a Supabase table change invalidates — a port of
/// `src/lib/query/realtimeKeys.ts` and `query/workoutKeys.ts`. OnyxData owns
/// the invalidation; this pins the fan-out so the two sides cannot drift.
public enum RealtimeKeys {
    public static let workoutQueryKeys: [[String]] = [
        ["workout_sessions"], ["workout_sets"], ["exercises"], ["routine_template"], ["continuum"], ["day_vault"],
        ["readiness_today"], ["weekly_volume"], ["session_trends"], ["weekly_export"], ["muscle_analytics"],
        ["exercise_history"], ["session_intel"], ["session_detail"], ["gym_reports"], ["month_activity"], ["trends"],
        ["weekly_review"], ["coach"], ["session_global_number"], ["week_recovery"],
        ["week_so_far"], ["effort_baseline"], ["session_pr_records"], ["session_metrics_seed"], ["doms_sources"],
        ["personal_records"], ["progression_queue"], ["doms_logs"],
    ]

    /// Table → keys, in the TS object's order.
    public static let tableKeys: [(String, [[String]])] = [
        ("daily_logs", [["daily_logs"], ["today"], ["readiness_today"], ["coach"], ["trends"], ["continuum"], ["day_vault"], ["sleep_debt"]]),
        ("daily_metrics", [["daily_logs"], ["today"], ["readiness_today"], ["day_vault"]]),
        ("nutrition_entries", [["nutrition_entries"], ["daily_logs"], ["today"], ["coach"], ["continuum"], ["day_vault"]]),
        ("body_composition", [["body_composition"], ["trends"], ["coach"]]),
        ("sleep_sessions", [["sleep_sessions"], ["today"], ["readiness_today"], ["trends"], ["weekly_review"], ["sleep_debt"]]),
        ("workout_sessions", workoutQueryKeys),
        ("workout_sets", workoutQueryKeys),
        ("daily_scores", [["today"], ["readiness_today"], ["daily_logs"], ["weekly_review"], ["trends"], ["coach"], ["continuum"], ["day_vault"], ["month_activity"], ["week_recovery"]]),
        ("supplement_log", [["supplement_log"], ["day_vault"]]),
        ("water_intake", [["water_intake"], ["today"], ["day_vault"], ["continuum"], ["weekly_review"]]),
        ("reports", [["reports"], ["weekly_review"]]),
        ("user_goals", [["user_goals"], ["today"], ["readiness_today"], ["coach"], ["day_vault"], ["nutrition_entries"]]),
        ("schedule_overrides", [["schedule_overrides"], ["day_vault"], ["daily_logs"], ["workout_sessions"], ["supplement_log"]]),
    ]

    public static var tables: [String] { tableKeys.map(\.0) }

    public static func keys(for table: String) -> [[String]]? { tableKeys.first { $0.0 == table }?.1 }
}
