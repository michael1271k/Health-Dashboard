import Foundation
import GRDB

/// The Day and Fuel screens' read and write path — one logical day, eleven
/// tables.
///
/// ── THE SAME RULE AS `GoalsEditing`, TWELVE TIMES ───────────────────────────
/// Every writer here reads the row, changes it, saves it and queues it inside
/// ONE transaction. A row that is written locally and not queued never leaves
/// the phone; a row that is queued and not written is a queue item for nothing.
/// The outbox exists to make both impossible, and it can only do that if no
/// screen ever holds a transaction of its own — which is why `AppDatabase.writer`
/// stays internal and this file is the API a screen gets.
///
/// ── WHAT THE WEB APP DID THAT THIS DOES NOT ─────────────────────────────────
/// Each of these tables had its own react-query hook, its own optimistic
/// update, its own invalidation list, and — for `daily_logs` — a split into
/// "core" and "extended" columns with a retry that swallowed `PGRST204` because
/// the column might not have been migrated yet. None of that is ported. Every
/// column is live (see memory: `aug31-pending-sql`), the local store is
/// reactive, and a failed write is reported to the caller as an error rather
/// than to a cache as a rollback.
///
/// ── DELETES AND CLEARS ──────────────────────────────────────────────────────
/// This is the first wave that DELETES a mirrored row (a skipped dose undone, a
/// water override handed back to HealthKit, a day target dropped, a swap
/// undone) and the first that CLEARS a column (an exception day un-marked). Both
/// go through `enqueueRowDelete` and `RowRef.nulls` in `RowPush`; a delete
/// written here without its queue item would be a row that comes back on the
/// next pull.
public extension AppDatabase {

    // MARK: - daily_logs

    /// The day's flat row — flags, scale readings, water, sleep minutes. `nil`
    /// until something writes the day.
    func dailyLogStream(userId: String, date: String) -> AsyncThrowingStream<DailyLogRow?, any Error> {
        stream(ValueObservation.tracking { db in
            try DailyLogRow.filter(Column("user_id") == userId && Column("date") == date).fetchOne(db)
        })
    }

    /// Patch the day's row, creating it if absent, and queue it.
    ///
    /// `clearing` names the columns the patch sets to `nil`, so the clear reaches
    /// the server (see `RowRef.nulls`). Forgetting it is not a crash but a silent
    /// disagreement: the phone says "no exception today", the server keeps "Event".
    @discardableResult
    func editDailyLog(
        userId: String, date: String, now: Date = Date(), clearing: [String] = [],
        _ change: @Sendable (inout DailyLogRow) -> Void
    ) throws -> DailyLogRow {
        try writer.write { db in
            try Self.patchDailyLog(db, userId: userId, date: date, now: now, clearing: clearing, change)
        }
    }

    static func patchDailyLog(
        _ db: Database, userId: String, date: String, now: Date, clearing: [String],
        _ change: (inout DailyLogRow) -> Void
    ) throws -> DailyLogRow {
        // The same minting HealthKit uses, so a hand-entered flag and a synced
        // step count land on ONE row for the day rather than racing to create it.
        var row = try existingDailyLog(db, userId: userId, date: date, now: now)
        change(&row)
        try row.save(db)
        try enqueueRowUpsert(table: DailyLogRow.databaseTableName, id: row.id, nulls: clearing, in: db)
        return row
    }

    // MARK: - Scale readings → body_composition

    /// Save the scale's numbers for a day.
    ///
    /// `daily_logs` first — it is the row every surface reads — then the
    /// `body_composition` ledger the charts and the Pathfinder deltas read,
    /// mirrored column for column the way the web's `BODY_MIRROR` does. The
    /// ledger row is created only once a weight exists: `body_composition.weight_kg`
    /// is `NOT NULL` server-side, so a weightless day genuinely cannot open one
    /// and stays in `daily_logs` until a weight lands.
    ///
    /// No tape measurements. There is no waist or hip column here and there
    /// will not be one; the W:H ratio is one float the scale reports.
    func saveBodyMetrics(
        userId: String, date: String, now: Date = Date(),
        _ change: @Sendable (inout DailyLogRow) -> Void
    ) throws {
        try writer.write { db in
            let day = try Self.patchDailyLog(db, userId: userId, date: date, now: now, clearing: [], change)

            let scope = BodyCompositionRow.filter(Column("user_id") == userId && Column("date") == date)
            var ledger: BodyCompositionRow
            if let existing = try scope.order(Column("measured_at").desc).fetchOne(db) {
                ledger = existing
            } else {
                guard let weight = day.weightKg else { return }
                ledger = BodyCompositionRow(
                    id: newOnyxID(), userId: userId,
                    // 07:00Z — a morning weigh-in, and the same stamp the web
                    // writes so the two never create a second row for one day.
                    measuredAt: Self.utcInstant(date, hour: 7) ?? now,
                    date: date, weightKg: weight, createdAt: now
                )
            }
            // Only what the day HAS: a mirror must not blank a ledger column the
            // scale did not report this morning.
            if let v = day.weightKg { ledger.weightKg = v }
            if let v = day.bodyFatPct { ledger.bodyFatPct = v }
            if let v = day.muscleMassKg { ledger.muscleMassKg = v }
            if let v = day.fatFreeMassKg { ledger.fatFreeMassKg = v }
            if let v = day.fatMassKg { ledger.fatMassKg = v }
            if let v = day.waterPercent { ledger.waterPct = v }
            if let v = day.musclePercent { ledger.musclePct = v }
            if let v = day.boneMineral { ledger.boneMineralPct = v }
            if let v = day.visceralFat { ledger.visceralFat = v }
            if let v = day.bmr { ledger.bmr = v }
            if let v = day.bmi { ledger.bmi = v }
            if let v = day.skeletalMuscleMassKg { ledger.skeletalMuscleMassKg = v }
            if let v = day.estimatedWaistToHipRatio { ledger.estimatedWaistToHipRatio = v }
            try ledger.save(db)
            try Self.enqueueRowUpsert(table: BodyCompositionRow.databaseTableName, id: ledger.id, in: db)
        }
    }

    /// The day's ledger row, if the scale has reported one.
    func bodyCompositionStream(userId: String, date: String) -> AsyncThrowingStream<BodyCompositionRow?, any Error> {
        stream(ValueObservation.tracking { db in
            try BodyCompositionRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .order(Column("measured_at").desc)
                .fetchOne(db)
        })
    }

    /// The most recent day BEFORE `date` with any scale reading.
    ///
    /// The InBody form shows it as placeholders — muscle %, water %, protein %
    /// and bone mineral have no HealthKit type and are only ever typed, and a
    /// blank field with nothing saying what it was last time is how 78.3 gets
    /// recalled from memory wrong. It is context, not a measurement: the form
    /// fills the edit buffer from it and writes nothing until Save.
    func latestBodyReading(userId: String, before date: String) throws -> DailyLogRow? {
        try writer.read { db in
            try DailyLogRow
                .filter(Column("user_id") == userId && Column("date") < date)
                .filter(sql: """
                    weight_kg IS NOT NULL OR body_fat_pct IS NOT NULL OR muscle_percent IS NOT NULL
                    OR water_percent IS NOT NULL OR protein_percent IS NOT NULL OR bone_mineral IS NOT NULL
                    OR visceral_fat IS NOT NULL OR bmr IS NOT NULL OR bmi IS NOT NULL
                    OR skeletal_muscle_mass_kg IS NOT NULL OR estimated_waist_to_hip_ratio IS NOT NULL
                    """)
                .order(Column("date").desc)
                .fetchOne(db)
        }
    }

    // MARK: - fatigue_logs

    /// Every reading logged on the day, legacy keys included — the caller folds
    /// them with `Fatigue.foldRows`, which knows what `noon` meant on a leg day.
    func fatigueStream(userId: String, date: String) -> AsyncThrowingStream<[FatigueLogRow], any Error> {
        stream(ValueObservation.tracking { db in
            try FatigueLogRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .order(Column("created_at"))
                .fetchAll(db)
        })
    }

    /// Set one slot's level, or clear it with `nil`.
    ///
    /// `superseding` lists the LEGACY keys this slot stands in for (`noon` on a
    /// training day is `pre`). They are deleted whatever the new value: a fold
    /// that reads both would keep showing the old key's reading after the user
    /// changed it under the new one.
    func setFatigue(
        userId: String, date: String, slot: String, level: Int?,
        superseding legacyKeys: [String] = [], now: Date = Date()
    ) throws {
        try writer.write { db in
            let scope = FatigueLogRow.filter(Column("user_id") == userId && Column("date") == date)
            var doomed: [FatigueLogRow] = []
            if !legacyKeys.isEmpty {
                doomed += try scope.filter(legacyKeys.contains(Column("slot"))).fetchAll(db)
            }
            let existing = try scope.filter(Column("slot") == slot).order(Column("created_at")).fetchAll(db)

            if let level {
                var row = existing.first
                    ?? FatigueLogRow(id: newOnyxID(), userId: userId, date: date, slot: slot, level: level, createdAt: now)
                row.level = level
                try row.save(db)
                try Self.enqueueRowUpsert(table: FatigueLogRow.databaseTableName, id: row.id, in: db)
                // A second row for the same slot should not exist; if the web
                // left one, it goes rather than shadowing the edit.
                doomed += existing.dropFirst()
            } else {
                doomed += existing
            }
            for row in doomed {
                try row.delete(db)
                try Self.enqueueRowDelete(table: FatigueLogRow.databaseTableName, key: ["id": row.id], in: db)
            }
        }
    }

    // MARK: - doms_logs

    func domsStream(userId: String, date: String) -> AsyncThrowingStream<[DomsLogRow], any Error> {
        stream(ValueObservation.tracking { db in
            try DomsLogRow.filter(Column("user_id") == userId && Column("date") == date).fetchAll(db)
        })
    }

    /// Rate (or re-rate) a muscle. One row per (day, muscle), so tapping a
    /// different level replaces the rating rather than stacking rows. `0` is a
    /// stored rating — "None" — not an absence, exactly as the web writes it.
    ///
    /// `source` ties the rating to the session that caused it, when the caller
    /// knows one. Left alone when it does not, so a re-rating never erases the
    /// attribution an earlier one carried.
    func setDoms(
        userId: String, date: String, muscleGroup: String, severity: Int,
        source: (sessionId: String, dayKey: String?)? = nil, now: Date = Date()
    ) throws {
        try writer.write { db in
            var row = try DomsLogRow
                .filter(Column("user_id") == userId && Column("date") == date && Column("muscle_group") == muscleGroup)
                .fetchOne(db)
                ?? DomsLogRow(id: newOnyxID(), userId: userId, date: date, muscleGroup: muscleGroup, severity: severity, createdAt: now)
            row.severity = severity
            if let source {
                row.sourceSessionId = source.sessionId
                row.sourceDayKey = source.dayKey
            }
            try row.save(db)
            try Self.enqueueRowUpsert(table: DomsLogRow.databaseTableName, id: row.id, in: db)
        }
    }

    // MARK: - supplement_log / custom_supplements

    /// The day's EXCEPTIONS. Absence means taken — the stack is a protocol and
    /// the row states the one thing that departed from it (`taken = false`).
    func supplementLogStream(userId: String, date: String) -> AsyncThrowingStream<[SupplementLogRow], any Error> {
        stream(ValueObservation.tracking { db in
            try SupplementLogRow.filter(Column("user_id") == userId && Column("date") == date).fetchAll(db)
        })
    }

    /// The user's whole stack, in slot-time order. Empty means unseeded, and
    /// the caller falls back to the seed protocol.
    func customSupplementsStream(userId: String) -> AsyncThrowingStream<[CustomSupplementRow], any Error> {
        stream(ValueObservation.tracking { db in
            try CustomSupplementRow.filter(Column("user_id") == userId).order(Column("time")).fetchAll(db)
        })
    }

    /// Mark a dose skipped, or undo that.
    ///
    /// Skipping writes the one row; undoing DELETES it rather than writing
    /// `taken = true`, because absence is already the word for taken and two
    /// spellings of one fact drift the first time the schedule changes under
    /// them. `dueAt` is the slot's own time on that date, so the stamp says when
    /// the dose was due rather than when the user got round to saying so.
    func setSupplementSkipped(
        userId: String, date: String, itemKey: String, skipped: Bool, dueAt: Date? = nil
    ) throws {
        try writer.write { db in
            let key = ["user_id": userId, "date": date, "item_key": itemKey]
            let scope = SupplementLogRow
                .filter(Column("user_id") == userId && Column("date") == date && Column("item_key") == itemKey)
            guard skipped else {
                _ = try scope.deleteAll(db)
                try Self.enqueueRowDelete(table: SupplementLogRow.databaseTableName, key: key, in: db)
                return
            }
            var row = try scope.fetchOne(db) ?? SupplementLogRow(
                userId: userId, date: date, itemKey: itemKey, taken: false,
                takenAt: dueAt, updatedAt: Self.localWriteTimestamp
            )
            row.taken = false
            row.takenAt = dueAt
            try row.save(db)
            try Self.enqueueRowUpsert(
                table: SupplementLogRow.databaseTableName,
                id: try Self.rowID(table: SupplementLogRow.databaseTableName, key: key, in: db),
                in: db
            )
        }
    }

    // MARK: - cardio_logs

    func cardioStream(userId: String, date: String) -> AsyncThrowingStream<[CardioLogRow], any Error> {
        stream(ValueObservation.tracking { db in
            try CardioLogRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .order(Column("created_at"))
                .fetchAll(db)
        })
    }

    /// Log a cardio bout. `kcal` is written alongside `active_kcal` on purpose:
    /// historical readers and the weekly export's pre-migration fallback still
    /// read the old column for the active figure.
    func addCardio(_ row: CardioLogRow) throws {
        try writer.write { db in
            var row = row
            if row.kcal == nil { row.kcal = row.activeKcal }
            try row.save(db)
            try Self.enqueueRowUpsert(table: CardioLogRow.databaseTableName, id: row.id, in: db)
        }
    }

    /// Date-free: the id is enough, and a deletion can move a record, so every
    /// cardio reader re-derives rather than patching a cache.
    func deleteCardio(id: String) throws {
        try writer.write { db in
            _ = try CardioLogRow.deleteOne(db, key: id)
            try Self.enqueueRowDelete(table: CardioLogRow.databaseTableName, key: ["id": id], in: db)
        }
    }

    // MARK: - sleep

    /// The night that ENDED on the morning of `date` — the `[prev 12:00Z, D
    /// 12:00Z)` window every reader and writer shares. The longest session in
    /// the window when there are several; a nap is not the night.
    func sleepNightStream(userId: String, date: String) -> AsyncThrowingStream<SleepSessionRow?, any Error> {
        guard let window = NightWindow.range(date) else {
            return AsyncThrowingStream { continuation in
                continuation.yield(nil)
                continuation.finish()
            }
        }
        return stream(ValueObservation.tracking { db in
            try SleepSessionRow
                .filter(Column("user_id") == userId
                        && Column("start_time") >= window.from
                        && Column("start_time") < window.to)
                .order(Column("duration_min").desc)
                .fetchOne(db)
        })
    }

    /// `(date, sleep_minutes)` for every day in `from...to`, oldest first — the
    /// input to `SleepDebt.compute`. Two columns of a fifty-column row, on
    /// purpose: the gauge redraws when a night changes, not when a step count does.
    func nightMinutesStream(userId: String, from: String, to: String) -> AsyncThrowingStream<[NightMinutes], any Error> {
        stream(ValueObservation.tracking { db in
            try Row.fetchAll(
                db,
                sql: "SELECT date, sleep_minutes FROM daily_logs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date",
                arguments: [userId, from, to]
            ).map { NightMinutes(date: $0["date"], sleepMinutes: $0["sleep_minutes"]) }
        })
    }

    // MARK: - nutrition_entries

    func nutritionEntriesStream(userId: String, date: String) -> AsyncThrowingStream<[NutritionEntryRow], any Error> {
        stream(ValueObservation.tracking { db in
            try NutritionEntryRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .order(Column("logged_at"))
                .fetchAll(db)
        })
    }

    /// Hand-corrected macros for the whole day: ONE `daily` row with the
    /// per-day manual sentinel in `hk_uuid`, so HealthKit's ingest skips the
    /// day and a re-save upserts the same row rather than colliding on the
    /// unique index (the `'manual'` literal could only ever exist on one date).
    func setManualMacros(
        userId: String, date: String,
        calories: Double, proteinG: Double, carbsG: Double, fatG: Double, phase: String?,
        now: Date = Date()
    ) throws {
        try writer.write { db in
            var row = try NutritionEntryRow
                .filter(Column("user_id") == userId && Column("date") == date && Column("meal_type") == "daily")
                .fetchOne(db)
                ?? NutritionEntryRow(
                    id: newOnyxID(), userId: userId, loggedAt: Self.utcInstant(date, hour: 12) ?? now,
                    date: date, mealType: "daily", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, createdAt: now
                )
            row.hkUuid = "manual-\(date)"
            row.calories = max(0, calories.rounded())
            row.proteinG = max(0, proteinG)
            row.carbsG = max(0, carbsG)
            row.fatG = max(0, fatG)
            row.phase = phase
            try row.save(db)
            try Self.enqueueRowUpsert(table: NutritionEntryRow.databaseTableName, id: row.id, in: db)
        }
    }

    // MARK: - water_intake

    func waterIntakeStream(userId: String, date: String) -> AsyncThrowingStream<[WaterIntakeRow], any Error> {
        stream(ValueObservation.tracking { db in
            try WaterIntakeRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .order(Column("logged_at"))
                .fetchAll(db)
        })
    }

    /// Replace the day's water with one hand-entered figure.
    ///
    /// Two stores, kept in step: `daily_logs.water_ml` is what every surface
    /// renders, `water_intake` is what the scorer sums. The whole day's ledger
    /// is replaced — HealthKit's rows included — so it lands on exactly one row,
    /// and the row carries the water sentinel that tells the ingest to leave the
    /// day alone from now on.
    func setWaterOverride(userId: String, date: String, ml: Double, now: Date = Date()) throws {
        try writer.write { db in
            let amount = max(0, ml.rounded())
            _ = try Self.patchDailyLog(db, userId: userId, date: date, now: now, clearing: []) { $0.waterMl = amount }
            try Self.deleteWater(db, userId: userId, date: date)
            var row = WaterIntakeRow(
                id: newOnyxID(), userId: userId, hkUuid: "manual-water-\(date)",
                loggedAt: Self.utcInstant(date, hour: 12) ?? now, date: date, amountMl: amount, createdAt: now
            )
            try row.save(db)
            try Self.enqueueRowUpsert(table: WaterIntakeRow.databaseTableName, id: row.id, in: db)
        }
    }

    /// Hand the day back to Apple Health.
    ///
    /// Clears BOTH stores rather than restoring the synced value — it is not
    /// held anywhere, and inventing one would be worse than a blank day. The
    /// next HealthKit sync repopulates it; until then the day reads untracked,
    /// which is true. `water_ml` is named in `clearing` so the server's copy
    /// is cleared too rather than merged over.
    func clearWaterOverride(userId: String, date: String, now: Date = Date()) throws {
        try writer.write { db in
            try Self.deleteWater(db, userId: userId, date: date)
            _ = try Self.patchDailyLog(db, userId: userId, date: date, now: now, clearing: ["water_ml"]) { $0.waterMl = nil }
        }
    }

    private static func deleteWater(_ db: Database, userId: String, date: String) throws {
        for row in try WaterIntakeRow.filter(Column("user_id") == userId && Column("date") == date).fetchAll(db) {
            try row.delete(db)
            try enqueueRowDelete(table: WaterIntakeRow.databaseTableName, key: ["id": row.id], in: db)
        }
    }

    // MARK: - daily_targets / target_profiles

    /// The day's override, or `nil` — the rung in force applies.
    func dailyTargetStream(userId: String, date: String) -> AsyncThrowingStream<DailyTargetRow?, any Error> {
        stream(ValueObservation.tracking { db in
            try DailyTargetRow.filter(Column("user_id") == userId && Column("date") == date).fetchOne(db)
        })
    }

    func targetProfilesStream(userId: String) -> AsyncThrowingStream<[TargetProfileRow], any Error> {
        stream(ValueObservation.tracking { db in
            try TargetProfileRow.filter(Column("user_id") == userId).order(Column("sort")).fetchAll(db)
        })
    }

    /// Set (or re-set) the day's target. A fresh row tracks carbs and fat, as
    /// the web's does; the caller flips those for a day whose fat should not be
    /// graded. Keyed on `(user_id, date)` — no `id` on either side.
    func setDailyTarget(
        userId: String, date: String, now: Date = Date(),
        _ change: @Sendable (inout DailyTargetRow) -> Void
    ) throws {
        try writer.write { db in
            var row = try DailyTargetRow
                .filter(Column("user_id") == userId && Column("date") == date)
                .fetchOne(db)
                ?? DailyTargetRow(userId: userId, date: date, updatedAt: Self.localWriteTimestamp, trackCarbs: true, trackFat: true)
            change(&row)
            try row.save(db)
            try Self.enqueueRowUpsert(
                table: DailyTargetRow.databaseTableName,
                id: try Self.rowID(table: DailyTargetRow.databaseTableName, key: ["user_id": userId, "date": date], in: db),
                in: db
            )
        }
    }

    /// Drop the override — the day goes back to whatever rung is in force.
    func clearDailyTarget(userId: String, date: String) throws {
        try writer.write { db in
            _ = try DailyTargetRow.filter(Column("user_id") == userId && Column("date") == date).deleteAll(db)
            try Self.enqueueRowDelete(
                table: DailyTargetRow.databaseTableName, key: ["user_id": userId, "date": date], in: db
            )
        }
    }

    // MARK: - schedule_overrides / program_day_layout

    /// Every per-date swap, date → day key (or `"rest"`). The whole table: it
    /// is a few dozen rows and the schedule rule needs any of them.
    func scheduleOverridesStream(userId: String) -> AsyncThrowingStream<[String: String], any Error> {
        stream(ValueObservation.tracking { db in
            let rows = try ScheduleOverrideRow.filter(Column("user_id") == userId).fetchAll(db)
            return Dictionary(rows.map { ($0.date, $0.dayKey) }, uniquingKeysWith: { _, last in last })
        })
    }

    /// The permanent weekday layout of one plan, if the user has remapped it.
    func programDayLayoutStream(userId: String, programId: String) -> AsyncThrowingStream<ProgramDayLayoutRow?, any Error> {
        stream(ValueObservation.tracking { db in
            try ProgramDayLayoutRow
                .filter(Column("user_id") == userId && Column("program_id") == programId)
                .fetchOne(db)
        })
    }

    /// Apply a swap plan's writes — a rest-day swap is TWO rows — and queue them.
    ///
    /// ── THE SUPPLEMENT CASCADE ──────────────────────────────────────────────
    /// A training-only stimulant is not part of a rest day, and absence in
    /// `supplement_log` means taken. So whichever direction a date moves, the
    /// right state for its training-only rows is GONE: Train→Rest removes a
    /// skip for a dose that stopped being asked for, Rest→Train removes nothing
    /// that needs to exist. One writer, both directions, shared with the undo.
    func applyScheduleWrites(
        userId: String, _ writes: [(date: String, dayKey: String)],
        trainingOnlySupplementKeys: [String] = [], now: Date = Date()
    ) throws {
        guard !writes.isEmpty else { return }
        try writer.write { db in
            for write in writes {
                var row = try ScheduleOverrideRow
                    .filter(Column("user_id") == userId && Column("date") == write.date)
                    .fetchOne(db)
                    ?? ScheduleOverrideRow(userId: userId, date: write.date, dayKey: write.dayKey, updatedAt: Self.localWriteTimestamp)
                row.dayKey = write.dayKey
                try row.save(db)
                try Self.enqueueRowUpsert(
                    table: ScheduleOverrideRow.databaseTableName,
                    id: try Self.rowID(table: ScheduleOverrideRow.databaseTableName, key: ["user_id": userId, "date": write.date], in: db),
                    in: db
                )
                try Self.dropTrainingOnlySupplements(db, userId: userId, date: write.date, keys: trainingOnlySupplementKeys)
            }
        }
    }

    /// Undo. Takes a LIST because a rest-day swap touches two dates, and undoing
    /// one leaves the week half-rearranged — worse than either state.
    func clearScheduleOverrides(
        userId: String, dates: [String], trainingOnlySupplementKeys: [String] = []
    ) throws {
        guard !dates.isEmpty else { return }
        try writer.write { db in
            for date in dates {
                _ = try ScheduleOverrideRow.filter(Column("user_id") == userId && Column("date") == date).deleteAll(db)
                try Self.enqueueRowDelete(
                    table: ScheduleOverrideRow.databaseTableName, key: ["user_id": userId, "date": date], in: db
                )
                try Self.dropTrainingOnlySupplements(db, userId: userId, date: date, keys: trainingOnlySupplementKeys)
            }
        }
    }

    private static func dropTrainingOnlySupplements(_ db: Database, userId: String, date: String, keys: [String]) throws {
        guard !keys.isEmpty else { return }
        let rows = try SupplementLogRow
            .filter(Column("user_id") == userId && Column("date") == date && keys.contains(Column("item_key")))
            .fetchAll(db)
        for row in rows {
            try row.delete(db)
            try enqueueRowDelete(
                table: SupplementLogRow.databaseTableName,
                key: ["user_id": userId, "date": date, "item_key": row.itemKey], in: db
            )
        }
    }

    /// Committed sessions on the given dates, as the swap rule needs to see
    /// them: a date that holds a finished session cannot have its plan changed
    /// under it (`Swap.blockForPlacement`). A session still open is not yet a
    /// fact about the day.
    func loggedDays(userId: String, dates: [String]) throws -> [LoggedSessionDay] {
        guard !dates.isEmpty else { return [] }
        return try writer.read { db in
            try WorkoutSession
                .filter(Column("user_id") == userId && dates.contains(Column("date")) && Column("ended_at") != nil)
                .order(Column("date"))
                .fetchAll(db)
                .map { LoggedSessionDay(date: $0.date, dayKey: $0.dayKey) }
        }
    }

    // MARK: - Helpers

    /// `<date>T<hour>:00:00Z` — the fixed UTC stamps the web writes for a manual
    /// row, so a re-save from either app lands on the same instant.
    static func utcInstant(_ date: String, hour: Int) -> Date? {
        NightWindow.midnight(date)?.addingTimeInterval(TimeInterval(hour) * 3600)
    }
}

/// One night's minutes, for the sleep-debt gauge.
public struct NightMinutes: Sendable, Equatable {
    public let date: String
    public let sleepMinutes: Int?

    public init(date: String, sleepMinutes: Int?) {
        self.date = date
        self.sleepMinutes = sleepMinutes
    }
}

/// A committed session, as the scheduler needs to see it.
public struct LoggedSessionDay: Sendable, Equatable {
    public let date: String
    public let dayKey: String?

    public init(date: String, dayKey: String?) {
        self.date = date
        self.dayKey = dayKey
    }
}
