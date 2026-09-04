import AppIntents
import WidgetKit
import HelixCore
import HelixUI

// MARK: - Five families, one picker each
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

// MARK: - Focus pickers
//
// ── WHY THESE ARE NOT THE HelixUI ENUMS ─────────────────────────────────────
// The tiles' focus enums (`FuelFocus` …) live in HelixUI so a view can name its
// face without importing AppIntents. `AppEnum` cannot be added to them from
// here: the AppIntents metadata extractor that runs at build time refuses an
// enum "implemented in an imported framework or library". So the picker has
// its own one-line enum per family, same raw values, and `focus` bridges. The
// display strings are the only thing that lives here.

enum FuelFocusOption: String, AppEnum {
  case calories, macros, water

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Focus"
  static let caseDisplayRepresentations: [FuelFocusOption: DisplayRepresentation] = [
    .calories: DisplayRepresentation(title: "Calories", subtitle: "What is left against the goal"),
    .macros:   DisplayRepresentation(title: "Macros", subtitle: "Protein, carbs and fat against their targets"),
    .water:    DisplayRepresentation(title: "Water", subtitle: "Hydration, steps and the battery"),
  ]

  /// The tile's own enum. Same raw values by construction; a case added on one
  /// side without the other is a crash here, on the first render, loudly.
  var focus: FuelFocus { FuelFocus(rawValue: rawValue)! }
}

enum TrainingFocusOption: String, AppEnum {
  case today, calendar, volume, streak, records, oneRepMax, cardio

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Focus"
  static let caseDisplayRepresentations: [TrainingFocusOption: DisplayRepresentation] = [
    .today:     DisplayRepresentation(title: "Today", subtitle: "The session due, or the one you finished"),
    .calendar:  DisplayRepresentation(title: "Calendar", subtitle: "Six weeks of scheduled against logged"),
    .volume:    DisplayRepresentation(title: "Volume", subtitle: "This week's tonnage against last"),
    .streak:    DisplayRepresentation(title: "Program Day", subtitle: "Days elapsed since the cut began"),
    .records:   DisplayRepresentation(title: "Records", subtitle: "The most recent personal records"),
    .oneRepMax: DisplayRepresentation(title: "Estimated 1RM", subtitle: "Where the main lifts are trending"),
    .cardio:    DisplayRepresentation(title: "Cardio", subtitle: "The last session, and the week's Zone 2"),
  ]

  /// The tile's own enum. Same raw values by construction; a case added on one
  /// side without the other is a crash here, on the first render, loudly.
  var focus: TrainingFocus { TrainingFocus(rawValue: rawValue)! }
}

enum BodyFocusOption: String, AppEnum {
  case weight, sleep, wellbeing, composition

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Focus"
  static let caseDisplayRepresentations: [BodyFocusOption: DisplayRepresentation] = [
    .weight:    DisplayRepresentation(title: "Weight", subtitle: "The latest weigh-in and the fortnight trend"),
    .sleep:     DisplayRepresentation(title: "Sleep", subtitle: "Duration and the stage breakdown"),
    .wellbeing: DisplayRepresentation(title: "Well-being", subtitle: "The daily score, its parts, and today's verdict"),
    // "Composition", not "muscle": this face shows three different measurements
    // and one of them is called muscle. See HelixLifestyle's Weight header.
    .composition: DisplayRepresentation(title: "Composition", subtitle: "Body fat, lean tissue and fat-free mass"),
  ]

  /// The tile's own enum. Same raw values by construction; a case added on one
  /// side without the other is a crash here, on the first render, loudly.
  var focus: BodyFocus { BodyFocus(rawValue: rawValue)! }
}

enum VitalsFocusOption: String, AppEnum {
  case panel, recovery, respiration, temperature

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static let caseDisplayRepresentations: [VitalsFocusOption: DisplayRepresentation] = [
    .panel:       DisplayRepresentation(title: "Panel", subtitle: "Every overnight reading against your normal"),
    .recovery:    DisplayRepresentation(title: "Recovery", subtitle: "HRV and resting heart rate"),
    .respiration: DisplayRepresentation(title: "Breathing", subtitle: "Blood oxygen and respiratory rate"),
    .temperature: DisplayRepresentation(title: "Temperature", subtitle: "Wrist temperature against your baseline"),
  ]

  /// The tile's own enum. Same raw values by construction; a case added on one
  /// side without the other is a crash here, on the first render, loudly.
  var focus: VitalsFocus { VitalsFocus(rawValue: rawValue)! }
}

enum LockFocusOption: String, AppEnum {
  case battery, calories, steps, workout

  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Show"
  static let caseDisplayRepresentations: [LockFocusOption: DisplayRepresentation] = [
    .battery:  DisplayRepresentation(title: "Battery", subtitle: "Recovery battery as a gauge"),
    .calories: DisplayRepresentation(title: "Calories", subtitle: "Calories left today"),
    .steps:    DisplayRepresentation(title: "Steps", subtitle: "Steps against the goal"),
    .workout:  DisplayRepresentation(title: "Workout", subtitle: "Today's session, or rest"),
  ]

  /// The tile's own enum. Same raw values by construction; a case added on one
  /// side without the other is a crash here, on the first render, loudly.
  var focus: LockFocus { LockFocus(rawValue: rawValue)! }
}

// MARK: - Configurations

struct FuelConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Fuel" }
  static var description: IntentDescription {
    IntentDescription("Calories, macros and hydration — pick what leads.")
  }

  @Parameter(title: "Show", default: .calories)
  var focus: FuelFocusOption

  /// The payload slice this widget needs. Most of the contract exists for the
  /// other families, and an extension pays for every field in decode time and
  /// resident memory against a hard cap.
  var scope: HelixScope { .lifestyle }
  var helixFocus: HelixFocus { .fuel(focus.focus) }

  static var galleryOptions: [(intent: FuelConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.calories), "Calories"),
     (recommendation(.macros), "Macros"),
     (recommendation(.water), "Water")]
  }

  static func recommendation(_ focus: FuelFocusOption) -> FuelConfiguration {
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
  var focus: TrainingFocusOption

  var scope: HelixScope { focus.focus.scope }
  var helixFocus: HelixFocus { .training(focus.focus) }

  static var galleryOptions: [(intent: TrainingConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.today), "Today"),
     (recommendation(.calendar), "Calendar"),
     (recommendation(.volume), "Volume"),
     (recommendation(.streak), "Program Day"),
     (recommendation(.records), "Records"),
     (recommendation(.oneRepMax), "Estimated 1RM"),
     (recommendation(.cardio), "Cardio")]
  }

  static func recommendation(_ focus: TrainingFocusOption) -> TrainingConfiguration {
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
  var focus: BodyFocusOption

  var scope: HelixScope { .body }
  var helixFocus: HelixFocus { .body(focus.focus) }

  static var galleryOptions: [(intent: BodyConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.weight), "Weight"),
     (recommendation(.sleep), "Sleep"),
     (recommendation(.wellbeing), "Well-being"),
     (recommendation(.composition), "Composition")]
  }

  static func recommendation(_ focus: BodyFocusOption) -> BodyConfiguration {
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
  var focus: VitalsFocusOption

  /// The lifestyle slice — `vitals` ships there, alongside the steps and sleep
  /// blocks the panel's floor row reads. Nothing here needs a calendar, a
  /// ledger or a set history.
  var scope: HelixScope { .lifestyle }
  var helixFocus: HelixFocus { .vitals(focus.focus) }

  static var galleryOptions: [(intent: VitalsConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.panel), "Panel"),
     (recommendation(.recovery), "Recovery"),
     (recommendation(.respiration), "Breathing"),
     (recommendation(.temperature), "Temperature")]
  }

  static func recommendation(_ focus: VitalsFocusOption) -> VitalsConfiguration {
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
  var focus: LockFocusOption

  /// The lifestyle slice covers all four accessory faces — none of them needs a
  /// calendar, a ledger or a trend.
  var scope: HelixScope { .lifestyle }
  var helixFocus: HelixFocus { .lock(focus.focus) }

  static var galleryOptions: [(intent: LockConfiguration, title: LocalizedStringResource)] {
    [(recommendation(.battery), "Battery"),
     (recommendation(.calories), "Calories"),
     (recommendation(.steps), "Steps"),
     (recommendation(.workout), "Workout")]
  }

  static func recommendation(_ focus: LockFocusOption) -> LockConfiguration {
    let intent = LockConfiguration()
    intent.focus = focus
    return intent
  }
}

struct DailyConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Daily" }
  static var description: IntentDescription {
    IntentDescription("Fuel, water, steps and training — the whole day at once.")
  }

  /// No focus picker: the point of this widget is that it does not make you
  /// choose. `HelixScoped` still needs an answer, so it names the one it draws.
  var scope: HelixScope { .full }
  var helixFocus: HelixFocus { .training(.today) }

  static var galleryOptions: [(intent: DailyConfiguration, title: LocalizedStringResource)] {
    [(DailyConfiguration(), "Daily")]
  }
}

