# HELIX Native — Wave 1 foundation

A second, parallel iOS app. It installs **alongside** the Capacitor app rather
than over it (`app.helix.health.michael.native` vs `app.helix.health.michael`),
reads the same Supabase, and is built screen by screen while the web app stays
your daily driver. Nothing about this migration requires a day where neither app
works.

## Layout

```
native/
├── project.yml                  XcodeGen spec — the project file is GENERATED
├── Packages/
│   ├── HelixCore/               pure domain. Foundation only. No SwiftUI, no GRDB.
│   │   └── Tests/.../Fixtures/  golden vectors, exported from the TypeScript
│   └── HelixData/               GRDB store + outbox + Keychain + Supabase session
└── HelixNative/                 the SwiftUI app target (views + entry point)
```

The split is deliberate. `HelixCore` and `HelixData` **build and test for macOS
from the command line**, so almost all of the app stays verifiable without Xcode,
a device or a signing certificate — which matters on a free Apple team, where the
app itself expires every seven days. What is left in the Xcode target is views.

`HelixData` depends on `HelixCore`. Never the other way round: the domain does not
know a database exists.

## First run

```bash
brew install xcodegen                       # once

cd native
cp HelixNative/Support/Secrets.example.xcconfig HelixNative/Support/Secrets.xcconfig
$EDITOR HelixNative/Support/Secrets.xcconfig   # fill in URL + anon key
xcodegen generate
open HelixNative.xcodeproj
```

In Xcode: select your iPhone, then Product → Run.

> **The URL in `Secrets.xcconfig` has no `https://`.** An xcconfig treats `//` as
> the start of a comment, so the scheme truncates the value. Store the host only;
> `SupabaseConfig.fromBundle` glues the scheme back on.

If the app launches to "HELIX could not start", the message names the missing
setting. That screen exists because forgetting to copy the xcconfig is the one
mistake everybody makes, and a `fatalError` would tell you nothing.

## Verifying without Xcode

```bash
npm run swift:core     # domain: golden vectors + invariants
npm run swift:data     # store: migrations, outbox, Keychain
npm run golden         # regenerate the golden vectors from the TypeScript
npm test               # includes the golden-vector staleness check
```

> **Use the npm scripts, not a bare `swift test`.** They pass `--scratch-path`
> into `~/Library/Caches/helix-swift/`, which keeps SwiftPM's `.build` directory
> out of the repository. Left in place it is ~2 GB of vendored dependency source
> that `graphify update .` walks and indexes: it once made **74 % of the code
> graph** GRDB and supabase-swift internals, and a query for the workout logger
> answered with a Supabase example project.

## The golden vectors

This is the risk control that makes the whole migration safe, and it is the
reason the domain port is trustworthy at all.

`src/tests/golden-vectors.test.ts` runs the **shipping TypeScript** over a fixed
set of inputs and writes `{ input, expected }` pairs into
`Packages/HelixCore/Tests/HelixCoreTests/Fixtures/`. `swift test` replays every
one of them against the Swift port. Currently **1,849 cases** across Epley, TEF,
TDEE, the whole battery model and readiness.

Two rules:

1. **The TypeScript is the definition of correct.** Swift has to agree with it,
   case by case, or the build fails.
2. **`npm test` fails if the fixtures are stale.** Change a formula in `src/lib`
   without running `npm run golden` and the suite tells you. Regenerating is a
   deliberate act, and the diff is the list of behaviours the port must now match.

This exists because the arithmetic here breaks *silently*. A formula that is 3%
wrong renders a number nobody questions. Every entry in the repo's history of
this — the unloaded-work `weight === 0` blind spot that printed "1RM 0" for
months, the TDEE that omitted TEF and made every deficit ~200 kcal/day too small,
the battery v6 whose drain budget exceeded its charge budget — was invisible on
screen and would have been caught by a fixture.

**Any domain module without golden vectors does not ship.**

### Adding a module

1. Import it in `src/tests/golden-vectors.test.ts`, build a grid of cases **plus
   named regressions** taken from the module's own header comments — a grid alone
   would have missed every historical bug in this codebase, because each lived at
   a specific, unremarkable-looking input.
2. `npm run golden`.
3. Write the Swift port and a suite in `DomainGoldenTests.swift`.
4. `npm run swift:core`.

If a fixture's `input` is a partial object, emit the **full** object instead:
Swift's synthesized `Decodable` requires every non-optional key, and a fixture the
port cannot decode is a fixture that tests nothing.

### `jsRound`, and why it exists

`Math.round` rounds a half towards **positive infinity**; Swift's `rounded()`
rounds **away from zero**. They disagree on every negative half. Everything else
is bit-identical — both languages are IEEE-754 binary64 — so rounding is the one
place a shim is needed, and `Rounding.swift` is it. Use `jsRound`, never
`rounded()`, anywhere the TypeScript calls `Math.round`.

## Free-team constraints, and where they show up

Everything here is built to work without a paid Apple Developer Program, and to
gain the paid features by adding an entitlement rather than by being restructured.

| Missing | Consequence today | What changes at $99/yr |
|---|---|---|
| App Groups | The widget and Watch cannot read this app's data | The snapshot moves to a shared container; `/api/widget/snapshot` (832 loc) is deleted |
| Keychain sharing group | `KeychainAuthStorage` is private to this target | The extensions can share the session |
| TestFlight | Provisioning expires every 7 days; re-sign from Xcode | Installs stay valid; updates arrive as a notification |
| APNs `content-available` | No server-pushed background refresh | Background sync becomes possible |

## Conventions

- **Never edit `HelixNative.xcodeproj`.** Edit `project.yml` and regenerate. The
  project file is gitignored.
- **Migrations are append-only.** Never edit a registered migration; add another.
  An edited migration runs on a fresh install and not on yours.
- **Column names match Postgres exactly** (snake_case), so a row from PostgREST
  inserts locally with no translation layer. `columnNamesMatchPostgres` guards it.
- **Views read from GRDB and nowhere else.** Nothing in the UI awaits the network
  to draw.
- **`nil` is not `0`.** The domain distinguishes "absent" from "zero" in at least
  three places that have caused real bugs. Neither the store nor the port gets to
  erase that.
