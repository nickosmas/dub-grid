# Feature: Simulator and emulator qualification

**From build-plan:** feature 40e4a (parent 40e4, Native iOS and Android qualification)
**Status:** complete
**Branch:** `feature/40e4-native-qualification` (cut from `dev` at 8dab203c)

## Goal

Run the native DubGrid app on the iOS Simulator and an Android emulator
against the dedicated local environment, as every mobile role in
`runtimeProfiles.mobile` (user, management-only user, admin, super admin),
through the states each device can actually reach, and keep the result as
dated evidence. The evidence says it came from virtual devices, and the
40e gate keeps asking for physical-device evidence (40e4b), so nothing
claims a real-device pass that did not happen.

## Decisions (made for the owner, 2026-10-22)

- **40e4 splits.** No physical iPhone or Android phone is reachable from
  this machine today (the paired iPhone reports unavailable, `adb` lists no
  device), and the plan says not to infer device evidence. 40e4a records
  what simulators and emulators prove; 40e4b is the physical pass, and 40e,
  so item 40, stays open until it is done.
- **Evidence names its device kind.** A mobile `runtimeEvidence` entry gains
  `device: "physical" | "virtual"`; `--require-runtime-evidence` counts only
  physical entries for iOS and Android.
- **The environment** is 40e3's seeded throwaway stack (55321) and local
  Upstash emulator, a production build of the web app (the mobile API) on
  port 3003 reachable from the devices, and Metro from this worktree on
  port 8082 with `EXPO_PUBLIC_*` pointing at them. The shared stack, the
  user's own emulator profile and personal accounts are never used; the QA
  accounts sign in.
- **States are recorded only where observed.** The iOS Simulator shares the
  Mac's network, so offline is exercised on Android only. A state that
  cannot be produced is listed as not exercised, never inferred.
- **Screenshots stay out of the repository**; the record describes what each
  one showed.

## Build steps

- [x] **Step 1 - Device kind in the evidence contract** - mobile entries
      need `device`, web entries must not have it, and the requirement flag
      counts only physical mobile entries.
      _Done when:_ contract tests cover a virtual entry that validates but
      does not satisfy the requirement, a physical one that does, a missing
      or unknown device kind, and a web entry with one; `docs:check` passes.
- [x] **Step 2 - Environment** - the production web server on 3003 and
      Metro on 8082 against the throwaway stack; the app on an iOS
      Simulator and an Android emulator loads this worktree's bundle.
      _Done when:_ both devices reach Sign in through the worktree's Metro.
- [x] **Step 3 - iOS Simulator pass** - each role signs in and its tabs
      and Home load; cold start keeps the session; error and retry (the
      API stopped, then started again); an empty list; loading where it
      can be seen.
      _Done when:_ every role and every reachable state has an observation.
- [x] **Step 4 - Android emulator pass** - the same, plus offline (the
      emulator's network turned off, then on).
      _Done when:_ every role and every reachable state has an observation.
- [x] **Step 5 - Record** - a dated record under
      `internal/operations/runtime-qualification/` per platform and
      `runtimeEvidence` entries with `device: "virtual"`.
      _Done when:_ `docs:check` passes and `--require-runtime-evidence`
      still reports iOS and Android as missing physical evidence.

## Out of scope

- Physical devices (40e4b), push delivery and store builds (the release
  qualification checklist), and any product change. A defect found becomes
  a finding.

## Notes for the AI

- Address simulators by UDID; the user's other simulators and the emulator
  signed in as the user stay untouched.
- Restore any simulator or emulator setting changed for the run (the JS
  location, network) and stop the stack, Redis containers, web server and
  Metro afterwards.

## Result

- Evidence: `internal/operations/runtime-qualification/2026-10-22-ios-simulator.md`
  and `2026-10-22-android-emulator.md`, with two `runtimeEvidence` entries
  marked `device: "virtual"`. Every mobile role was observed on both; iOS
  covers every state but offline, Android covers all seven.
- `docs:check --require-runtime-evidence` reports only the missing physical
  iOS and Android evidence (40e4b).
- Both runs used older Debug native builds (2026-09-18 iOS, 2026-09-26
  Android) with this commit's JavaScript; a fresh native build belongs to the
  physical pass.
- New finding F-128 (P3, open): the stored session exceeds SecureStore's
  2,048-byte guidance; it is stored and restored today.
- Environment problems met and worked around, none in the product: a stray
  nested `apps/mobile/node_modules/node_modules` that duplicated Expo Router
  (also in the main checkout), Metro reading stray keys until started with
  `CI=1`, the emulator's flapping Wi-Fi and its 1.5 GB memory, and the
  simulator keyboard dropping fast input.
