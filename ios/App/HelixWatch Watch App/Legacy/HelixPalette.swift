import SwiftUI

// MARK: - Palette
//
// Mirrors src/lib/theme/palette.ts and src/lib/theme/muscleHue.ts. Helix has no
// light theme — the app is obsidian on every surface — so
// `WidgetBackground.colorset` carries one universal colour rather than a
// light/dark pair. A light-mode widget would be the only pale Helix surface in
// existence and would read as broken sitting beside the app it opens. iOS 18's
// TINTED mode is handled instead, properly: see `widgetRenderingMode`.

enum Helix {
  static let ember    = Color(hex: 0xE0703C)
  static let sapphire = Color(hex: 0x3D7AB8)
  static let emerald  = Color(hex: 0x3E9E7A)
  // The deep steps of the ember and sapphire ramps. They exist here because a
  // routine day's A/B variant is a step on its family's ramp — see `day` below.
  static let emberDeep    = Color(hex: 0xB4522A)
  static let sapphireDeep = Color(hex: 0x2E5C8A)
  /// A prescribed rest day. Mirrors `REST` in palette.ts: deliberately
  /// desaturated, because rest is the absence of a family hue and must not
  /// compete with one.
  static let rest     = Color(hex: 0x3E4757)
  static let gold     = Color(hex: 0xD4AF37)
  static let oxide    = Color(hex: 0xC4514E)
  static let steel    = Color(hex: 0x8E9AAC)
  static let amethyst = Color(hex: 0x8A6FA8)
  static let copper   = Color(hex: 0xC97A45)
  // Was `Color(white: 0.55)` = #8C8C8C, a neutral grey where the palette's MUTED
  // is #79808C — slightly cool, because every other Helix surface is. Fifteen
  // units of blue is not much on its own and is very obvious sitting next to the
  // app.
  static let muted    = Color(hex: 0x79808C)
  static let background = Color("WidgetBackground")

  /// The six muscle families, in the hues the app now uses everywhere.
  ///
  /// GOLD is deliberately absent. `WEEK_STATE.pr` reserves it app-wide — gold
  /// means a personal record and nothing else — and Shoulders used to hold it,
  /// which is why the record register below can finally be the only gold thing
  /// on the widget.
  static func family(_ name: String) -> Color {
    switch name {
    case "Chest":     return ember
    case "Back":      return emerald
    case "Shoulders": return amethyst
    case "Arms":      return copper
    case "Legs":      return sapphire
    case "Core":      return steel
    default:          return steel
    }
  }

  /// The sleep-stage ramp, deep → awake. Verbatim from `SLEEP` in palette.ts:
  /// indigo floor, sapphire bulk, cyan nearer the surface, warm sand for the
  /// interruption. The Watch app carried a THIRD palette whose `amethyst`
  /// #8E7CFE matched nothing in Helix and whose stage colours contradicted this
  /// ramp — three sources of truth for one gradient.
  enum SleepStage: CaseIterable {
    case deep, core, rem, awake
    var color: Color {
      switch self {
      case .deep:  return Color(hex: 0x4C3F82)
      case .core:  return Color(hex: 0x3D7AB8)
      case .rem:   return Color(hex: 0x5FA8C7)
      case .awake: return Color(hex: 0xC98A5E)
      }
    }
    var label: String {
      switch self {
      case .deep: return "DEEP"
      case .core: return "CORE"
      case .rem: return "REM"
      case .awake: return "AWAKE"
      }
    }
  }

  /// The colour of a ROUTINE DAY, mirroring `DAY_COLOR` in palette.ts.
  ///
  /// Every training surface in the app is tinted by which session it is, so the
  /// widget calendar and the Today face have to read from the same table or the
  /// two disagree about what colour Thursday is.
  ///
  /// ── A DAY WEARS THE HUE OF WHAT IT TRAINS ─────────────────────────────────
  /// A day takes its dominant muscle family's colour (see `family` above), and
  /// its A/B variant is a STEP on that family's ramp: A on the base, B on the
  /// deep. Upper A and Upper B are the Chest ramp; Legs & Core A and B are the
  /// Legs ramp; Delts & Arms is Shoulders.
  ///
  /// This replaces five tones picked for contrast alone, under which Legs & Core
  /// B was emerald — the BACK family — and Upper B was gold, the record colour
  /// this file's `family` comment already says is reserved. Both reservations
  /// now hold: gold means a personal record, steel means the neutral substrate.
  ///
  /// `src/tests/day-color-parity.test.ts` fails if a key is added on the web
  /// side without appearing here, or if a value disagrees — which is the only
  /// thing keeping two hand-kept copies of one table honest.
  static func day(_ dayKey: String?) -> Color {
    switch dayKey {
    // Helix-5 (active)
    case "cb_a":         return ember
    case "legs_a":       return sapphire
    case "arms":         return amethyst
    case "cb_b":         return emberDeep
    case "legs_b":       return sapphireDeep
    // Helix-4 (drawer) — mirrors its Helix-5 counterpart
    case "upper_a":      return ember
    case "lower_a":      return sapphire
    case "upper_b":      return emberDeep
    case "lower_b":      return sapphireDeep
    // PPL legacy — the split colours, since the day IS the split
    case "ppl_push_sun": return ember
    case "ppl_push_thu": return ember
    case "ppl_pull_mon": return emerald
    case "ppl_pull_fri": return emerald
    case "ppl_legs_tue": return sapphire
    default:             return steel
    }
  }

  /// Battery banding — the one place a traffic light is the right metaphor,
  /// because the number genuinely is a fuel gauge.
  static func battery(_ pct: Int?) -> Color {
    guard let pct else { return muted }
    return pct >= 60 ? emerald : pct >= 30 ? gold : oxide
  }

  /// Colour for a delta where UP is the good direction (volume, 1RM, sessions).
  /// Neutral at zero — a grey "no change" is information, a green one is not.
  static func rise(_ delta: Double?) -> Color {
    guard let delta, abs(delta) > 0.0001 else { return muted }
    return delta > 0 ? emerald : oxide
  }
}

extension Color {
  /// `"#3E9E7A"` → a colour, or nil.
  ///
  /// For colours that arrive in the PAYLOAD rather than the palette — the
  /// readiness verdict carries the exact hex the app paints it with, and
  /// re-deriving it here from the level string is how the two surfaces come to
  /// disagree about what "compromised" looks like. Nil rather than a fallback:
  /// the caller decides what an unparseable colour becomes.
  init?(hexString: String?) {
    guard var raw = hexString?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else { return nil }
    if raw.hasPrefix("#") { raw.removeFirst() }
    guard raw.count == 6, let value = UInt32(raw, radix: 16) else { return nil }
    self.init(hex: value)
  }

  /// `0xE0703C` → a colour. Hex literals are how the palette is written on the
  /// web side, so keeping the same notation makes the two diffable by eye.
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red:   Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue:  Double(hex & 0xFF) / 255,
      opacity: 1
    )
  }
}

// MARK: - Deep links
//
// ── WHY A WIDGET THAT OPENS THE HOME SCREEN IS A BROKEN WIDGET ───────────────
// A widget is a shortcut with a preview attached. Tapping the calorie ring and
// landing on the dashboard means the tap cost you a navigation instead of saving
// you one, and the surface stops being worth its slot. Every face below names a
// destination, and sub-regions of the Medium and Large faces name their own.
//
// The scheme is registered in App/Info.plist (`CFBundleURLTypes`). AppDelegate
// hands the URL to Capacitor's ApplicationDelegateProxy, which emits
// `appUrlOpen`; `src/lib/native/deepLink.ts` turns it into a router push.

enum HelixLink {
  /// The app is a remote-loaded webview, so the destination is a PATH, carried
  /// as a query parameter rather than a host — `helix://nutrition` would make
  /// "nutrition" a host and lose everything after the first slash.
  static func path(_ path: String) -> URL? {
    var c = URLComponents()
    c.scheme = "helix"
    c.host = "open"
    c.queryItems = [URLQueryItem(name: "path", value: path)]
    return c.url
  }

  static let home      = path("/")
  static let nutrition = path("/nutrition")
  static let micros    = path("/nutrition/micros")
  /// "Progress" — vitals, sleep, weight and the body trends all live here.
  static let progress  = path("/pathfinder")
  static let workout   = path("/workout")
  static let exercises = path("/workout/exercises")
  static let reports   = path("/reports")

  /// One day, optionally with a drawer already open.
  ///
  /// ── WHY THE TAP HAS TO LAND ON THE THING YOU TAPPED ──────────────────────
  /// Every face used to point at a tab root: the sleep face opened Progress and
  /// left you to find last night, the water face opened Nutrition and left you
  /// to find hydration. That is a shortcut that costs a navigation instead of
  /// saving one. `section` names the drawer, and the day page validates it
  /// against `DAY_SECTIONS` — an unknown one opens the day with nothing open
  /// rather than guessing.
  ///
  /// ── AND WHY THE DATE IS PASSED IN ────────────────────────────────────────
  /// Always from `snapshot.date`, never from `Date()` in the extension. The
  /// payload's date is the user's LOGICAL day, resolved server-side in their own
  /// timezone; an extension deciding for itself would open the wrong day for
  /// anyone whose logical day and calendar day differ — which is most people,
  /// for part of every day.
  static func day(_ iso: String, section: String? = nil) -> URL? {
    guard !iso.isEmpty else { return nil }
    return path(section.map { "/day/\(iso)?section=\($0)" } ?? "/day/\(iso)")
  }
}
