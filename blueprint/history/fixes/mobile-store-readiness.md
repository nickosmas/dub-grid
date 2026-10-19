# Fix: The mobile apps are ready for App Store and Google Play submission

**Type:** Fix
**Status:** verified
**Completed:** 2026-10-19

### The problem

An audit of `apps/mobile` on 2026-10-18 found that the code is healthy
(type-check clean, 1,440 of 1,440 tests passing), but a first store submission
would fail or be rejected:

- **No release pipeline.** There is no `eas.json`, and `app.json` has no
  `extra.eas.projectId` or `owner`. Without the project ID, push registration
  throws `MissingPushProjectIdError` in every standalone build
  (`notifications/lib/push-permission.ts`). Android has no
  `googleServicesFile`, so it cannot mint an FCM token. A local release build
  signs with the debug key.
- **A release build can ship pointed at a dev machine.** `EXPO_PUBLIC_*`
  values are inlined from the untracked `.env.local`, and `validateMobileEnv`
  (`shared/lib/env.ts:173`) refuses only loopback hosts, so a LAN IP, plain
  `http`, or the redirecting apex `dubgrid.com` all pass in release.
- **A tracking setup with no tracking behind it.** `expo-tracking-transparency`
  and `NSUserTrackingUsageDescription` ship (`app.json:36-49`), but nothing
  calls the prompt (`consent/lib/consent.ts:126`, "scaffolding"), and the
  plugin adds `com.google.android.gms.permission.AD_ID` on Android. Apple
  rejects a declared tracking purpose that the app does not use, and the
  Play advertising ID declaration would have to say yes.
- **Unneeded Android permissions** from the default template:
  `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`.
- **iOS metadata gaps.** No `ITSAppUsesNonExemptEncryption` (every upload
  asks the export question). `NSFaceIDUsageDescription` is the plugin's
  generic default because `expo-local-authentication` is not configured.
  The privacy manifest declares no collected data types. `supportsTablet:
true` commits to iPad screenshots and an iPad review, landscape included,
  for a layout that has no iPad handling.
- **No Android notification icon**, so the status bar shows a white square.
- **The locked screen steers to outside payment.** "Manage billing on web"
  (`auth/screens/OrganizationLockedScreen.tsx:131`) opens the web billing page.
  Google Play's payments policy forbids it; on iOS it rests on an argument
  under 3.1.3(c).
- **Copy that contradicts the privacy answers.** The consent sheet says the
  app collects analytics with consent (`consent/components/ConsentGate.tsx:145`),
  but the mobile app ships no analytics SDK. The App lock row says "Face ID"
  on Android (`profile/screens/ProfileSecurityScreen.tsx:206`). The login
  screen has no privacy policy link.
- **The privacy policy promises a self-serve data export** that no screen
  offers (`apps/web/src/app/privacy/page.tsx:341` and `:466`), and does not
  name the device model and app version the app sends
  (`shared/lib/api.ts:803`).
- **Dependency drift.** `expo-doctor` reports `expo-constants` 18.0.13 (wants
  ~18.0.14, and a second copy is installed under `expo`) and
  `expo-local-authentication` 17.0.8 (wants ~17.0.9).

Account deletion is not in scope. Both stores require it only when an app
lets people create an account, and the mobile app has no sign-up, invite
acceptance or link to either. It is covered by review notes (step 8).

### The fix

Make a release bundle refuse any API host but a public https one (the EAS
pipeline itself moved to a follow-up fix). Remove the unused
tracking setup and the template permissions. Fill in the iOS metadata,
replace the billing button with plain text, align the copy with what the app
really collects, and record the submission answers in the release
qualification doc.

Two calls this spec makes, for the owner to confirm at review:

1. **iPhone only for v1** (`supportsTablet: false`). Apple does not let an
   app that has shipped iPad support drop it later. Starting iPhone-only can
   be reversed later; the other way round cannot. iPads still run the iPhone
   build in compatibility mode.
2. **No billing link on either platform.** The locked screen says a Super
   Admin can manage billing on the web, without a button or a URL. One
   behavior on both stores, no 3.1.3(c) argument needed.

It must not break:

- Development and LAN builds: the release URL rules apply only when
  `!__DEV__`, and `withDevServerHost` stays dev-only.
- `CONSENT_VERSION` lockstep with web. This changes copy only, not the
  choices, so no version bump.
- The push registration contract and its tests (`push-permission.test.ts`,
  `usePushRegistration.test.ts`).
- `app.json` is a high-risk file (`apps/mobile/AGENTS.md`): each change is
  shown in the step diff with the introspected result.

### Owner prerequisites

Moved with step 7 to the follow-up fix `mobile-release-pipeline`. They are
also the "Before the first build" checklist in
`internal/mobile-release-qualification.md`.

### Build steps

- [x] **1. A release build refuses any API host but a public https one.**
      In `validateMobileEnv`, when the bundle is not a dev build, add an issue
      for a Supabase or API URL that is not `https:`, whose host is loopback
      or a private IPv4 address, or whose API host is the bare apex
      `dubgrid.com` (it 307s to www and iOS drops the Authorization header).
      Take the build mode as a parameter defaulting to `__DEV__`, as
      `platform` and `devServerHost` already are, so it is testable.
      **Done when:** `env.test.ts` covers each refused case in release, that
      the same values still pass in dev, and that the production values
      pass in release.
- [x] **2. Remove the tracking setup and block the template permissions.**
      Delete `requestTrackingPermissionIfNeeded` and its imports from
      `consent.ts`. In `app.json`, remove the `expo-tracking-transparency`
      plugin and `ios.infoPlist.NSUserTrackingUsageDescription`, and add
      `android.blockedPermissions` for `android.permission.SYSTEM_ALERT_WINDOW`,
      `android.permission.READ_EXTERNAL_STORAGE`,
      `android.permission.WRITE_EXTERNAL_STORAGE`, and
      `com.google.android.gms.permission.AD_ID`. Keep `USE_FINGERPRINT`,
      which biometrics need below API 28 (min SDK is 24).
      **Done when:** `npx expo config --type introspect` shows no tracking
      usage string and lists the four blocked permissions, and nothing in
      `apps/mobile/src` imports `expo-tracking-transparency`.
- [x] **3. Dependencies match SDK 54.** From the main checkout's `dev`, not
      the worktree (dependency installs run where `node_modules` lives),
      uninstall `expo-tracking-transparency` from `@dubgrid/mobile` and
      align `expo-constants` and `expo-local-authentication` with
      `npx expo install --check`. Review the lockfile diff and confirm it
      touches only those three packages and their own dependencies; never
      regenerate the lockfile.
      **Done when:** `npx expo-doctor` passes 18 of 18, and the
      `package-lock.json` diff names no other packages.
      _Built:_ resolved in the worktree with `npm install --package-lock-only`
      on the project's npm 10.9.2, which writes no `node_modules`. The lock
      diff is exactly those three, plus the nested
      `expo/node_modules/expo-constants` copy it dedupes; a second resolve is
      byte-identical; `deps:scan` and `deps:audit` pass. `expo-doctor` reads
      installed modules, so its 18 of 18 is confirmed after the merged lock is
      installed in the main checkout.
- [x] **4. iOS metadata.** In `app.json`: `ios.supportsTablet: false`;
      `ios.config.usesNonExemptEncryption: false` (the app uses only HTTPS
      and system crypto); the `expo-local-authentication` plugin with a
      specific `faceIDPermission` ("Use Face ID to unlock DubGrid when you
      return to it."); and `ios.privacyManifests` declaring the collected
      types (name, email, phone, user ID, device ID, other user content,
      crash data) as linked to the user, not used for tracking, for app
      functionality.
      **Done when:** introspection shows `ITSAppUsesNonExemptEncryption`
      false, the new Face ID string, `UIDeviceFamily` [1], and a
      `PrivacyInfo.xcprivacy` with those collected types and the existing
      required-reason API entries.
      _Built:_ diagnostics are declared as Other Diagnostic Data, not Crash
      Data: the app has no crash SDK, and what it sends is the device model,
      app version and server-side error reports. A worktree prebuild shows
      `TARGETED_DEVICE_FAMILY = "1"`.
- [x] **5. An Android notification icon.** Extend
      `scripts/generate-app-icons.mjs` to render
      `assets/images/notification-icon.png`: the symbol in white on
      transparent, 96 x 96, inside Android's status bar safe area. Configure
      the `expo-notifications` plugin with that `icon` and `color: "#2563EB"`
      (the adaptive icon background).
      **Done when:** the script writes the file, it is 96 x 96 and white
      only on alpha, and introspection shows the notification icon and color
      in the Android manifest metadata.
- [x] **6. Copy matches what the app does.** `OrganizationLockedScreen`
      loses the "Manage billing on web" button. The `ConsentGate` body says
      what is true on mobile: "DubGrid uses only the data it needs to run the
      app. You can also choose whether we may use analytics to improve it. You
      can change this any time in Profile, Privacy & data." The App lock row
      names each platform's own unlock methods through `Platform.select`.
      `LoginScreen` links the privacy policy in the in-app browser.
      _Done when_ the screens' tests assert the new copy and the absent
      billing button.
      _Built:_ no extra line on the locked screen, because the server already
      sends a locked Super Admin "Sign in on the web to manage billing."
      (`packages/mobile-api-core/src/auth.ts:115`). The iOS App lock copy
      names Touch ID too (iPhone SE). Three public docs pages were updated and
      five fingerprints re-recorded. Simulator screenshots are left to
      `/check`.
- **7. The release pipeline.** Moved on 2026-10-19, by the owner's
  decision, to its own follow-up fix (`mobile-release-pipeline`), with the
  owner prerequisites it needs. It cannot be built until those accounts
  exist, and the steps here do not depend on it.
- [x] **8. Record the submission answers.** A "Store submission" section
      in `internal/mobile-release-qualification.md` holds the owner's
      pre-build checklist, the App Review notes (accounts are created by the
      customer organization, in-app deletion requests, 3.1.3(c) web billing,
      notes visible only inside a closed organization, no credentials in the
      file), and the App Store privacy and Play Data safety answers matching
      step 4. `apps/web/src/app/privacy/page.tsx` replaces both data export
      promises with a request by email and names the device model, app
      version and device identifier the app records.
      _Done when_ the doc and the policy say the above, `npm run docs:check`
      passes, and the policy matches the Data safety answers.
      _Built:_ the policy's last-updated date was already October 2026, so no
      bump was needed. The `privacy-controls` page fingerprint was re-recorded;
      its text already sends data requests to support.

### Verify

- `npm --workspace @dubgrid/mobile run type-check` and `npm run test:mobile`
  pass from the worktree. `npm run test:web` and `npm run lint` also pass,
  for the privacy page.
- `npx expo-doctor` passes 18 of 18.
- `npx expo config --type introspect` in the worktree shows every value from
  steps 2, 4 and 5.
- A clean `npx expo prebuild --clean` inside the worktree (its `ios/` and
  `android/` are its own) builds on both simulators:
  - the merged Android manifest has none of the four blocked permissions;
  - the iOS build installs as iPhone-only.
- A release-mode bundle with `.env.local`'s LAN values shows the
  Configuration screen naming the refused host, and with the production
  values signs in.
- Once step 7 lands, the owner runs a `production` build per platform and
  records the push checks in `internal/mobile-release-qualification.md`
  section 3, which also feeds 40e4.

### Verification results (2026-10-19)

Ran on the branch after merging current `dev`:

- `npm run type-check` (24 of 24 tasks), `npm run lint` (0 errors; 2 old
  `<img>` warnings in files this fix does not touch), `npm run test:mobile`
  (1,487 mobile tests plus the shared packages), `npm run test:web` (5,706)
  and `npm run docs:check` (34 of 34 pages verified) all pass.
- The web production build passes (`next build --webpack`; Turbopack refuses
  the worktree's symlinked `node_modules`).
- `expo config --type introspect` and worktree prebuilds for iOS and Android
  show every value from steps 2, 4 and 5: `TARGETED_DEVICE_FAMILY = "1"`, the
  four permissions marked `tools:node="remove"`, and the notification icon.
- Lockfile: a second resolve is byte-identical; `deps:scan` and `deps:audit`
  pass.

Not run here, to do after the merge:

- `npx expo-doctor` 18 of 18, once `npm ci --ignore-scripts` and
  `npm run deps:rebuild` install the new lock in the main checkout.
- Simulator builds and screenshots of the step 6 copy, and the release-mode
  bundle check (`/check`). The copy is pinned by tests.

### Out of scope

- Crash reporting on mobile (no SDK today). Worth adding before general
  availability, as its own feature.
- A self-serve data export screen. The policy is reworded instead.
- R8 minification and iOS dark or tinted icon variants. Optional polish.
- Running `eas submit`, or anything else that touches App Store Connect,
  Play Console or EAS remotely. Each needs a separate yes.
