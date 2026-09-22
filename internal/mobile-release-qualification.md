# Mobile release qualification

What has to be true before a DubGrid mobile release ships, and who can prove
each part. The automated suite covers the app's own logic; everything here
needs an Expo account, store credentials, or a physical device, so it is run
by the account holder and its result recorded in the release notes.

Audit finding F-18 exists because none of this had evidence attached. Closing
it means completing the checklist below, not passing a test in this repo.

## 1. Project identity

`apps/mobile/app.json` must carry the Expo project id:

```json
"extra": { "eas": { "projectId": "<uuid from expo.dev>" }, "router": { "origin": false } }
```

`resolveExpoProjectId()` reads it (falling back to an older build's
`easConfig`) and push registration refuses with `MissingPushProjectIdError`
when it is absent, naming this setting. A development client resolves its own
id, so the gap only appears in a standalone build: check a real build, not
`expo start`.

**Evidence to record:** the project id in `app.json`, and a standalone build
registering a token without that error.

## 2. Build profiles and signed artifacts

- `eas.json` with `development`, `preview` and `production` profiles.
- iOS: distribution certificate and provisioning profile, push capability
  enabled, an APNs key uploaded to Expo.
- Android: upload key, and the FCM server key or service account uploaded to
  Expo.

**Evidence to record:** the build ids for a signed iOS and Android artifact
from the production profile, and the credential fingerprints Expo reports.

## 3. Push delivery, end to end

Use a dedicated release account per platform, never a personal login and never
`qa-*` accounts on a production tenant.

1. Install the signed build, sign in, and accept the push prompt.
2. Confirm the device row reaches `mobile_device_tokens` for that user and
   organization.
3. Trigger each notification class the app sends (shift request, schedule
   published, alert) and confirm delivery in foreground, background and with
   the app killed.
4. Tap each one and confirm it lands on the subject, including a cold start
   (the tap is replayed through `getLastNotificationResponseAsync`).
5. Revoke the permission in system settings and confirm the app stops
   registering and shows the opt-out state.
6. Sign out and confirm the device row is removed, and that a later push to
   the old token does not navigate the next account.

**Evidence to record:** one screenshot per platform for steps 3, 4 and 5, and
the `mobile_device_tokens` row before and after step 6.

## 4. Store readiness

- Version and build number bumped, release notes written.
- Privacy manifest and data-collection answers match what the app sends.
- The minimum OS versions in `app.json` match what was tested.

**Evidence to record:** the submission ids, and the OS versions the artifacts
were tested on.

## What the automated suite already proves

- Push registration refuses a build with no project id, and mints against the
  configured one (`push-permission.test.ts`, `usePushRegistration.test.ts`).
- A notification tap routes to its subject, including the cold-start replay,
  and listeners are removed on sign-out (`usePushResponseHandler.test.ts`).
- A deep link resolves an alert by id rather than by page
  (`mobile.test.ts`, `NotificationDetailScreen.test.tsx`).

None of that exercises Apple's or Google's delivery path, which is why the
checklist above exists.
