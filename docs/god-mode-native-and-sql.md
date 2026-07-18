# God Mode — Native HealthKit bridge, App Icon, and Supabase SQL

Everything here is a **manual step** (Xcode / Supabase). The web app ships OTA via Netlify; these do not.

---

## 1. Custom HealthKit bridge (Capacitor 6, no npm plugin)

`@perfood/capacitor-healthkit` is removed (Cap-4 peer, breaks the build). Add this tiny in-repo plugin — it registers as **`CapacitorHealthkit`**, matching the JS proxy in `src/lib/native/healthkit.ts` (`requestAuthorization`, `queryQuantity`).

**`ios/App/App/HealthkitPlugin.swift`**
```swift
import Foundation
import Capacitor
import HealthKit

@objc(HealthkitPlugin)
public class HealthkitPlugin: CAPPlugin {
  private let store = HKHealthStore()

  @objc func requestAuthorization(_ call: CAPPluginCall) {
    guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["granted": false]); return }
    var types = Set<HKObjectType>()
    for id in (call.getArray("read", String.self) ?? []) {
      if id.hasPrefix("HKCategoryTypeIdentifier"),
         let t = HKObjectType.categoryType(forIdentifier: HKCategoryTypeIdentifier(rawValue: id)) { types.insert(t) }
      else if let t = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: id)) { types.insert(t) }
    }
    store.requestAuthorization(toShare: nil, read: types) { ok, err in call.resolve(["granted": ok && err == nil]) }
  }

  @objc func queryQuantity(_ call: CAPPluginCall) {
    guard let id = call.getString("sampleType"),
          let qType = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: id)) else {
      call.resolve(["samples": []]); return
    }
    let iso = ISO8601DateFormatter()
    let start = iso.date(from: call.getString("startDate") ?? "") ?? Date().addingTimeInterval(-86400)
    let end = iso.date(from: call.getString("endDate") ?? "") ?? Date()
    let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    let q = HKSampleQuery(sampleType: qType, predicate: pred, limit: HKObjectQueryNoLimit,
      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
      let unit = self.unit(for: qType)
      let out = (samples as? [HKQuantitySample])?.map {
        ["value": $0.quantity.doubleValue(for: unit),
         "startDate": iso.string(from: $0.startDate), "endDate": iso.string(from: $0.endDate)]
      } ?? []
      call.resolve(["samples": out])
    }
    store.execute(q)
  }

  private func unit(for t: HKQuantityType) -> HKUnit {
    switch t.identifier {
    case HKQuantityTypeIdentifier.stepCount.rawValue: return .count()
    case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue: return .kilocalorie()
    case HKQuantityTypeIdentifier.heartRateVariabilitySDNN.rawValue: return .secondUnit(with: .milli)
    case HKQuantityTypeIdentifier.restingHeartRate.rawValue, HKQuantityTypeIdentifier.heartRate.rawValue,
         HKQuantityTypeIdentifier.respiratoryRate.rawValue: return HKUnit.count().unitDivided(by: .minute())
    case HKQuantityTypeIdentifier.oxygenSaturation.rawValue,
         HKQuantityTypeIdentifier.bodyFatPercentage.rawValue: return .percent()
    case HKQuantityTypeIdentifier.bodyMass.rawValue, HKQuantityTypeIdentifier.leanBodyMass.rawValue: return .gramUnit(with: .kilo)
    case HKQuantityTypeIdentifier.vo2Max.rawValue: return HKUnit(from: "ml/kg*min")
    case HKQuantityTypeIdentifier.appleExerciseTime.rawValue, HKQuantityTypeIdentifier.appleStandTime.rawValue: return .minute()
    default: return .count()
    }
  }
}
```

**`ios/App/App/HealthkitPlugin.m`** (registers the plugin with Capacitor)
```objc
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(HealthkitPlugin, "CapacitorHealthkit",
  CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(queryQuantity, CAPPluginReturnPromise);
)
```

**`ios/App/App/Info.plist`** — add:
```xml
<key>NSHealthShareUsageDescription</key>
<string>HELIX reads Apple Health (steps, energy, heart rate, HRV, sleep, body composition) to compute your daily readiness and trends.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>HELIX does not write to Apple Health.</string>
```

**Xcode:** target → Signing & Capabilities → **+ HealthKit**. Then Product → Run. On launch, `NativeBoot → initNativeSync → requestHealthAuthorization` fires, so HELIX now appears under **Apple Health → Sharing → Apps**. (Add the two `.swift`/`.m` files to the App target when Xcode prompts.)

---

## 2. App icon — Aurora Health concept

**Concept:** a minimalist double-helix rendered as an aurora ribbon (violet `#8B5CF6` → magenta `#EC4899` → cyan `#22D3EE`) rising on an indigo-black `#0A0B1A` rounded square, soft outer glow, perfectly centered, no text.

**Generation prompt:** *"App icon, minimalist glowing double-helix DNA ribbon, smooth gradient from violet to magenta to cyan, centered on a deep indigo-black background, soft neon bloom, subtle glass depth, flat modern iOS icon, 1024×1024, no text."*

Save as `resources/icon.png` (1024²) → `npx @capacitor/assets generate --ios` → `npx cap sync ios` → Xcode **Run**. If iOS caches the old icon, delete the app on-device and reinstall.

---

## 3. Supabase SQL (paste in the SQL editor)

**Reports table (§4):**
```sql
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'weekly',
  week_start date not null,
  week_number int not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, week_start)
);
alter table reports enable row level security;
create policy "own reports" on reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Targeted performance indexes (§7):**
```sql
create index if not exists idx_daily_logs_user_date on daily_logs (user_id, date desc);
create index if not exists idx_sessions_user_started on workout_sessions (user_id, started_at desc);
create index if not exists idx_sets_session on workout_sets (session_id);
create index if not exists idx_sets_user_exercise on workout_sets (user_id, exercise_id);
create index if not exists idx_nutrition_user_date on nutrition_entries (user_id, date);
create index if not exists idx_scores_user_date on daily_scores (user_id, date);
create index if not exists idx_body_user_date on body_composition (user_id, date);
create index if not exists idx_schedule_overrides_user on schedule_overrides (user_id, date);
```

**Muscle Freshness — update existing catalog rows (§5).** New/edited exercises auto-apply the dictionary (`resolveExercises`); this fixes rows already stored:
```sql
update exercises set muscle_groups = '{quadriceps,hamstrings,glutes}'      where name ilike '%leg press%';
update exercises set muscle_groups = '{quadriceps,glutes,hamstrings}'      where name ilike '%hack%squat%' or name ilike '%smith%squat%';
update exercises set muscle_groups = '{quadriceps}'                        where name ilike '%leg extension%';
update exercises set muscle_groups = '{hamstrings,calves}'                 where name ilike '%leg curl%';
update exercises set muscle_groups = '{calves}'                            where name ilike '%calf%';
update exercises set muscle_groups = '{abdominals}'                        where name ilike '%crunch%' or name ilike '%knee raise%' or name ilike '%plank%';
update exercises set muscle_groups = '{chest,triceps,shoulders}'          where name ilike '%incline%press%';
update exercises set muscle_groups = '{lats,upper back,biceps}'           where name ilike '%neutral%grip%lat%' or name ilike '%lat pulldown%close%';
update exercises set muscle_groups = '{lats,upper back,biceps,forearms}'  where name ilike '%lat pulldown%' and name not ilike '%neutral%' and name not ilike '%close%';
update exercises set muscle_groups = '{chest,shoulders,triceps}'          where name ilike '%chest press%' or name ilike '%pec deck%' or name ilike '%butterfly%';
update exercises set muscle_groups = '{upper back,lats,traps,biceps,forearms}' where name ilike '%cable row%wide%';
update exercises set muscle_groups = '{upper back,lats,biceps,forearms}'  where name ilike '%cable row%' and name not ilike '%wide%';
update exercises set muscle_groups = '{lats,triceps}'                      where name ilike '%straight%arm%pulldown%';
update exercises set muscle_groups = '{shoulders,biceps}'                 where name ilike '%face pull%';
update exercises set muscle_groups = '{shoulders,triceps}'               where name ilike '%shoulder press%';
update exercises set muscle_groups = '{shoulders}'                        where name ilike '%lateral raise%';
update exercises set muscle_groups = '{triceps}'                          where name ilike '%triceps%' or name ilike '%pushdown%' or name ilike '%overhead%ext%';
update exercises set muscle_groups = '{biceps,forearms}'                 where name ilike '%hammer curl%' or name ilike '%reverse%curl%';
update exercises set muscle_groups = '{biceps}'                           where (name ilike '%preacher%curl%' or name ilike '%incline%curl%');
update exercises set muscle_groups = '{chest}'                            where name ilike '%crossover%' or name ilike '%cable fly%';
update exercises set muscle_groups = '{hamstrings,glutes,lower back,upper back,lats}' where name ilike '%romanian%' or name ilike '%rdl%';
update exercises set muscle_groups = '{glutes,hamstrings,quadriceps,abductors}'       where name ilike '%hip thrust%';
```
