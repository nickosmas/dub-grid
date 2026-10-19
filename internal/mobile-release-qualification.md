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

## 5. Store submission

### Before the first build

The account holder sets these up; none of them live in the repo.

1. An Expo project for `apps/mobile` (`npx eas-cli init`), whose project id
   and owner go into `app.json`.
2. A Firebase project with the Android app `com.dubgrid.mobile`: its
   `google-services.json` for the build, and its FCM V1 service account key
   uploaded to EAS credentials.
3. The App ID `com.dubgrid.mobile` with the Push Notifications capability,
   and an APNs key uploaded to EAS.
4. An EAS environment named `production` holding `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `EXPO_PUBLIC_API_BASE_URL=https://www.dubgrid.com`. A release build
   refuses http, local and LAN hosts, and the bare apex, on its
   Configuration screen.
5. The App Store Connect and Play Console app records.
6. A reviewer organization in production, never a client organization, with
   realistic staff and schedules, billing paused so it never locks, and a
   reviewer account with no two-factor and its own password. Give the
   credentials in each console's review fields, never in this file.

### App Review notes

Paste into App Store Connect (App Review Information) and the Play Console
(App access), with the reviewer's organization domain, email and password in
their own fields:

> DubGrid is employee scheduling for care facilities, sold to organizations.
> Accounts are created by each customer organization's administrator, who
> invites staff by email; the app has no sign-up. To sign in, enter the
> organization domain, then the email and password provided.
>
> Members can request deletion of their account in Profile > Security &
> sessions > Request account deletion. Because accounts belong to the
> employer's organization, the organization completes it.
>
> Subscriptions are sold per seat to organizations on the web and are not
> sold or advertised in the app (App Review Guideline 3.1.3(c)).
>
> Shift requests and schedule notes are visible only to members of the same
> invite-only organization, whose administrators manage them.
> Support: support@dubgrid.com.

### App Store privacy answers

They match `ios.privacyManifests` in `app.json`. Data is collected, linked
to the user, not used for tracking, and used only for App Functionality.

| Category     | Types                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| Contact Info | Name, Email Address, Phone Number                                            |
| Identifiers  | User ID, Device ID (the push token and the app's device identifier)          |
| User Content | Other User Content (request and schedule notes)                              |
| Diagnostics  | Other Diagnostic Data (device model, app version, server-side error reports) |

Tracking: no. The app ships no ATT prompt and no advertising SDK. Export
compliance is answered in `app.json` (`usesNonExemptEncryption: false`;
HTTPS and system cryptography only).

### Play Console answers

- **Data safety:**
  - Collected: name, email address, phone number, user IDs, device or other
    IDs, other user-generated content, and diagnostics.
  - None of it is shared; service providers acting for DubGrid are not
    sharing.
  - All of it is encrypted in transit.
  - Users can request deletion: in the app, or by emailing support.
- **Account creation:** the app does not let users create an account.
  Accounts are created by the customer organization, outside the app. So
  Google's account deletion requirement, and its deletion web link, do not
  apply.
- **Advertising ID:** no. `AD_ID` is blocked in `app.json`.
- **Payments:** the app sells nothing and links to no outside purchase.

## What the automated suite already proves

- Push registration refuses a build with no project id, and mints against the
  configured one (`push-permission.test.ts`, `usePushRegistration.test.ts`).
- A notification tap routes to its subject, including the cold-start replay,
  and listeners are removed on sign-out (`usePushResponseHandler.test.ts`).
- A deep link resolves an alert by id rather than by page
  (`mobile.test.ts`, `NotificationDetailScreen.test.tsx`).

None of that exercises Apple's or Google's delivery path, which is why the
checklist above exists.
