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

  var link: URL? { HelixLink.nutrition }
}

enum TrainingFocus: String, AppEnum {
  case today, calendar, volume, streak, records, oneRepMax

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Focus" }
  static var caseDisplayRepresentations: [TrainingFocus: DisplayRepresentation] = [
    .today:     DisplayRepresentation(title: "Today", subtitle: "The session due, or the one you finished"),
    .calendar:  DisplayRepresentation(title: "Calendar", subtitle: "Six weeks of scheduled against logged"),
    .volume:    DisplayRepresentation(title: "Volume", subtitle: "This week's tonnage against last"),
    .streak:    DisplayRepresentation(title: "Streak", subtitle: "Consecutive scheduled days trained"),
    .records:   DisplayRepresentation(title: "Records", subtitle: "The most recent personal records"),
    .oneRepMax: DisplayRepresentation(title: "Estimated 1RM", subtitle: "Where the main lifts are trending"),
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
    case .records, .oneRepMax, .volume: return .performance
    case .today, .calendar, .streak:    return .training
    }
  }

  var link: URL? {
    switch self {
    case .today:               return HelixLink.workout
    case .calendar, .streak:   return HelixLink.progress
    case .volume:              return HelixLink.workout
    case .records, .oneRepMax: return HelixLink.exercises
    }
  }
}

enum BodyFocus: String, AppEnum {
  case weight, sleep, wellbeing

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Focus" }
  static var caseDisplayRepresentations: [BodyFocus: DisplayRepresentation] = [
    .weight:    DisplayRepresentation(title: "Weight", subtitle: "The latest weigh-in and the fortnight trend"),
    .sleep:     DisplayRepresentation(title: "Sleep", subtitle: "Duration and the stage breakdown"),
    .wellbeing: DisplayRepresentation(title: "Well-being", subtitle: "The daily score, its parts, and today's verdict"),
  ]

  var link: URL? { HelixLink.progress }
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

  var link: URL? {
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
     (recommendation(.streak), "Streak"),
     (recommendation(.records), "Records"),
     (recommendation(.oneRepMax), "Estimated 1RM")]
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
     (recommendation(.wellbeing), "Well-being")]
  }

  static func recommendation(_ focus: BodyFocus) -> BodyConfiguration {
    let intent = BodyConfiguration()
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
