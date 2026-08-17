import WidgetKit
import SwiftUI

// MARK: - Composition
//
// A fourth `BodyFocus` rather than a new widget kind: composition is a body
// question and the Body picker is where a user would look for it.
//
// ── WHAT THIS ADDS THAT THE WEIGHT FACES DID NOT ─────────────────────────────
// `WeightLargeFace` already lists composition — as rows UNDER the scale weight,
// which makes body fat a footnote to a number that moves for reasons that have
// nothing to do with it (water, salt, the hour of the day). This face leads with
// the fat percentage, because on a cut that is the figure the scale is a proxy
// FOR. Same data, opposite emphasis, which is exactly what a focus picker is for.
//
// ── THREE MEASUREMENTS, NEVER INTERCHANGEABLE ────────────────────────────────
// `smmKg` is SKELETAL MUSCLE (~27 kg, entered by hand off the InBody and never
// derived). `muscleKg` is LEAN SOFT TISSUE (~50 kg) and is LABELLED as such —
// calling it "muscle" beside a 27 puts two numbers for one word on a single
// face, twenty kilos apart. `ffmKg` is FAT-FREE MASS (~53 kg). Each appears
// under its own name or not at all.
//
// ── AND DOWN IS NOT ALWAYS GOOD ──────────────────────────────────────────────
// Falling body fat is progress; falling lean tissue is the thing a cut is trying
// to avoid. `upIsGood` is set per metric and never inferred from the sign, which
// is the rule `deltaVerdict` enforces on the web side.
//
// The muscle ATLAS figure is deliberately absent: `src/lib/body/atlas.ts` does
// not exist yet (it is Wave C), and the Swift generator reads from it. This face
// ships the numbers; the figure lands when the atlas does.

/// Small · body fat, its movement, and the fortnight behind it.
struct CompositionFocusFace: View {
  let entry: HelixEntry
  let mono: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var b: HelixSnapshot.Body? { s?.body }
  private var accent: Color { mono ? .white : Helix.gold }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 4) {
        Caption("BODY FAT", color: accent)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
      }

      HStack(alignment: .firstTextBaseline, spacing: 4) {
        BigValue(value: b?.fatPct.map { String(format: "%.1f", $0) }, size: 30, color: .white)
        Text("%").font(.system(size: 12)).foregroundStyle(Helix.muted)
        Spacer(minLength: 0)
        // Down is good here, and only here on this face.
        DeltaChip(delta: b?.fatPctDelta, decimals: 1, upIsGood: false, monochrome: mono)
      }

      if let measured = HelixSnapshot.relativeDay(s?.weight.measuredOn) {
        Text("measured \(measured)")
          .font(.system(size: 10)).foregroundStyle(Helix.muted).lineLimit(1)
      }

      Spacer(minLength: 0)

      if let trend = b?.fatTrend, trend.count > 1 {
        // Banded, not zero-based: body fat lives in a narrow range and a
        // zero-based axis draws a fortnight of real movement as a flat line.
        Sparkline(points: trend.map(\.v), color: accent)
          .frame(height: 26)
      }
    }
  }
}

/// Medium and Large · the fat percentage, then what the rest of the body is
/// made of, each figure under its own name.
struct CompositionFace: View {
  let entry: HelixEntry
  let mono: Bool
  let large: Bool

  private var s: HelixSnapshot? { entry.snapshot }
  private var b: HelixSnapshot.Body? { s?.body }
  private var accent: Color { mono ? .white : Helix.gold }

  var body: some View {
    VStack(alignment: .leading, spacing: large ? 10 : 8) {
      HStack(spacing: 5) {
        Caption("COMPOSITION", color: accent)
        Spacer(minLength: 0)
        if entry.isStale { StaleTag(age: entry.age) }
        HelixBrand(monochrome: mono, size: large ? 13 : 12)
      }

      HStack(alignment: .firstTextBaseline, spacing: 6) {
        BigValue(value: b?.fatPct.map { String(format: "%.1f", $0) },
                 size: large ? 38 : 30, color: .white)
        Text("% fat").font(.system(size: large ? 13 : 11)).foregroundStyle(Helix.muted)
        Spacer(minLength: 0)
        DeltaChip(delta: b?.fatPctDelta, decimals: 1, upIsGood: false, monochrome: mono)
      }

      Hairline()

      // ── THE FIGURE, ON THE LARGE FACE ──
      // Filled EVENLY, and that is the honest rendering: the scale measures
      // composition for the whole body and reports nothing per muscle, so a
      // figure with individually tinted bellies would be inventing a
      // distribution nobody measured. What it does carry is scale — 46% lean
      // tissue drawn on a body reads as a proportion in a way "46.2 kg" never
      // will on a 2×2 tile.
      HStack(alignment: .top, spacing: 10) {
        if large, let lean = b?.muscleKg, let weight = s?.weight.kg, weight > 0 {
          HelixAtlasFigure(
            side: .both,
            worked: HelixAtlasFigure.uniform(min(max(lean / weight, 0), 1)),
            color: Helix.emerald,
            monochrome: mono)
            .frame(width: 78, height: 104)
        }

      VStack(spacing: large ? 7 : 5) {
        // "Lean Soft Tissue", never "muscle" — see the header. Up IS good for
        // all three of these, and that is a statement about the metric, not
        // about the sign of the number.
        CompositionRow(label: "LEAN SOFT TISSUE", value: b?.muscleKg, delta: b?.muscleKgDelta,
                       unit: "kg", color: mono ? .white : Helix.emerald, mono: mono,
                       upIsGood: true, compact: !large)
        CompositionRow(label: "SKELETAL MUSCLE", value: b?.smmKg, delta: b?.smmKgDelta,
                       unit: "kg", color: mono ? .white : Helix.sapphire, mono: mono,
                       upIsGood: true, compact: !large)
        CompositionRow(label: "FAT-FREE MASS", value: b?.ffmKg, delta: b?.ffmKgDelta,
                       unit: "kg", color: mono ? .white : Helix.steel, mono: mono,
                       upIsGood: true, compact: !large)
      }
      }

      if large {
        Spacer(minLength: 0)
        Hairline()

        Register(title: "FOURTEEN DAYS", accent: mono ? .white : accent) {
          if let trend = b?.fatTrend, trend.count > 1 {
            Sparkline(points: trend.map(\.v), color: accent)
              .frame(maxHeight: .infinity)
          } else {
            // Two readings are the minimum for a line to mean anything. One is
            // a dot, and a dot drawn as a trend is a claim about a shape that
            // does not exist.
            Text("not enough readings for a trend")
              .font(.system(size: 10)).foregroundStyle(Helix.muted)
          }
        }
        .frame(maxHeight: .infinity)

        Hairline()

        HStack(spacing: 0) {
          Stat(value: s?.weight.kg.map { String(format: "%.1f", $0) }, label: "WEIGHT", color: .white)
          Stat(value: s?.weight.targetKg.map { String(format: "%.1f", $0) }, label: "TARGET",
               color: mono ? .white : Helix.steel)
          Stat(value: HelixSnapshot.relativeDay(s?.weight.measuredOn), label: "MEASURED",
               color: Helix.muted)
        }
      } else {
        Spacer(minLength: 0)
      }
    }
  }
}
