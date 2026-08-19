import AppIntents
import WidgetKit

// MARK: - Four families, one picker each
//
// ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
// Seven widget kinds: five `StaticConfiguration` tiles (Fuel, Battery, Today,
// This Week, Battery-Lock) and two configurable composites (Lifestyle,
// Performance). The five statics each answered one question and largely
// duplicated a face that already existed inside a composite — "Today" was the
// Lifestyle ledger with a fixed focus, "This Week" was the Performance week
// with a fixed focus — so the gallery listed the same content three times and
// none of the copies could be reconfigured.
//
// Four families now, split by WHAT YOU ARE ASKING rather than by which screen
// the number came from:
//
//   Fuel      what is left to eat, and what it is made of
//   Training  what today is, how the month went, whether the streak holds
//   Body      the scale, the night, and how ready the whole thing is
//   Lock      the same facts at accessory size
//
// ⚠️ Deleting a kind removes any already-placed instance of it from the Home
// Screen. That is accepted and intended: the old tiles are gone and the new
// families have to be added once.
//
// These are `AppEnum`, not `AppEntity`. An entity is for a queryable collection
// with identity; these are fixed choices and the picker should be a plain list,
// which is what an enum gets you for free.

// MARK: - Focus enums

enum FuelFocus: String, AppEnum {
  case calories, macros, water

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Focus" }
  static var caseDisplayRepresentations: [FuelFocus: DisplayRepresentation] = [
    .calories: DisplayRepresentation(title: "Calories", subtitle: "What is left against the goal"),
    .macros:   DisplayRepresentation(title: "Macros", subtitle: "Protein, carbs and fat against their targets"),
    .water:    DisplayRepresentation(title: "Water", subtitle: "Hydration, steps and the battery"),
  ]

  /// ── WHY THESE TAKE A DATE NOW ──────────────────────────────────────────────
  /// A focus used to name a tab root, so the water face opened Nutrition and
  /// left you to find hydration — a shortcut that costs a navigation instead of
  /// saving one. The precise destinations live on the DAY page, which needs a
  /// date, and the only correct date is the payload's (`snapshot.date`): it is
  /// the user's logical day resolved server-side in their own timezone, where an
  /// extension calling `Date()` would open the wrong day for anyone whose
  /// logical day and calendar day differ.
  ///
  /// Nil date falls back to the tab root — a placeholder entry has no payload
  /// and still has to be tappable.
  func link(_ date: String?) -> URL? {
    switch self {
    // Calories and macros belong to the Nutrition page, which is where they are
    // actually edited. Only water has a drawer on the day page.
    case .calories, .macros: return HelixLink.nutrition
    case .water:             return date.flatMap { HelixLink.day($0, section: "water") } ?? HelixLink.nutrition
    }
  }
}

enum TrainingFocus: String, AppEnum {
  case today, calendar, volume, streak, records, oneRepMax, cardio

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Focus" }
  static var caseDisplayRepresentations: [TrainingFocus: DisplayRepresentation] = [
    .today:     DisplayRepresentation(title: "Today", subtitle: "The session due, or the one you finished"),
    .calendar:  DisplayRepresentation(title: "Calendar", subtitle: "Six weeks of scheduled against logged"),
    .volume:    DisplayRepresentation(title: "Volume", subtitle: "This week's tonnage against last"),
    .streak:    DisplayRepresentation(title: "Program Day", subtitle: "Days elapsed since the cut began"),
    .records:   DisplayRepresentation(title: "Records", subtitle: "The most recent personal records"),
    .oneRepMax: DisplayRepresentation(title: "Estimated 1RM", subtitle: "Where the main lifts are trending"),
    .cardio:    DisplayRepresentation(title: "Cardio", subtitle: "The last session, and the week's Zone 2"),
  ]

  /// The scope follows the FOCUS, not the widget, so a calendar never pays to
  /// decode a ledger it does not draw.
  ///
  /// Volume sits with records and 1RM because its Large register is the
  /// per-muscle-family split, and `volumeByFamily` needs a `workout_sets` read
  /// that only the performance slice does. The eight-week tonnage trend it also
  /// needs is derived from sessions the route fetches in EVERY scope, so the
  /// server ships `volumeTrend` under both — which is what makes moving this
  /// focus lossless rather than a trade.
  var scope: HelixScope {
    switch self {
    case .records, .oneRepMax, .volume:       return .performance
    // Cardio rides with the training slice because that is where the route
    // builds it — one extra `cardio_logs` read beside the calendar, rather than
    // a fifth scope for a block this small.
    case .today, .calendar, .streak, .cardio: return .training
    }
  }

  /// See `FuelFocus.link(_:)` for why this takes the payload's date.
  func link(_ date: String?) -> URL? {
    switch self {
    case .today:               return HelixLink.workout
    case .calendar, .streak:   return HelixLink.progress
    case .volume:              return HelixLink.workout
    case .records, .oneRepMax: return HelixLink.exercises
    // Cardio is logged ON the day, not in the workout deck.
    case .cardio:              return date.flatMap { HelixLink.day($0) } ?? HelixLink.progress
    }
  }
}

enum BodyFocus: String, AppEnum {
  case weight, sleep, wellbeing, composition

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Focus" }
  static var caseDisplayRepresentations: [BodyFocus: DisplayRepresentation] = [
    .weight:    DisplayRepresentation(title: "Weight", subtitle: "The latest weigh-in and the fortnight trend"),
    .sleep:     DisplayRepresentation(title: "Sleep", subtitle: "Duration and the stage breakdown"),
    .wellbeing: DisplayRepresentation(title: "Well-being", subtitle: "The daily score, its parts, and today's verdict"),
    // "Composition", not "muscle": this face shows three different measurements
    // and one of them is called muscle. See HelixLifestyle's Weight header.
    .composition: DisplayRepresentation(title: "Composition", subtitle: "Body fat, lean tissue and fat-free mass"),
  ]

  /// See `FuelFocus.link(_:)` for why this takes the payload's date.
  func link(_ date: String?) -> URL? {
    switch self {
    // The night is a drawer on the day, not a section of Progress.
    case .sleep:                    return date.flatMap { HelixLink.day($0, section: "sleep") } ?? HelixLink.progress
    // The InBody form is where composition is entered, and the drawer the
    // dashboard's Body card already deep-links to.
    case .weight, .composition:     return date.flatMap { HelixLink.day($0, section: "inbody") } ?? HelixLink.progress
    // Well-being is a whole-of-Progress question; there is no one drawer for it.
    case .wellbeing:                return HelixLink.progress
    }
  }
}

/// The Vitals panel's four cuts of the same seven readings.
///
/// Not one focus per reading. Five near-identical entries in a picker is a
/// menu you scroll rather than choose from, and the readings genuinely group:
/// HRV and resting heart rate are the same question about recovery, blood
/// oxygen and respiratory rate the same question about breathing.
enum VitalsFocus: String, AppEnum {
  case panel, recovery, respiration, temperature

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Show" }
  static var caseDisplayRepresentations: [VitalsFocus: DisplayRepresentation] = [
    .panel:       DisplayRepresentation(title: "Panel", subtitle: "Every overnight reading against your normal"),
    .recovery:    DisplayRepresentation(title: "Recovery", subtitle: "HRV and resting heart rate"),
    .respiration: DisplayRepresentation(title: "Breathing", subtitle: "Blood oxygen and respiratory rate"),
    .temperature: DisplayRepresentation(title: "Temperature", subtitle: "Wrist temperature against your baseline"),
  ]

  /// See `FuelFocus.link(_:)` for why this takes the payload's date.
  ///
  /// All four land on the DAY, not on Progress: these are readings taken on one
  /// night, and the day drawer is where that night's numbers live. Progress is
  /// where trends live, which is a different question from "what happened".
  func link(_ date: String?) -> URL? {
    date.flatMap { HelixLink.day($0) } ?? HelixLink.progress
  }
}

enum LockFocus: String, AppEnum {
  case battery, calories, steps, workout

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Show" }
  static var caseDisplayRepresentations: [LockFocus: DisplayRepresentation] = [
    .battery:  DisplayRepresentation(title: "Battery", subtitle: "Recovery battery as a gauge"),
    .calories: DisplayRepresentation(title: "Calories", subtitle: "Calories left today"),
    .steps:    DisplayRepresentation(title: "Steps", subtitle: "Steps against the goal"),
    .workout:  DisplayRepresentation(title: "Workout", subtitle: "Today's session, or rest"),
  ]

  /// See `FuelFocus.link(_:)` for why this takes the payload's date.
  ///
  /// The accessory faces stay on tab roots deliberately — a Lock Screen tap is
  /// made in a hurry, and landing inside a drawer you then have to dismiss is
  /// worse there than the extra navigation.
  func link(_ date: String?) -> URL? {
    switch self {
    case .battery:  return HelixLink.home
    case .calories: return HelixLink.nutrition
    case .steps:    return HelixLink.progress
    case .workout:  return HelixLink.workout
    }
  }
}

// MARK: - Configurations

struct FuelConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Fuel" }
  static var description: IntentDescription {
    IntentDescription("Calories, macros and hydration — pick what leads.")
  }

  @Parameter(title: "Show", default: .calories)
  var focus: FuelFocus

  /// The payload slice this widget needs. Most of the contract exists for the
  /// other families, and an extension pays for every field in decode time and
  /// resident memory against a hard cap.
  var scope: HelixScope { .lifestyle }
  var helixFocus: HelixFocus { .fuel(focus) }

  static var galleryOptions: [(intent: FuelConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.calories), "Calories"),
     (recommendation(.macros), "Macros"),
     (recommendation(.water), "Water")]
  }

  static func recommendation(_ focus: FuelFocus) -> FuelConfiguration {
    let intent = FuelConfiguration()
    intent.focus = focus
    return intent
  }
}

struct TrainingConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Training" }
  static var description: IntentDescription {
    IntentDescription("Today's session, the month, volume, streak and records.")
  }

  @Parameter(title: "Show", default: .today)
  var focus: TrainingFocus

  var scope: HelixScope { focus.scope }
  var helixFocus: HelixFocus { .training(focus) }

  static var galleryOptions: [(intent: TrainingConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.today), "Today"),
     (recommendation(.calendar), "Calendar"),
     (recommendation(.volume), "Volume"),
     (recommendation(.streak), "Program Day"),
     (recommendation(.records), "Records"),
     (recommendation(.oneRepMax), "Estimated 1RM"),
     (recommendation(.cardio), "Cardio")]
  }

  static func recommendation(_ focus: TrainingFocus) -> TrainingConfiguration {
    let intent = TrainingConfiguration()
    intent.focus = focus
    return intent
  }
}

struct BodyConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Body" }
  static var description: IntentDescription {
    IntentDescription("Weight, sleep and the daily score — pick what leads.")
  }

  @Parameter(title: "Show", default: .weight)
  var focus: BodyFocus

  var scope: HelixScope { .body }
  var helixFocus: HelixFocus { .body(focus) }

  static var galleryOptions: [(intent: BodyConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.weight), "Weight"),
     (recommendation(.sleep), "Sleep"),
     (recommendation(.wellbeing), "Well-being"),
     (recommendation(.composition), "Composition")]
  }

  static func recommendation(_ focus: BodyFocus) -> BodyConfiguration {
    let intent = BodyConfiguration()
    intent.focus = focus
    return intent
  }
}

struct VitalsConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Vitals" }
  static var description: IntentDescription {
    IntentDescription("HRV, resting heart rate, temperature, blood oxygen and breathing.")
  }

  @Parameter(title: "Show", default: .panel)
  var focus: VitalsFocus

  /// The lifestyle slice — `vitals` ships there, alongside the steps and sleep
  /// blocks the panel's floor row reads. Nothing here needs a calendar, a
  /// ledger or a set history.
  var scope: HelixScope { .lifestyle }
  var helixFocus: HelixFocus { .vitals(focus) }

  static var galleryOptions: [(intent: VitalsConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.panel), "Panel"),
     (recommendation(.recovery), "Recovery"),
     (recommendation(.respiration), "Breathing"),
     (recommendation(.temperature), "Temperature")]
  }

  static func recommendation(_ focus: VitalsFocus) -> VitalsConfiguration {
    let intent = VitalsConfiguration()
    intent.focus = focus
    return intent
  }
}

struct LockConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Lock" }
  static var description: IntentDescription {
    IntentDescription("One fact on the Lock Screen: battery, calories, steps or today's session.")
  }

  @Parameter(title: "Show", default: .battery)
  var focus: LockFocus

  /// The lifestyle slice covers all four accessory faces — none of them needs a
  /// calendar, a ledger or a trend.
  var scope: HelixScope { .lifestyle }
  var helixFocus: HelixFocus { .lock(focus) }

  static var galleryOptions: [(intent: LockConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.battery), "Battery"),
     (recommendation(.calories), "Calories"),
     (recommendation(.steps), "Steps"),
     (recommendation(.workout), "Workout")]
  }

  static func recommendation(_ focus: LockFocus) -> LockConfiguration {
    let intent = LockConfiguration()
    intent.focus = focus
    return intent
  }
}
