import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// The weekly export's payload — `WeeklyExportInput` and its parts, as declared
// in `src/lib/reports/weeklyExport.ts`. Nil means "not recorded" throughout;
// the renderer prints `—` for it and never a zero.
// ─────────────────────────────────────────────────────────────────────────────

public struct ExportSupplement: Codable, Equatable, Sendable {
    /// "HH:MM", or nil for an unscheduled item.
    public var time: String?
    public var name: String
    public var dose: String
    public var trainingDose: String?
    public var restDose: String?
    public var trainingOnly: Bool?
    public var notes: String?
}

public struct SupplementLogEntry: Codable, Equatable, Sendable {
    public var key: String
    public var time: String?
}

public struct ExportDay: Codable, Equatable, Sendable {
    public var date: String
    public var weekdayLabel: String
    public var isTrainingDay: Bool
    public var weightKg: Double?
    public var calories: Double?
    public var proteinG: Double?
    public var carbsG: Double?
    public var fatG: Double?
    public var steps: Double?
    public var distanceM: Double?
    public var trainingMin: Double?
    public var sleepMin: Double?
    public var deepMin: Double?
    public var remMin: Double?
    public var restingHr: Double?
    public var hrvMs: Double?
    public var wristTempDeltaC: Double?
    public var bloodOxygenPct: Double?
    public var avgHr: Double?
    public var respiratoryRate: Double?
    public var vo2max: Double?
    public var daylightMin: Double?
    public var exerciseMin: Double?
    public var standHours: Double?
    public var standMin: Double?
    public var coreMin: Double?
    public var awakeMin: Double?
    public var bedTime: String?
    public var wakeTime: String?
    public var sleepOnsetTrouble: Bool?
    /// Battery v8's inputs the raw body cannot show — the two trailing
    /// baselines the scorer compared against and the stored `battery_pct`.
    /// Read only by the Derived section. Nil on a payload built before v8.
    public var restingHrBaseline: Double?
    public var hrvBaseline: Double?
    public var batteryPct: Double?
    public var waterMl: Double?
    public var supplementsTaken: Double?
    public var supplementsPlanned: Double?
    public var supplementsLog: [SupplementLogEntry]?
    public var supplementsSkipped: [String]?
    public var nutrientsFood: [String: Double]?
    public var nutrientsStack: [String: Double]?
    public var activeKcal: Double?
    public var bmrKcal: Double?
    public var weighInSkipReason: String?
    public var nutritionException: String?
    public var nutritionEstimated: Bool
    public var targetProfile: String?
    public var trackCarbs: Bool?
    public var trackFat: Bool?
}

public struct ExportCardio: Codable, Equatable, Sendable {
    public var date: String
    public var kind: String
    public var distanceM: Double?
    public var durationMin: Double?
    public var kcal: Double?
    public var totalKcal: Double?
    public var avgHr: Double?
    public var effort: Double?
}

public struct ExportSet: Codable, Equatable, Sendable {
    public var weightKg: Double
    public var reps: Double
    public var rpe: Double?
    public var side: String?
    public var failure: Bool
    public var warmup: Bool?
    public var ghost: Bool?
    public var dropset: Bool?
    public var quality: String?
    public var pairId: String?

    var isWarmup: Bool { warmup == true }
    var isGhost: Bool { ghost == true }
}

public struct ExportExercise: Codable, Equatable, Sendable {
    public var name: String
    public var sets: [ExportSet]
    public var restTargetSec: Double?
    public var restPlanSec: Double?
    public var topKg: Double?
    public var repWindow: String?
}

public struct ExportPr: Codable, Equatable, Sendable {
    public var name: String
    public var weightKg: Double
    public var reps: Double
    public var axes: [PrAxis]
    public var volumeKg: Double?
    public var e1rmKg: Double?
}

public struct ExportSession: Codable, Equatable, Sendable {
    public var date: String
    public var startedAt: String?
    public var endedAt: String?
    public var sessionNumber: Double?
    public var label: String
    public var volumeKg: Double?
    public var setCount: Double?
    public var failureSets: Double?
    public var durationMin: Double?
    public var avgBpm: Double?
    public var caloriesBurned: Double?
    public var caloriesEstimated: Bool?
    public var avgBpmEstimated: Bool?
    public var sessionRpe: Double?
    public var exercises: [ExportExercise]
    public var prs: [ExportPr]
}

public struct ExportFatigue: Codable, Equatable, Sendable {
    public var date: String
    public var slot: String
    public var level: Double
    public var label: String
}

public struct ExportDoms: Codable, Equatable, Sendable {
    public var date: String
    public var muscle: String
    public var severity: Double
    public var sourceLabel: String?
    public var sourceDate: String?
}

public struct ExportBodyComp: Codable, Equatable, Sendable {
    public var date: String
    public var weightKg: Double?
    public var bmi: Double?
    public var bodyFatPct: Double?
    public var musclePercent: Double?
    public var waterPercent: Double?
    public var visceralFat: Double?
    public var bmr: Double?
    public var boneMineral: Double?
    public var muscleMassKg: Double?
    public var fatFreeMassKg: Double?
    public var fatMassKg: Double?
    public var proteinMassKg: Double?
    public var boneMineralKg: Double?
    public var waterMassKg: Double?
    public var proteinPercent: Double?
    public var skeletalMuscleMassKg: Double?
    public var estimatedWaistToHipRatio: Double?
}

public struct VolumeByMuscle: Codable, Equatable, Sendable {
    public var muscle: String
    public var sets: Double
    public var target: Double
    public var directSets: Double?
    public var indirectSets: Double?
}

public struct TonnageByMuscle: Codable, Equatable, Sendable {
    public var muscle: String
    public var volumeKg: Double
    public var directKg: Double?
}

/// The six figures the week-over-week block compares.
public struct TrendTotals: Codable, Equatable, Sendable {
    public var avgKcal: Double?
    public var totalVolumeKg: Double?
    public var avgSteps: Double?
    public var cardioMinutes: Double?
    public var avgWaterMl: Double?
    public var avgWeightKg: Double?
}

public struct LedgerWeek: Codable, Equatable, Sendable {
    public var label: String
    public var weekStart: String
    public var totals: TrendTotals
}

public struct WeeklyExportInput: Codable, Equatable, Sendable {
    public var weekStart: String
    public var weekEnd: String
    public var weekLabel: String?
    public var programLabel: String
    public var calorieGoal: Double?
    public var proteinGoalG: Double?
    public var stepsGoal: Double?
    public var sleepGoalHours: Double?
    public var waterGoalMl: Double?
    public var phaseLabel: String?
    public var targetPeriods: [TargetPeriod]?
    public var days: [ExportDay]
    public var sessions: [ExportSession]
    public var volumeByMuscle: [VolumeByMuscle]
    public var tonnageByMuscle: [TonnageByMuscle]?
    public var doms: [ExportDoms]
    public var fatigue: [ExportFatigue]?
    public var bodyComp: [ExportBodyComp]?
    public var cardio: [ExportCardio]?
    public var supplementProtocol: [ExportSupplement]?
    public var ledger: [LedgerWeek]?
}
