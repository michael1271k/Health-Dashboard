import AppIntents
import WidgetKit

// MARK: - Configuration
//
// ── WHY THE TWO NEW WIDGETS ARE CONFIGURABLE AND THE FIVE OLD ONES ARE NOT ───
// The original five each answer exactly one question, and a picker on a widget
// that has one thing to say is a setting nobody opens. The composites are the
// opposite: Lifestyle has four legitimate headlines and Performance has four,
// and hard-coding a favourite would mean shipping eight widgets instead of two.
//
// The focus does real work — it selects the hero of the Small and Medium faces
// AND switches the Medium LAYOUT, because "how much did I sleep" and "what does
// my weight look like" are not the same shape of question. Large stays
// layout-fixed: a Large already shows everything, so the picker only reorders
// emphasis there.
//
// These are `AppEnum`, not `AppEntity`. An entity is for a queryable collection
// with identity; this is four fixed choices and the picker should be a plain
// list, which is what an enum gets you for free.

enum LifestyleFocus: String, AppEnum {
  case calories, steps, sleep, weight

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Focus" }
  static var caseDisplayRepresentations: [LifestyleFocus: DisplayRepresentation] = [
    .calories: DisplayRepresentation(title: "Fuel", subtitle: "Calories, protein and water"),
    .steps:    DisplayRepresentation(title: "Movement", subtitle: "Steps, distance and active energy"),
    .sleep:    DisplayRepresentation(title: "Sleep", subtitle: "Duration and stage breakdown"),
    .weight:   DisplayRepresentation(title: "Weight", subtitle: "Latest weigh-in and the fortnight trend"),
  ]

  /// Where a tap on this face should land.
  var link: URL? {
    switch self {
    case .calories: return HelixLink.nutrition
    case .steps, .sleep, .weight: return HelixLink.progress
    }
  }
}

enum PerformanceFocus: String, AppEnum {
  case records, heaviest, oneRepMax, volume

  static var typeDisplayRepresentation: TypeDisplayRepresentation { "Focus" }
  static var caseDisplayRepresentations: [PerformanceFocus: DisplayRepresentation] = [
    .records:   DisplayRepresentation(title: "Records", subtitle: "The most recent personal records"),
    .heaviest:  DisplayRepresentation(title: "Heaviest", subtitle: "The heaviest lift of the week"),
    .oneRepMax: DisplayRepresentation(title: "Estimated 1RM", subtitle: "Where the main lifts are trending"),
    .volume:    DisplayRepresentation(title: "Volume", subtitle: "This week's tonnage against last week"),
  ]

  var link: URL? {
    switch self {
    case .records, .heaviest, .oneRepMax: return HelixLink.exercises
    case .volume: return HelixLink.reports
    }
  }
}

struct LifestyleConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Lifestyle" }
  static var description: IntentDescription {
    IntentDescription("Fuel, movement, sleep and weight — pick what leads.")
  }

  @Parameter(title: "Show", default: .calories)
  var focus: LifestyleFocus

  /// The payload slice this widget needs. Half the fields exist for the other
  /// composite, and an extension pays for every one of them in decode time and
  /// resident memory.
  var scope: HelixScope { .lifestyle }
  var helixFocus: HelixFocus { .lifestyle(focus) }
}

struct PerformanceConfiguration: WidgetConfigurationIntent, HelixScoped {
  static var title: LocalizedStringResource { "Helix Performance" }
  static var description: IntentDescription {
    IntentDescription("Records, estimated 1RM and the training week — pick what leads.")
  }

  @Parameter(title: "Show", default: .records)
  var focus: PerformanceFocus

  var scope: HelixScope { .performance }
  var helixFocus: HelixFocus { .performance(focus) }
}

// MARK: - Gallery recommendations
//
// Without these the widget gallery shows one tile per KIND, so both composites
// preview as a single generic face and the four focuses are invisible until
// after you have placed one and gone looking for "Edit Widget". One entry per
// focus makes the choice visible at the moment it is being made.

extension LifestyleConfiguration {
  static func recommendation(_ focus: LifestyleFocus) -> LifestyleConfiguration {
    let intent = LifestyleConfiguration()
    intent.focus = focus
    return intent
  }
}

extension PerformanceConfiguration {
  static func recommendation(_ focus: PerformanceFocus) -> PerformanceConfiguration {
    let intent = PerformanceConfiguration()
    intent.focus = focus
    return intent
  }
}
