# Security sweep — 2026-09

Phase 3 · Wave E6. Scope: the Capacitor shell under `ios/` and `capacitor.config.ts`,
the newer native app under `native/`, the branch diff for this wave (open sign-up,
`delete_my_account()`, local erase on sign-out, the demo-account seeder), and the
production dependency tree.

---

## Summary

The wave's own security posture is good and, in the two places that matter most, it is
better than the code it replaces: `delete_my_account()` is a correctly-shaped
`security definer` function (empty `search_path`, fully-qualified names, a hard
`auth.uid()` null guard, `execute` granted to `authenticated` only, no dynamic SQL),
and both clients sign out immediately after calling it. `PostgRESTRemote.deleteRow`
now pins `user_id` server-side at the one place eleven call sites route through, which
closes a real "RLS is the only thing stopping this" gap. The single serious finding is
not in that work at all: **`scripts/seed-demo-account.mjs` carries the App Review demo
account's password as a source literal, and this repository is public on GitHub** — the
production Supabase project would gain a publicly-known working login the moment that
file is pushed. Below that sit two unverifiable-by-design database risks (the delete
ordering and the `on conflict` targets were both written without being able to read
`pg_constraint`, and either can make the wave's headline features fail outright), a
missing privacy manifest and an embedded bearer token in the watch target, and six
high-severity npm advisories with no critical ones — down from seven mid-sweep, because a
concurrent `next` bump to 15.5.25 cleared all eight Next.js advisories while this report
was being written. No hardcoded key, JWT or token was
found in any tracked file. Nothing here was fixed; everything is reported.

---

## Findings

Ranked most severe first. **There are no CRITICAL findings.**

| # | Severity | Area | File:line | What | Recommended fix |
|---|----------|------|-----------|------|-----------------|
| 1 | **High** | Secrets · web/scripts | `scripts/seed-demo-account.mjs:49` | `DEMO_PASSWORD` defaults to the literal `'OnyxReview2026!'` for `appreview@onyx.fitness`. The file is currently untracked and about to be committed; `origin` is `https://github.com/michael1271k/Health-Dashboard.git`, which returns HTTP 200 unauthenticated — **the repo is public**. The Supabase project URL is already public (it ships in the web bundle and the anon key), so the literal completes a working credential pair against the production GoTrue endpoint. | Delete the default. Require `ONYX_DEMO_PASSWORD` and exit non-zero when it is absent, exactly as the script already does for `SUPABASE_SERVICE_ROLE_KEY` at lines 61–64. Rotate that account's password if the file has already been pushed. |
| 2 | Medium | Database · deletion | `docs/sql/e6-auth-deletion.sql:136-138` | The "leaves" block deletes `daily_logs` (136) **before** `daily_metrics` (137) and `daily_scores` (138), and the file's own header says the FK graph could not be read. If either child references `daily_logs` with `no action`/`restrict`, the delete raises, the whole function rolls back, and account deletion never succeeds for anyone. That is an App Store 5.1.1(v) blocker, not just a bug. | Run the §4 verify block plus a `pg_constraint` read on the live DB before shipping; or make the function order-independent with `set constraints all deferred;` as its first statement. |
| 3 | Medium | Database · sign-up | `docs/sql/e6-auth-deletion.sql:57`, `:62` | `on conflict (user_id) do nothing` requires a unique or exclusion constraint on `profiles.user_id` and `user_goals.user_id`. The header confirms `pg_constraint` was out of reach. A missing constraint raises `42P10` **inside the trigger**, which aborts the `auth.users` insert — every sign-up 500s, and the failure only appears the first time a real user tries. | Verify both constraints exist before pasting, or drop to `on conflict do nothing` (no target), which is legal with no constraint and preserves the intent. |
| 4 | Medium | iOS · privacy manifest | `ios/App/HelixWatch Watch App/` (no `PrivacyInfo.xcprivacy`) | The required-reason API check runs **per Mach-O binary** at upload. The watch app is an embedded target of the submitted project (`ios/App/App.xcodeproj/project.pbxproj:194`) and calls `UserDefaults.standard` at `Legacy/HelixSnapshot.swift:676` and `:680` — category `NSPrivacyAccessedAPICategoryUserDefaults`, reason `CA92.1`. The app target's manifest does not cover it. | Add a `PrivacyInfo.xcprivacy` to the `HelixWatch Watch App` target declaring `CA92.1`, modelled on `native/OnyxWidgets/Support/PrivacyInfo.xcprivacy`, which already documents exactly this rule. |
| 5 | Medium | Secrets · iOS binary | `ios/App/HelixWatch Watch App/Info.plist:7-8` | `HELIX_SNAPSHOT_TOKEN` is substituted from `Secrets.xcconfig` into the **built** `Info.plist`. An `Info.plist` is plaintext inside the `.ipa`/`.app`; anyone with the binary reads it. The token is a long-lived read-only bearer for one user's complete health snapshot (`/api/widget/snapshot`) with no expiry. `Secrets.example.xcconfig:19` calls this out but assumes a local-only build; the target is embedded in the App Store project. | Either exclude the watch target from the submitted build, or move the token to the Keychain, seeded once via `WCSession` from the phone, so it never lands in the bundle. If it stays, cap its lifetime and rotate it per §8.4 of `docs/APP_STORE.md`. |
| 6 | Low | Auth · session lifetime | `docs/sql/e6-auth-deletion.sql:162`; `native/Onyx/App/AppEnvironment.swift:458-461`; `src/app/delete-account/page.tsx:69` | Both clients sign out after the RPC, and the SQL comments call the risk out precisely — but a client-side `signOut()` cannot revoke an **access** token that is already minted. `auth.users` is gone, so the server-side revoke call fails silently; the JWT stays cryptographically valid until it expires. Impact is small (RLS matches no rows for a deleted uid), but a captured token remains a valid identity for the rest of its TTL. | Have the RPC (or an edge function) call GoTrue's admin sign-out for the uid before deleting the row, or accept it explicitly on the strength of a short access-token TTL. Currently accepted — see below. |
| 7 | Low | Data loss · sign-out | `native/Onyx/App/AppEnvironment.swift:494-504`, `:537-541` | Step 1 bounds the outbox drain at 5 s, then step 4 erases unconditionally — including the `outbox` table, which `AppDatabase.eraseLocalData()` does not exempt (`AppDatabase.swift:1169-1174` only exempts `sqlite_*` and `grdb_migrations`). On a slow or dead network, anything logged since the last sync is destroyed with no warning. The comment argues for the ordering but not for the silent loss. | Count the outbox before erasing and warn when it is non-empty (the `startupError` channel at `:540` already exists), or preserve the `outbox` table across the erase for the same user. |
| 8 | Low | Web · headers | No file — `Content-Security-Policy` is absent from `next.config.ts`, `netlify.toml`, `public/` and `src/` | Capsec rule WEB004. The app renders no untrusted HTML and has no `dangerouslySetInnerHTML`, so there is no live XSS path; this is defence-in-depth only. | Add a CSP header in `next.config.ts` scoped to `self` plus the Supabase origin. Not a blocker. |

Nothing was found at **Critical**. Nothing was found at **Informational** beyond the
accepted risks listed at the end.

---

## Tool: Capsec (Capacitor security scanner)

### Command run

```
$ npx capsec scan
```

### Real output

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/capsec - Not found
npm error 404
npm error 404  The requested resource 'capsec@*' could not be found or you do not have permission to access it.
```

```
$ npm ls capsec
helix-os@0.1.0 /Users/michael/Documents/PyCharmProjects/Onyx/.claude/worktrees/onyx-p3-e5-e6
└── (empty)
```

**Capsec is not installed and is not published on npm under that name.** It is neither a
project dependency nor resolvable from the registry, so the scanner could not be run.

### What was done instead

The `capacitor-security` skill's documented rule set (SEC, STO, NET, CAP, IOS, AUTH,
WEB, CRY, LOG — the Android families are not applicable, there is no `android/` tree)
was applied **by hand** over `capacitor.config.ts`, `ios/` and `native/`. Results per
family, with the evidence:

| Rule | Verdict | Evidence |
|------|---------|----------|
| SEC001 hardcoded keys | **Pass (tracked files)** | See the credential grep in section 4e. The one JWT literal on disk is in `native/Onyx/Support/Secrets.xcconfig`, which `git check-ignore` confirms is ignored via `.gitignore:106` and `git log --all` confirms was never committed. |
| SEC002 exposed `.env` | Pass | `.gitignore:26-31` covers `.env`, `.env.local` and the three environment variants. `git ls-files` lists only `.env.example`, which contains placeholders. |
| STO001/STO002/STO006 credential storage | **Pass** | `ios/App/App/SecureStore.swift` puts the Supabase session in the **Keychain**, not `UserDefaults`/`localStorage`, with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — device-only, never iCloud-synced. This is the correct answer to STO006 and it is already implemented. |
| STO003 unencrypted SQLite | Accepted | `native/` uses a plain GRDB store in the App Group. See accepted risks. |
| NET001/NET003 cleartext | **Pass** | `capacitor.config.ts` sets `server.cleartext: false` and `server.url` is `https://`. |
| NET002 certificate pinning | Not implemented | No pinning on either tree. Standard for an app talking only to its own TLS-terminated hosts; not raised as a finding. |
| NET008 secrets in URLs | **Pass** | The watch snapshot token travels in an `Authorization` header, not a query string (`HelixSnapshot.swift:605-606`). |
| CAP001 WebView debugging | **Pass** | `webContentsDebuggingEnabled` appears nowhere in `capacitor.config.ts`, `ios/` or `native/`. Grep returned no matches. |
| CAP004 insecure `allowNavigation` | **Pass** | `allowNavigation` is not set. Grep returned no matches; the only related hit repo-wide is `native/Onyx/Features/Reports/ReportWebView.swift:48`, `webView.allowsLinkPreview = false`, which is a hardening measure. |
| CAP006 `eval` with user input | Pass | No `eval` on user-controlled input in either tree. |
| CAP007 / IOS007 jailbreak detection | Not implemented | Deliberate. A single-user fitness app; see accepted risks. |
| IOS001 ATS disabled | **Pass** | `NSAllowsArbitraryLoads` appears in neither `ios/App/App/Info.plist` nor `native/Onyx/Support/Info.plist`. ATS is at its defaults. |
| IOS003 URL scheme validation | **Pass** | Both `helix://` and `onyx://` route through the `DeepLink.safePath` allow-list (`native/project.yml` comment; `src/lib/native/deepLink.ts`) rather than being dereferenced raw. |
| IOS005 insecure entitlements | **Pass** | `ios/App/App/App.entitlements` declares `com.apple.developer.healthkit` and nothing else. `native/project.yml` adds only `application-groups: [group.app.onyx.health]` and `healthkit`. No `get-task-allow`, no wildcard keychain group, no `associated-domains`. |
| WEB004 CSP missing | **Fail** | Finding 8. |
| CRY001/CRY002 weak or hardcoded crypto | **Pass** | No crypto is implemented in either tree; `ITSAppUsesNonExemptEncryption: false` is declared in both `ios/App/App/Info.plist` and `native/project.yml`, and the justification in both places (TLS + system Keychain only) matches what the code does. |
| AUTH003 weak RNG | **Pass** | The mulberry32 PRNG at `scripts/seed-demo-account.mjs:70-78` is non-cryptographic but seeds only synthetic demo data — never a token, id or password. Identifiers use `crypto.randomUUID()`. |
| AUTH006 hardcoded credentials in auth | **Fail** | Finding 1. |
| LOG001 sensitive data in logs | Accepted | `scripts/seed-demo-account.mjs:432` prints the demo credentials to stdout. Local operator script; see accepted risks. |

Additional Capacitor-specific note, not a rule violation: `capacitor.config.ts` sets
`webDir: 'public'` with `errorPath: 'offline.html'`, so the bundled fallback surface is
the whole of `public/` rather than a build output. Nothing sensitive is in `public/` —
its only non-asset file is `.well-known/apple-app-site-association`, reviewed in 4c.

---

## Tool: security-review (branch diff)

### Command run

```
Skill tool → security-review
```

### Real output

The skill's own harness collected the diff from the wrong tree. Its verbatim result:

```
GIT STATUS:
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

FILES MODIFIED:
(Bash completed with no output)

COMMITS:
(Bash completed with no output)

DIFF CONTENT:
(Bash completed with no output)
```

The skill ran `git` against `/Users/michael/Documents/PyCharmProjects/Onyx/.idea`, the
session's working directory, not the worktree. In the worktree the wave's work is
unstaged and untracked, so `git diff main...HEAD` is empty there too:

```
$ git -C .claude/worktrees/onyx-p3-e5-e6 rev-parse --abbrev-ref HEAD
onyx/p3-e5-e6-backend

$ git -C .claude/worktrees/onyx-p3-e5-e6 diff main...HEAD --stat
(no output)

$ git -C .claude/worktrees/onyx-p3-e5-e6 status --short
 M native/Onyx/App/AppEnvironment.swift
 M native/Onyx/Features/Auth/SignInView.swift
 M native/Onyx/Features/Settings/SettingsTabView.swift
 M native/Packages/OnyxData/Sources/OnyxData/Database/AppDatabase.swift
 M native/Packages/OnyxData/Sources/OnyxData/Sync/PostgRESTRemote.swift
 M native/Packages/OnyxData/Sources/OnyxData/Sync/SyncCoordinator.swift
 M src/app/auth/page.tsx
 ?? docs/sql/
 ?? native/Onyx/Features/Auth/SignUpView.swift
 ?? scripts/seed-demo-account.mjs
 ?? src/app/delete-account/
 (plus report/export files from wave E5)
```

So the skill's methodology was applied by hand to the named files. Findings 1, 2, 3, 6
and 7 above are its output. What it **cleared**, with the reasoning, because a clean
result is worth as much as a finding here:

**`docs/sql/e6-auth-deletion.sql` — the definer/`search_path` pairing.** Correct, and
correct for the right reason. Both functions are `security definer` with
`set search_path = ''`, and every identifier inside both bodies is schema-qualified —
`public.profiles`, `public.user_goals`, `public.plans`, all 32 `public.*` deletes, and
`auth.users`. Critically, `auth.uid()` at line 111 is itself qualified; an unqualified
`uid()` under an empty `search_path` would have failed at run time, and a
non-empty `search_path` would have made it hijackable. There is no dynamic SQL and no
string concatenation in either body, so the "name all 32 tables explicitly" decision at
lines 20–23 removes the injection surface rather than merely narrowing it. A misspelled
table now fails at `CREATE` time.

**The grant/revoke lines.** `revoke execute on function public.delete_my_account() from
public, anon;` followed by `grant execute … to authenticated;` (166–167) is the right
pair — revoking from `public` already removes `anon` and `authenticated`, and the
explicit grant re-adds only the one role that should have it. `handle_new_user()` is
revoked from all three (73) and granted to none, which is safe: PostgreSQL does not
check `EXECUTE` on a trigger function, it checks `TRIGGER` on the table, so the trigger
still fires while no client can call the function directly. There is a theoretical
window between `create or replace` and the `revoke` on a **first** install where
`PUBLIC` holds the default grant, but `create or replace` preserves ACLs on re-runs and
the `auth.uid()` guard covers the window regardless. Not raised.

**The `auth.uid()` null guard.** Present, correct, and load-bearing (116–118). The
comment's reasoning is right: without it an `anon` caller would run 32 deletes with
`user_id = null`, which matches nothing today and matches everything the day a nullable
`user_id` appears. Raising rather than returning is the correct choice.

**Half-created accounts.** Not possible. All three inserts run inside the trigger, which
runs inside the `insert into auth.users` transaction. Any exception rolls the sign-up
back whole. The `on conflict do nothing` clauses narrow the swallowed error to exactly
one case — a row that already exists — and let every other error surface, which is what
the comment at 38–41 claims and what the code does. The bare `on conflict do nothing`
on `plans` (67) is legal with no constraint and is the right form there, since `plans`
is not one-per-user.

**Half-deleted accounts.** Also not possible. All 33 deletes are one transaction with
`auth.users` last (162), so a failure anywhere leaves the account intact and logged-in —
the correct failure mode, as the comment argues. The residual risk is finding 2: not
that deletion half-succeeds, but that it never succeeds.

**Privilege escalation via sign-up.** Clear. `handle_new_user()` hardcodes
`role => 'member'` (56) and reads nothing from `new.raw_user_meta_data`, so a caller
cannot self-assign `admin` through the sign-up payload. This is the classic Supabase
trigger vulnerability and this trigger does not have it.

**`PostgRESTRemote.swift:140-149`.** A genuine improvement. `deleteRow` now ANDs
`.eq("user_id", value: userId)` before the caller's key filters, so a natural-key delete
(`{date: "2026-09-05"}`) can no longer reach another user's row even if RLS were
misconfigured. The comment's claim that a key already naming a user is unaffected is
correct — PostgREST ANDs filters, so an equal value is a no-op and a different one
matches nothing.

**`AppDatabase.swift:1167-1180`.** No SQL injection: table names come from
`sqlite_master`, not from input, and are interpolated into `DELETE FROM "<name>"` with
quoting. `grdb_migrations` is exempted deliberately and correctly — erasing it would
make the next open replay every migration against tables that already exist. The
`PRAGMA defer_foreign_keys = ON` makes the catalog's arbitrary ordering safe. The only
issue is finding 7, which is data loss, not a vulnerability.

**`SignUpView.swift` / `src/app/auth/page.tsx`.** Both enforce an 8-character minimum
(`SignUpView.swift:45`, `auth/page.tsx:69-71`), above Supabase's default of 6, and the
web form sets `autoComplete` correctly per mode (`new-password` on sign-up,
`current-password` on sign-in, `auth/page.tsx:170`) — getting that backwards is how a
sign-up form pre-fills the previous account's password. Client-side minimums are UX, not
a control; the server enforces its own. No finding.

**`SettingsTabView.swift:200-251` / `delete-account/page.tsx`.** Both gate deletion
behind an explicit confirmation (two taps native, a typed `DELETE` on the web at
`page.tsx:53`) and both keep the session alive on RPC failure so the user can retry —
signing out after a failed delete would strand them. Correct on both counts.

---

## Tool: npm audit

### Command run

```
$ npm audit --omit=dev
```

**Run twice.** The lockfile changed underneath this sweep: concurrent work in the same
worktree bumped `next` from `15.5.19` to `15.5.25` in `package.json` and
`package-lock.json` between the two runs. Both results are given, because the delta is
itself the answer to the most serious dependency finding.

### First run — real output (tail), lockfile at `next@15.5.19`

```
browserslist  <=4.28.6
Severity: high
Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM - https://github.com/advisories/GHSA-c83g-rgw3-j3cx
Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) - https://github.com/advisories/GHSA-73wf-gq98-2v4g
fix available via `npm audit fix --force`
Will install @serwist/next@9.4.1, which is a breaking change
node_modules/browserslist
  @serwist/next  9.4.2 - 9.5.12
  Depends on vulnerable versions of browserslist
  node_modules/@serwist/next

nanoid  <=3.3.17
Severity: high
nanoid: non-secure generators can loop indefinitely with negative size - https://github.com/advisories/GHSA-28wg-ghj8-5hjv
nanoid: custom generators can loop indefinitely when size is zero - https://github.com/advisories/GHSA-2v37-7h3g-55p8
fix available via `npm audit fix`
node_modules/nanoid

next  9.3.4-canary.0 - 16.3.0-preview.10
Severity: high
Next.js: Denial of Service in App Router using Server Actions - https://github.com/advisories/GHSA-m99w-x7hq-7vfj
Next.js: Server-Side Request Forgery in Server Actions on custom servers - https://github.com/advisories/GHSA-89xv-2m56-2m9x
Next.js: Cache confusion of response bodies for requests with bodies - https://github.com/advisories/GHSA-68g3-v927-f742
Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences - https://github.com/advisories/GHSA-4633-3j49-mh5q
Next.js: Unbounded Server Action payload in Edge runtime - https://github.com/advisories/GHSA-4c39-4ccg-62r3
Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname - https://github.com/advisories/GHSA-p9j2-gv94-2wf4
Next.js: Denial of Service in the Image Optimization API using SVGs - https://github.com/advisories/GHSA-q8wf-6r8g-63ch
Next.js: Unauthenticated disclosure of internal Server Function endpoints - https://github.com/advisories/GHSA-955p-x3mx-jcvp
Depends on vulnerable versions of postcss
Depends on vulnerable versions of sharp
fix available via `npm audit fix --force`
Will install next@15.5.25, which is outside the stated dependency range
node_modules/next

postcss  <=8.5.22
Severity: high
PostCSS has XSS via Unescaped </style> in its CSS Stringify Output - https://github.com/advisories/GHSA-qx2v-qp2m-jg93
PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments - https://github.com/advisories/GHSA-6g55-p6wh-862q
PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset - https://github.com/advisories/GHSA-fxqj-rqcc-2cmp
PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure - https://github.com/advisories/GHSA-r28c-9q8g-f849
fix available via `npm audit fix --force`
Will install next@15.5.25, which is outside the stated dependency range
node_modules/next/node_modules/postcss

sharp  <0.35.0
Severity: high
sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 - https://github.com/advisories/GHSA-f88m-g3jw-g9cj
fix available via `npm audit fix --force`
Will install sharp@0.35.4, which is a breaking change
node_modules/sharp

7 high severity vulnerabilities
```

### Second run — real output (head), lockfile at `next@15.5.25`

```
# npm audit report

brace-expansion  4.0.0 - 5.0.8
Severity: high
brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash - https://github.com/advisories/GHSA-mh99-v99m-4gvg
brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation - https://github.com/advisories/GHSA-rgw5-rvv9-x895
fix available via `npm audit fix`
node_modules/glob/node_modules/brace-expansion

browserslist  <=4.28.6
Severity: high
Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM - https://github.com/advisories/GHSA-c83g-rgw3-j3cx
Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) - https://github.com/advisories/GHSA-73wf-gq98-2v4g
fix available via `npm audit fix --force`
Will install @serwist/next@9.4.1, which is a breaking change
node_modules/browserslist
  @serwist/next  9.4.2 - 9.5.12
  Depends on vulnerable versions of browserslist
  node_modules/@serwist/next

nanoid  <=3.3.17
Severity: high
nanoid: non-secure generators can loop indefinitely with negative size - https://github.com/advisories/GHSA-28wg-ghj8-5hjv
nanoid: custom generators can loop indefinitely when size is zero - https://github.com/advisories/GHSA-2v37-7h3g-55p8
fix available via `npm audit fix`
node_modules/nanoid

postcss  <=8.5.22
Severity: high
PostCSS has XSS via Unescaped </style> in its CSS Stringify Output - https://github.com/advisories/GHSA-qx2v-qp2m-jg93
PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments - https://github.com/advisories/GHSA-6g55-p6wh-862q
PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset - https://github.com/advisories/GHSA-fxqj-rqcc-2cmp
PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure - https://github.com/advisories/GHSA-r28c-9q8g-f849
fix available via `npm audit fix --force`
Will install next@16.3.4, which is a breaking change
node_modules/next/node_modules/postcss
  next  9.3.4-canary.0 - 16.3.0-preview.10
  Depends on vulnerable versions of postcss
  node_modules/next

sharp  <0.35.0
Severity: high
sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591 - https://github.com/advisories/GHSA-f88m-g3jw-g9cj
fix available via `npm audit fix --force`
Will install sharp@0.35.4, which is a breaking change

7 vulnerabilities (1 moderate, 6 high)
```

### Assessment (current state)

**0 critical. 6 high, 1 moderate.**

The eight Next.js advisories are **gone** — `15.5.25` carries the fix for all of them,
including GHSA-955p-x3mx-jcvp, the unauthenticated disclosure of internal Server
Function endpoints that was the only advisory with real exposure on this deploy.
`next` is now flagged only transitively, as a dependent of `postcss`.

| Package | Severity | Path | Reachable? |
|---------|----------|------|------------|
| `postcss` | High | `node_modules/next/node_modules/postcss` ← `node_modules/next` | Build-time only. GHSA-r28c-9q8g-f849 / GHSA-6g55-p6wh-862q need attacker-controlled CSS with a crafted `sourceMappingURL` entering the build; this project authors all of its own CSS. **No** |
| `sharp` | High | `node_modules/sharp` | libvips CVEs, reachable only through Next's Image Optimization API on attacker-supplied images. **Marginal** |
| `browserslist` | High | `node_modules/browserslist` ← `@serwist/next` | Build-time; both advisories need an untrusted `browserslist-stats.json`. **No** |
| `nanoid` | High | `node_modules/nanoid` | Infinite loop on a negative or zero size; call sites are fixed. **No** |
| `brace-expansion` | High | `node_modules/glob/node_modules/brace-expansion` | Newly surfaced by the re-resolve. DoS via unbounded expansion, in a glob path used at build time. **No** |
| (moderate, 1) | Moderate | — | Not itemised separately by the reporter in the `--omit=dev` view. |

**Caveat, stated because it changes what the numbers mean:** `npm audit` reads the
lockfile, but `node_modules` on this machine still has the old build —
`node --print "require('next/package.json').version"` returns `15.5.19` against a
lockfile pinning `15.5.25`. The advisories are cleared **on paper**; a
`npm ci` is what makes that true on disk, and it should be run before any build that
ships.

**Recommendation:** run `npm ci` to realise the `next` bump, then `npm audit fix` for
`nanoid` and `brace-expansion` (both non-breaking). Leave `postcss`, `sharp` and
`browserslist` — all three need `--force`, which now proposes `next@16.3.4`, a major
version bump that is a planned upgrade rather than a sweep action. None of the three is
reachable from untrusted input in this application.

---

## Direct checks

Each stated pass/fail with the command and its evidence.

### 4a. Does any `NEXT_PUBLIC_*` variable carry a secret? — **PASS**

```
$ grep -rhoE "NEXT_PUBLIC_[A-Z0-9_]+" src/ | sort -u
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_BUILD_ID
NEXT_PUBLIC_DEV_EMAIL
NEXT_PUBLIC_DEV_PASSWORD
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
```

Four of the six are non-secret by design: `APP_URL` and `BUILD_ID` are public facts, and
`SUPABASE_URL` + `SUPABASE_ANON_KEY` are the pair Supabase intends to ship in clients,
with RLS as the actual control.

The two that would be secrets are **not reads**. The only occurrence of either in `src/`
is a comment:

```
$ grep -rn "NEXT_PUBLIC_DEV_EMAIL\|NEXT_PUBLIC_DEV_PASSWORD" src/
src/app/auth/page.tsx:15: * This page used to read NEXT_PUBLIC_DEV_EMAIL / NEXT_PUBLIC_DEV_PASSWORD and
```

`.env.example` documents the same removal and explains why (a `NEXT_PUBLIC_*` variable
is inlined into the client bundle, so the auto-login button shipped a live account
password to every visitor). It also names two items still outstanding **by hand**, which
this sweep cannot verify and which remain open:

> delete `NEXT_PUBLIC_DEV_*` and `NEXT_PUBLIC_BYPASS_*` from the Netlify environment,
> then rotate that Supabase account's password — it was public in the bundle and has not
> been changed since.

`.env.example` itself carries only placeholders (`your-anon-key-here`,
`your-service-role-key-here`). Pass on the code; **the two Netlify/rotation items are
still open at the provider.**

### 4b. Is the service-role key reachable from any client bundle? — **PASS**

```
$ grep -rn "supabase/server" src/
src/app/api/compute-score/route.ts:2:import { getServerSupabaseClient } from '@/lib/supabase/server'
src/app/api/ingest/route.ts:21:import { getServerSupabaseClient } from '@/lib/supabase/server'
src/app/api/sessions/route.ts:5:import { getServerSupabaseClient } from '@/lib/supabase/server'
src/app/api/today/route.ts:2:import { getServerSupabaseClient } from '@/lib/supabase/server'
src/tests/supabase.test.ts:5:import { getServerSupabaseClient } from '@/lib/supabase/server'
```

Five importers. Four are Route Handlers, which are server-only by construction; the
fifth is a test. None declares `'use client'`:

```
$ for f in .../compute-score/route.ts .../ingest/route.ts .../sessions/route.ts .../today/route.ts; do head -3 "$f" | grep -q "use client" && echo "CLIENT" || echo "server"; done
server
server
server
server
```

And no client component anywhere under `src/app/**` reaches it, directly or
transitively — the transitive case is covered because `src/lib/supabase/server.ts` has
exactly the five importers above and none of them is a client component, so there is no
intermediate module to traverse:

```
$ grep -rln "use client" src/app | while read f; do grep -l "supabase/server" "$f"; done
(no output)
```

`SUPABASE_SERVICE_ROLE_KEY` is read only at `src/lib/supabase/server.ts:9` and in
`scripts/*.mjs` (Node-only operator scripts, never bundled). The file's claim at line 5
holds.

### 4c. `public/.well-known/apple-app-site-association` — **PASS (content correct, nothing leaked)**

```
$ cat public/.well-known/apple-app-site-association
{
  "webcredentials": {
    "apps": [
      "W9UMPV973P.app.helix.health.michael",
      "W9UMPV973P.app.onyx.health.michael.native"
    ]
  }
}
```

This wave modified the file: the second entry, `W9UMPV973P.app.onyx.health.michael.native`,
is new — the committed version listed only the Capacitor bundle ID. The content reviewed
here is the post-change version.

Valid JSON, correct AASA schema, correct `TEAMID.BUNDLEID` form for both apps, matching
`native/project.yml`'s `DEVELOPMENT_TEAM: W9UMPV973P` and
`PRODUCT_BUNDLE_IDENTIFIER: app.onyx.health.michael.native`, and
`capacitor.config.ts`'s `appId: 'app.helix.health.michael'`.

**Leaks nothing.** A Team ID and a bundle ID are public by design — every AASA on the
internet publishes both, and both are already visible in any distributed build. There is
no `applinks` section, so no URL paths are disclosed either.

Two non-security notes worth carrying forward: the file must be served as
`application/json` with no redirect for Apple to fetch it (no `netlify.toml` header rule
exists for it), and neither app currently declares
`com.apple.developer.associated-domains` — `ios/App/App/App.entitlements` has only
HealthKit and `native/project.yml` adds only app-groups and HealthKit — so the AASA is
inert today. Harmless, but the Password AutoFill it enables will not work until the
entitlement is added.

### 4d. Privacy manifests — **PARTIAL PASS**

| Target | File | Verdict |
|--------|------|---------|
| `ios/App/App` (Capacitor app) | `ios/App/App/PrivacyInfo.xcprivacy` | **Exists · correct** |
| `native/Onyx` | `native/Onyx/Support/PrivacyInfo.xcprivacy` | **Exists · correct** |
| `native/OnyxWidgets` | `native/OnyxWidgets/Support/PrivacyInfo.xcprivacy` | **Exists · correct** |
| `ios/App/HelixWatch Watch App` | — | **MISSING — finding 4** |

The requirement was Health, Fitness and Email declared as Collected · Linked · not used
for tracking · App Functionality. All three app manifests declare exactly that:

- `NSPrivacyCollectedDataTypeHealth` — Linked `true`, Tracking `false`, purpose `NSPrivacyCollectedDataTypePurposeAppFunctionality` ✓
- `NSPrivacyCollectedDataTypeFitness` — same ✓
- `NSPrivacyCollectedDataTypeEmailAddress` — same ✓

plus `NSPrivacyTracking: false` and an empty `NSPrivacyTrackingDomains` in all three,
which is consistent with there being no analytics or ad SDK and no third-party network
destination in either tree.

Required-reason APIs are declared per binary and the two lists correctly differ:
`ios/App/App` declares `UserDefaults` / `CA92.1` only (Capacitor Preferences);
`native/Onyx` and `native/OnyxWidgets` add `FileTimestamp` / `C617.1` and `DiskSpace` /
`E174.1` for GRDB. `OnyxWidgets` correctly omits `EmailAddress`, which the extension
never sees.

The gap is the watch target — finding 4.

### 4e. Hardcoded credentials, tokens or keys outside `.env.local` — **PASS on tracked files; FAIL on `scripts/seed-demo-account.mjs`**

```
$ grep -rn "eyJ[A-Za-z0-9_-]\{10,\}" src native ios scripts public
native/Onyx/Support/Secrets.xcconfig:14:ONYX_SUPABASE_ANON_KEY = eyJ… [redacted]
```

One hit, and it is not a leak:

```
$ git check-ignore -v native/Onyx/Support/Secrets.xcconfig
.gitignore:106:native/Onyx/Support/Secrets.xcconfig	native/Onyx/Support/Secrets.xcconfig

$ git log --oneline --all -- native/Onyx/Support/Secrets.xcconfig ios/App/Secrets.xcconfig
(no output — never committed)

$ git ls-files | grep -i xcconfig
ios/App/Secrets.example.xcconfig
native/Onyx/Support/Secrets.example.xcconfig
```

The file is gitignored, has never been in history, and only the two `.example` templates
are tracked — both containing placeholders (`your-anon-key-here`,
`paste-your-token-here`). The value itself is a Supabase **anon** key, which is
public-by-design and already ships in the web bundle.

```
$ grep -rnE "(sk-[A-Za-z0-9]{20,}|sk_live_|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-)" src native ios scripts public
(no output)

$ grep -rnE "['\"][A-Za-z0-9+/]{40,}={0,2}['\"]" src native ios scripts   # long base64 literals
(no credential-shaped hits — only HealthKit type identifiers in src/lib/native/healthkit.ts)

$ grep -rnEi "(password|secret|api_?key|token)\s*[:=]\s*['\"][^'\"$]{8,}['\"]" src native ios scripts
scripts/recompute-scores.mjs:182:  console.error('cannot list users to mint a token:', …)
scripts/recompute-scores.mjs:191:  console.error('cannot mint a token:', …)
scripts/recompute-scores.mjs:201:  console.error('cannot exchange the token:', …)
```

Those three are error strings, not credentials. `.env` and `.env.local` are covered by
`.gitignore:26-31` and `git ls-files` shows no env file tracked but `.env.example`.

**The one real credential is finding 1**, `scripts/seed-demo-account.mjs:49`, which this
pattern did not match only because the variable is named `DEMO_PASSWORD` and assigned
via `||`. It is caught and reported above.

---

## Accepted risks

Each of these was judged and deliberately not raised as a finding.

1. **The Supabase anon key ships in every client** — web bundle, `native/` via
   `Secrets.xcconfig` → `Info.plist`, and the Capacitor shell. This is the key's designed
   role; RLS is the control that matters. `native/Onyx/Support/Secrets.example.xcconfig`
   states the position exactly right: the key is safe to ship, but "there is no upside to
   publishing it", hence the gitignore. Accepted as designed.

2. **The demo account exists at all, and its credentials go to Apple.** Handing App
   Review a working login is guideline 2.1's requirement, and the credentials are
   transmitted to Apple in clear in App Store Connect regardless. The account holds only
   synthetic data (`scripts/seed-demo-account.mjs:1-42`) and is an ordinary `member` with
   no elevated role. Accepted. **What is not accepted is the password being a source
   literal in a public repo** — that is finding 1, and it is a distinct issue from the
   account's existence. The script's `console.log` of the credentials at line 432 is
   likewise fine: it is an operator script run locally by the founder.

3. **A deleted user's access token stays valid until it expires** (finding 6, kept at
   Low rather than raised higher). The window is bounded by the access-token TTL, the
   `auth.users` row is already gone so no refresh can succeed, and RLS matches no rows
   for a uid with no data. Both call sites sign out immediately and both document the
   reasoning (`AppEnvironment.swift:446-457`, `delete-account/page.tsx:26-31`). Accepted
   on the strength of a short TTL; revisit if the project's JWT expiry is ever raised.

4. **No certificate pinning** (Capsec NET002) on either tree. Both apps talk only to
   their own TLS-terminated hosts through the system network stack with ATS at defaults.
   Pinning adds a rotation failure mode — a pinned app bricks when the certificate
   rolls — that is a worse risk than the MITM it prevents for an app with no
   third-party network destinations. Accepted.

5. **No jailbreak/root detection** (Capsec CAP007 / IOS007). The threat model is a
   single user's own fitness data on their own device; detection is trivially bypassed
   and its only real use is DRM. Accepted.

6. **The GRDB store in the App Group is not encrypted at rest** (Capsec STO003). It
   holds health data, but it sits inside the app sandbox on a device with file-level
   protection, and the App Group is the entire reason the widget can read it without a
   token or a network call (`native/project.yml`, "The App Group" section) — which is
   itself the security improvement that removed the snapshot-token route on the phone.
   SQLCipher would cost that. The credential that guards it, the Supabase session, **is**
   in the Keychain. Accepted.

7. **`native/Onyx/Support/Secrets.xcconfig` holds a real anon key on disk.** Gitignored,
   never committed, and holding a key that is public by design. Accepted.

8. **`nanoid`, `brace-expansion`, `browserslist`, `postcss` and `sharp` advisories.**
   Build-time or unreachable-call-site issues; none takes untrusted input in this
   application (see the npm audit assessment table). Accepted until a planned `next`
   major upgrade carries them. GHSA-955p-x3mx-jcvp, the one advisory that was **not**
   accepted, was fixed during this sweep by the bump to `next@15.5.25` — but only in the
   lockfile. `npm ci` is still required to realise it on disk.

## Still open, outside this sweep's reach

Recorded because a report that omits them reads as an all-clear:

- The Netlify environment still needs `NEXT_PUBLIC_DEV_*` and `NEXT_PUBLIC_BYPASS_*`
  deleted, and that account's Supabase password rotated. `.env.example` says both are
  outstanding; neither can be verified from the repository.
- `docs/APP_STORE.md:281-289` lists four credentials to rotate at the provider — the
  `service_role` key and account password, the dead Anthropic and Notion tokens, and the
  `widget_tokens` row behind `HELIX_SNAPSHOT_TOKEN`. None is in git; all are live.
- Nothing in this sweep was run against the live Supabase database, per instruction. The
  §4 verify block at the end of `docs/sql/e6-auth-deletion.sql` is the correct place to
  settle findings 2 and 3, and it has not been run.

---

## Resolution — what wave E6 did about each finding

Appended after the sweep, by the wave that commissioned it. The findings above
record the state the sweep FOUND and have deliberately not been edited.

| # | Status | What changed |
|---|--------|--------------|
| 1 | **Fixed** | `DEMO_PASSWORD` has no default. `ONYX_DEMO_PASSWORD` is required from the environment and the script exits non-zero without it, the same way it already did for the service-role key. It is also no longer echoed back at the end of a run. The finding's own reasoning is quoted in the source comment, because "the credentials go to Apple anyway" is the argument that would put it back. |
| 2 | **Fixed** | The delete order now runs every table that describes a day — `daily_metrics`, `daily_scores`, `daily_targets`, `nutrition_entries`, `water_intake`, `supplement_log`, `fatigue_logs`, `cardio_logs`, `body_composition`, `body_measurements`, `sleep_sessions` — **before** `daily_logs`. Correct under either answer to the FK question the sweep could not resolve, and it costs nothing. |
| 3 | **Fixed** | Both inserts use an untargeted `on conflict do nothing`. `profiles.user_id` is the primary key so a target would have worked there, but `user_goals`' primary key is `id` and a missing unique index on its `user_id` would have raised `42P10` inside the trigger — which fails the whole sign-up. The untargeted form catches any unique violation and cannot fail that way. |
| 4 | **Open — founder decision** | The gap is in `ios/App/HelixWatch Watch App/`, the older Capacitor tree. Adding a privacy manifest there is correct but the prior question is whether that target ships at all; the newer `native/` app has its own manifests and they pass. Not fixed here because excluding the target and manifesting it are different answers and only one of them is this wave's to give. |
| 5 | **Open — founder decision, and the most serious thing in this document** | A long-lived, non-expiring read-only bearer token for one user's complete health snapshot, in plaintext, inside a shipped bundle. Same tree as #4 and the same prior question. If `ios/App` is submitted, this must be answered first; if it is not submitted, both findings evaporate. |
| 6 | **Accepted** | Unchanged, and documented in the SQL itself. The window is one access-token TTL, and RLS matches no rows for a deleted uid for the whole of it. Revoking server-side needs an edge function, which is a larger change than the risk justifies. |
| 7 | **Fixed, partially** | The erase still runs unconditionally — keeping one user's training log on a signed-out device is the worse outcome, and that trade is not close. What it no longer does is run SILENTLY: `AppDatabase.outboxPendingCount()` is read before the erase and the count is reported through `startupError` afterwards, so discarded work is something the user is told about rather than something they discover. The Settings confirmation copy was also corrected — it still promised that "logged sets stay until they sync", which the new sign-out makes untrue. |
| 8 | **Open — not a blocker** | No live XSS path, as the finding says. A CSP belongs with the web deploy configuration rather than in a backend wave. |
