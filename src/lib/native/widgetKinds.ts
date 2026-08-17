/**
 * Every widget kind this app ships. One list, checked against Swift by a test.
 *
 * ── WHY THIS EXISTS RATHER THAN A HARDCODED ARRAY AT EACH CALL SITE ──────────
 * `HelixWidgetBridge.swift` used to reload ALL timelines and argued for it:
 * *"enumerating that list here would be a second place to forget a widget"*.
 * That objection is correct about hand-kept lists and wrong about the
 * conclusion. WidgetKit budgets reloads PER KIND, so a blanket reload spends the
 * Training widget's daily allowance every time a glass of water is logged — and
 * then throttles Training at the moment a session actually commits, which is the
 * one moment it had to be fresh.
 *
 * So the list stays, and `widget-kind-parity.test.ts` asserts set equality with
 * the `kind:` strings in `HelixWidgets.swift` in BOTH directions. Adding a Swift
 * widget without registering it here fails the suite; registering one that does
 * not exist fails it too. Same mechanism that keeps `DAY_COLOR` honest across
 * the same boundary.
 */
export const WIDGET_KINDS = [
  'HelixFuelFamily',
  'HelixTrainingFamily',
  'HelixBodyFamily',
  'HelixLockFamily',
  'HelixDailyFamily',
] as const

export type WidgetKind = (typeof WIDGET_KINDS)[number]

/**
 * The kinds a change to nutrition, hydration or the day's score can move.
 *
 * Everything except Training. Water, macros and a weigh-in all shift the score
 * and the battery — which Fuel, Lock and Daily all render — but none of them
 * touches the calendar, the streak or today's logged session, which is all
 * Training draws.
 */
export const DAY_KINDS: readonly WidgetKind[] = [
  'HelixFuelFamily', 'HelixBodyFamily', 'HelixLockFamily', 'HelixDailyFamily',
]
