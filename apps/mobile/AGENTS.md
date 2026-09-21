# Mobile App Agent Instructions

Scope: `apps/mobile`, package `@dubgrid/mobile`.

Expo SDK 54 with Expo Router. File-based routes in `apps/mobile/app`.
Feature code in `apps/mobile/src`.

## Verified Commands

- Dev: `npm --workspace @dubgrid/mobile run dev`
- LAN dev: `npm --workspace @dubgrid/mobile run lan`
- Tunnel dev: `npm --workspace @dubgrid/mobile run phone`
- Web dev: `npm --workspace @dubgrid/mobile run web`
- Test: `npm --workspace @dubgrid/mobile run test`
- Typecheck: `npm --workspace @dubgrid/mobile run type-check`
- iOS: `npm --workspace @dubgrid/mobile run ios`
- Android: `npm --workspace @dubgrid/mobile run android`
- Root mobile + contracts + schedule-core tests: `npm run test:mobile`
- App icons: `npm --workspace @dubgrid/mobile run icons` (stacked wordmark, both platforms' safe zones)

First-run state is device-local storage, not DB state, so `npm run db:reset`
never clears it: `hasSeenOnboarding` (`shared/lib/session.ts`) and the cookie
consent choice (`features/consent/lib/consent.ts`). After a local reset, either
long-press the wordmark on the login screen (`__DEV__`-only: clears both, routes
back to onboarding, and re-opens the consent sheet) or run
`npm run db:reset:mobile` from the repo root, which best-effort clears app
storage on a booted Android emulator via `adb`.

## Directory Map

```
apps/mobile/
  app/                              # Expo Router file-based routes
    _layout.tsx                     # Root layout (fonts, providers, auth, consent + terms gates, ErrorBoundary)
    index.tsx                       # Entry redirect
    +not-found.tsx                  # Unmatched-route fallback
    (auth)/
      login.tsx
      forgot-password.tsx           # Native reset request (was a web hand-off)
      reset-password.tsx            # Code entry + new password
      onboarding.tsx
    (tabs)/
      _layout.tsx  _layout.android.tsx  _layout.web.tsx
      home/  people/  profile/  requests/  team/
    alerts/                         # index (mailbox list); [id] forwards to the alert's subject
    person/[id]/                    # Person detail + schedule outside the tab stack
    shift/[employeeId]/[date].tsx   # Shift detail with the request sheets
  src/
    features/
      auth/                         # Auth flow, MobileRealtimeProvider
      consent/                      # ConsentGate + TermsGate
      dashboard/                    # Admin dashboard cards, hero, drill-in screens
      notifications/
      onboarding/                   # Onboarding screens/components
      people/
      profile/
      schedule/
      shift-requests/
    shared/
      components/                   # Shared primitives (AppText/Text, Button, sheets, skeleton/, ...)
      hooks/                        # useAsyncAction, useUnsavedChangesGuard, useMobileContentState, ...
      lib/                          # env.ts, api.ts, auth-reset, errors, in-app browser
      motion/                       # useMotionPreference, usePressAnimation,
                                    #   AnimatedListItem, Collapsible
      navigation/
      providers/                    # AuthSessionProvider
      theme/                        # tokens.ts adapter + useElevation
    test/                           # Vitest shims (react-native emulation, reanimated stub, navigation)
```

## App Identifiers (High Risk)

- Scheme: `dubgridmobile`
- iOS bundle ID: `com.dubgrid.mobile`
- Android package: `com.dubgrid.mobile`
- `app.json`, `metro.config.js`, `babel.config.js`, EAS/OTA settings, native build
  config, and Expo scheme are all high-risk. Explain changes before applying.

## Deliberately Web-Only Feature Areas

Reports, billing/subscription management, the Gridmaster portal, the
permissions editor, and org-level settings panels (departments, jobs,
absence types, schedule rules, coverage, activity log) have no mobile
surface, front or backend, by design — these are admin/config-heavy
workflows that reasonably stay desktop-only. Don't treat their absence as
a gap to fill; confirm with the user before adding any of them to mobile.

## Password Reset (spans mobile + email templates)

Mobile resets in-app rather than opening the web page. The flow is
`resetPasswordForEmail` → a 6-digit code from the email → `verifyOtp({ type:
"recovery" })` → `updateUser` → `signOut({ scope: "global" })`. No deep link and
no `additional_redirect_urls` entry is involved.

- **Use `createEphemeralSupabaseClient()` for every call in this flow.**
  `verifyOtp` returns a real session; on the persistent client it lands in
  SecureStore, `AuthSessionProvider` picks it up, and `LoginScreen`'s
  `if (accessToken) return <Redirect href="/(tabs)/home" />` drops the user into
  the tab tree mid-reset with no organization session. `ResetPasswordScreen.test.tsx`
  asserts `getSupabaseClient` is never called — keep that guard.
- The code comes from `{{ .Token }}` in `supabase/templates/recovery.html`,
  generated from `apps/web/src/emails/auth/RecoveryEmail.tsx` via
  `npm --workspace @dubgrid/web run email:build`. The template keeps
  `{{ .ConfirmationURL }}` too, because web still follows the link.
- **Changing that template requires updating remote Supabase's template in the
  dashboard**; `supabase/templates/*.html` is local config only.
- The request step advances even when the address has no account
  (anti-enumeration). Only rate limiting and network failures surface inline.
- **Strength rules and match checking live in `@dubgrid/domain`
  (`packages/domain/src/password.ts`), not per-app.** Web and mobile previously
  enforced different bars from byte-duplicated rule sets. Use
  `isPasswordAcceptable` and `getPasswordMismatchError`; the latter returns null
  while the confirmation is empty, so the warning appears as the user diverges
  rather than on submit.

## Gates and Boundaries

Three things wrap the authed app in `app/_layout.tsx`, in this order:

- **`ConsentGate`** — cookie/analytics consent. Keep `CONSENT_VERSION` in
  lockstep with web's `CookieConsent.tsx`.
- **`TermsGate`** — blocks until the user has accepted `CURRENT_TERMS_VERSION`
  (`@dubgrid/domain`). Web enforces this by redirecting to `/accept-terms` at
  login; mobile signs in through its own endpoint, so it gates in-place off the
  `acceptedCurrentTerms` flag in bootstrap. That flag defaults to `true` so a
  stale server response can never lock anyone out. The sheet covers the whole
  app, so it must always offer **Sign out** alongside Accept — declining has to
  be possible, and there is no screen underneath to escape to.
- **`ErrorBoundary`** — exported from `app/_layout.tsx` and from
  `app/(tabs)/_layout.tsx`, both rendering `RouteErrorScreen`. Without these a
  single render throw takes the whole app down. There is no crash-reporting SDK
  on mobile.

`useTabsGate` is the only auth guard, and it wraps `(tabs)` only. The web tab
layout (`_layout.web.tsx`) must call it rather than re-deriving the rules —
a second copy silently drifted once.

Sign-out must revoke this device's push token **before** dropping the session
(`disablePushForCurrentDevice` in `shared/lib/auth-reset.ts`), or the phone
keeps receiving the previous user's notifications.

The notification permission is asked for once, with context, on the last slide
of the first-run tour (`features/onboarding`, via
`features/notifications/lib/push-permission.ts`). That slide's
`NotificationReasons` card names the categories Profile > Notifications
controls; keep the two in step. `usePushRegistration`'s
automatic registration after sign-in never shows the system prompt on its own:
it registers a device that already said yes, so someone who answered "Not now"
on the tour is not met by the bare OS dialog on the home screen. The switch in
Profile > Notifications is the only other place that prompts.

## Text Scaling

Every text in the app goes through `shared/components/Text` (and `AppText` on
top of it); a lint rule refuses the raw `react-native` `Text` import. It caps the
OS text-size setting at `MAX_FONT_SCALE` (1.5x) and bounds the rendered size at
`MAX_TEXT_SIZE` (32pt) read from the style's `fontSize`, so a headline never
outgrows its row. Two `fit` tiers keep controls in shape, always one line and
truncating rather than wrapping:

- `fit="fixed"` renders at the designed size whatever the OS setting: header
  titles and the labels beside them, sheet titles, the tab bar, avatar initials,
  date tiles, count dots, the wordmark. Chrome holds still while the page grows.
- `fit="compact"` grows to `MAX_FONT_SCALE_COMPACT` (1.2x) and stops: button,
  pill, chip, badge, segment, and tab labels.

Reading text keeps the full multiplier. Padding and control geometry never
derive from the font scale. Shrink-to-fit (`adjustsFontSizeToFit`) is banned:
React Native's new architecture ignores `minimumFontScale` and fits against the
container's height, which is what left button labels tiny beside large copy. At
a raised scale, stack squeezed columns (a role pill under the name) rather than
`flexWrap` a pill.

## Platform Rules

- Do not use browser-only APIs (`window`, `document`, `localStorage`) in native
  runtime code unless guarded with `Platform.OS` and covered by tests.
- Use Expo or React Native APIs for native behavior.
- Use `expo-secure-store` for native persisted secrets/session data.
- Open DubGrid web pages (policies, billing) with `openInAppBrowser`
  (`shared/lib/inAppBrowser.ts`), not `Linking.openURL` — reading a policy
  should not evict the user from the app. `Linking` stays for `tel:`/`mailto:`
  and anything genuinely meant to hand off to another app.
- Guard platform-specific code with `Platform.OS` or existing helpers.
- Editable fields must use `mobileInputText()`. It names the requested Inter
  face only after Expo reports that face loaded and otherwise returns a bare
  system `fontWeight`; an unknown family can make Android `EditText`
  non-interactive. Keep `maxFontSizeMultiplier={MAX_FONT_SCALE}` on bounded
  fields so accessibility scaling does not clip editable content or a suffix.
- Prefer the cross-platform `autoComplete` hint on editable fields. Do not pair
  it with `textContentType`: React Native gives the iOS-only prop precedence,
  which makes the autofill contract differ by platform.
- When a conditional auth field should receive focus as it mounts, use its
  native `autoFocus` prop. Do not call `focus()` in the same tick as changing
  the auth stage; iOS can preserve the prior text metrics and draw the
  placeholder at the wrong size until the user types.
- `<Screen>`'s keyboard insetting costs a visible jump on an iOS
  `headerLargeTitle` screen: RN writes `contentInset`/`contentOffset` when the
  keyboard opens, UIKit re-evaluates the large title, and it collapses under
  the finger. Pass `adjustsForKeyboard={false}` whenever the screen's only
  input sits at the top (a `<SearchBar>` above a list) — nothing there needed
  lifting off the keyboard, and `UIScrollView` does no first-responder
  scrolling of its own, so the page then holds still. Keep it on for forms.

## API and Contract Rules

- Backend reached via `EXPO_PUBLIC_API_BASE_URL`. Never hardcode environment hosts.
- Keep request/response payloads aligned with `@dubgrid/contracts` and
  `@dubgrid/api-client`.
- When mobile API contract changes, run `npm run test:mobile` AND check web mobile routes.

## Secrets

- `EXPO_PUBLIC_*` is bundled and user-visible. Never put secrets there.
- Use `apps/mobile/.env.example` for variable names only.
- Do not read or print `apps/mobile/.env.local`.

## Design System

Tokens live in `packages/design-tokens` with a `mobile*` prefix and are
re-exported through `src/shared/theme/tokens.ts`. That adapter is the only
import path screens should use. **The package is shared with `apps/web`** — add
`mobile*`-prefixed groups rather than changing existing tokens.

### Reach for these before inventing anything

| Need                        | Use                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Any text                    | `<AppText variant tone>` — carries a theme-correct color by default                                                                |
| Any button                  | `<Button>` — solid fill, no border, squircle, sizes `sm`/`md`/`lg`, `iconOnly`                                                     |
| A pressable list row        | `<PressableRow>` — background highlight on iOS, ripple on Android                                                                  |
| A scrolling tab strip       | `<ScrollableTabStrip>` — pill tabs, optional count badges, scrolls the active tab into view                                        |
| A text action in the bar    | `createHeaderTextAction()` — `HeaderTextButton` in `headerRight`; iOS 26 wraps it in Liquid Glass itself                           |
| A pressable that is neither | `usePressAnimation()`                                                                                                              |
| Status/metadata/filter pill | `<Chip>`                                                                                                                           |
| Segmented toggle            | `<SegmentedControl>` — sliding thumb, optional count badges (same pill as the strip's)                                             |
| Shadow                      | `mobileElevation(level, isDark)` or `useElevation(level)`                                                                          |
| Duration / spring / easing  | `useMotionPreference()` — never a raw number                                                                                       |
| Soft brand wash             | `<GradientBackdrop kind>`                                                                                                          |
| List entrance               | `<AnimatedListItem index>`                                                                                                         |
| Show/hide a block           | `<Collapsible open>`                                                                                                               |
| A short task or selection   | `<BottomSheetModal>`; use `<FullPageSheet>` for a task that needs the whole page (the swap browser), a page for multi-step editing |
| A sheet's title             | `<SheetHeader title subtitle>` in the `header` slot — never a title in the body                                                    |
| A consequential decision    | `<ConfirmationModal>`; cancel left, confirm right; always side by side                                                             |
| Auth screen frame           | `<AuthShell>` + `<AuthField>`                                                                                                      |
| An empty state              | `<EmptyStateCard iconName>` — centred; `compact` inside a card adds its panel                                                      |
| Loading placeholder         | a `*Skeleton` colocated with the screen, built on `shared/components/skeleton`                                                     |
| Which state a screen is in  | `useMobileContentState({ hasData, isLoading, error, isEmpty })`                                                                    |
| Stopping a double-tap       | `useAsyncAction()` — already inside `<Button>`, `<PressableRow>`, `<ConfirmationModal>`                                            |

### The metric contract

Every number on a mobile screen comes from a token, and the tokens are the
whole vocabulary. `design/no-raw-mobile-metrics` fails lint on a raw
`fontSize` or an off-ramp spacing literal; a 1pt optical nudge and a value
computed from tokens (`mobileSpace["5xl"] + mobileSpace["2xl"]`) both pass.

| Metric          | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing         | `mobileSpace`: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48. The 2 / 6 / 10 / 14 sub-grid is banned; round, don't add                                                                                                                                                                                                                                                                                                                                             |
| Type            | `mobileText` only: `display` 28 (one headline on a headerless screen), `screenTitle` 22, `title` 20 (card and section headings over their own surface), `sectionTitle` 16, `cardTitle` 16, `input` 16 (editable text, paired with `mobileInputText()` for the family), `rowTitle` 15, `body` 14, `meta` 13, `label`/`caption` 12, `badge` 11, `micro` 10 (non-interactive badges only). A different weight goes through `mobileTextWeighted(variant, weight)` |
| Control height  | `mobileControl`: `sm` 36 (pads its target with `hitSlop`), `md` 44, `lg` 52. Buttons, fields, search, segmented and icon controls share it                                                                                                                                                                                                                                                                                                                    |
| List row        | `mobileListRow`: min 44, 12 vertical padding, 4 between title and caption; `PressableRow` carries the floor                                                                                                                                                                                                                                                                                                                                                   |
| Page gutter     | `getScreenGutter()`: 20 on iOS (the large-title inset), 16 on Android                                                                                                                                                                                                                                                                                                                                                                                         |
| Section rhythm  | `mobileSpacing.sectionGap` 24 between sections; a card heading sits 8 above its surface                                                                                                                                                                                                                                                                                                                                                                       |
| Card surface    | `getCardSurfaceStyle`: 16 padding, 12 internal gap, `card` radius; the shadow is the only edge in light mode                                                                                                                                                                                                                                                                                                                                                  |
| Badge / chip    | Fill only, never a stroke; 8 × 4 padding; one badge per row, secondary facts go in `caption`                                                                                                                                                                                                                                                                                                                                                                  |
| Edges           | One separator per surface: a stroke _or_ a shadow, never both (icon controls, badges, cards all follow this)                                                                                                                                                                                                                                                                                                                                                  |
| Icons           | Ionicons: a glyph that names a thing (calendar, key, location, a tab) is the `-outline` variant; a glyph that states a status (`checkmark-circle`, `alert-circle`, `information-circle`, `close-circle`, `warning`, `shield-checkmark`) is filled. A checkmark is `checkmark`, never the double `checkmark-done`                                                                                                                                              |
| Avatar initials | `mobileAvatarText(diameter)` sets the size from the circle; never add `adjustsFontSizeToFit` to initials, which shrank "CH" to a fraction of its circle on iOS                                                                                                                                                                                                                                                                                                |
| Dashboard       | No pills: a status is a tone-coloured word, a count is a figure, a type is a coloured word in the caption; a card's affordance is the header-right "See all ›", shown only when the card holds rows back from its three-row preview                                                                                                                                                                                                                           |
| Choosing        | A set of choices is a grouped list (`ProfileChoiceGroup`): a caption over a framed list of 44pt rows, a 22pt mark at the end that fills brand with a check. Pick-many rows wear a ring when idle; pick-one (`selection="single"`) rows show nothing until chosen. Never a wrapped cloud of chips (they ragged, truncated long names and hid which groups took one choice), and not a dropdown row with a picker sheet (tried, rejected on sight)              |

### Double-tap

An action that fires a request must not run twice when the control is
double-tapped. **A `useState` busy flag does not achieve that on its own**: it
only disables the pressable after React re-renders, and a second tap inside
that window still gets through.

`useAsyncAction()` (`shared/hooks/useAsyncAction.ts`) is the fix, and its latch
is a `useRef` read and set synchronously on the first press, so re-entry is
blocked before any render. The `isRunning` it returns exists only to drive the
spinner. **Do not "simplify" that ref into state** — that is the bug.

`<Button>`, `<PressableRow>` and `<ConfirmationModal>` already wrap their
handler in it, so screens usually need nothing. The one thing a screen must do
is **return** its promise rather than fire it into a call the primitive cannot
await — a `mutation.mutate(...)` returns `undefined`, so wrap it:

```ts
return new Promise<void>((resolve) => {
  mutation.mutate(input, {
    onSettled: () => {
      setPending(null);
      resolve();
    },
  });
});
```

Because a synchronous handler returns `undefined`, the hook is a no-op for one:
a plain toggle still fires on every tap. `loading` remains a prop for a pending
flag that lives outside the control, and an explicit `loading` wins over the
internal one. A busy `<Button>` shows its spinner with the label unchanged:
there is no `loadingLabel` prop (it was removed on purpose), so never write
`pending ? "Approving" : "Approve"`. `request-action-feedback.ts` carries each
request action's confirmation copy and success toast, not a busy label.

### Modals and sheets

Choose the surface by the user's task:

- **ConfirmationModal:** a short consequence and an explicit action. Use for
  discarded edits, access changes, and significant side effects. Do not put
  editable forms or competing configuration choices inside a confirmation.
  A request the other party still has to accept (a pickup offer, a swap) is
  not one: its Submit is the commitment. A call-off is, since it takes the
  requester off the roster.
- **FullPageSheet:** the platform's card sheet (iOS `pageSheet`, Android
  full-screen slide) with a header, Close, scrolling body and pinned footer,
  for a task that needs the page but is still modal to the screen beneath it.
  Same `onDismiss` funnel and one-task-sheet rule as `BottomSheetModal`.
- **BottomSheetModal:** contextual choices, filters, short forms, and compact
  review tasks. Use a page for long or multi-step workflows.
- **Ordinary saves:** save directly and show progress and success. Ask again
  only when the save has a significant additional consequence.
- **Layering:** one task sheet and at most one confirmation. Both primitives
  register their actual kind. Replace one task with the next using
  `useModalHandoff`; do not stack task sheets. Only required consent and app
  lock use `presentationKind="gate"` to interrupt an existing task.
- **Confirmation behavior:** backdrop and Android back mean Cancel while idle.
  Pending work blocks every dismissal path. Keep request failures in the
  active surface via `error`, rather than a toast or an obscured parent.
- **A sheet's close button stays mounted while the sheet is busy.** A
  `dismissDisabled` task sheet shows it disabled at reduced opacity rather than
  unmounting it; only a `presentationKind="gate"` sheet has no close button.
  It renders as a sibling of the pan `GestureDetector`, never inside it, so a
  slidy thumb tap cannot be swallowed as the start of a drag.
- **Dirty means work the user cannot redo in one tap.** A single radio or list
  choice does not arm the discard confirmation; typed text or a selection that
  took browsing to reach (a swap target) does. The request sheet's guard splits
  `onDiscard` (reset selections) from `onClose` (drop the mode) for the
  sequencing reason `useModalHandoff` documents.
  Use specific sentence-case action labels and an action-specific `iconName`
  when helpful; danger does not imply a trash icon. Horizontal actions put
  Cancel left and Confirm right, always side by side. Long labels wrap inside
  their equal-width buttons. Motion is restrained.

Sheets have a grabber, 40pt top corners, and extend to the bottom edge.

- **A sheet that holds one list gives it no caption.** The management-access
  and app-access pickers are `ProfileChoiceGroup` / `SelectionSection` lists
  under a `<SheetHeader>` that already names them; a small "Access level" or
  "Management Departments" label between the two said nothing. Both accept an
  omitted `label`. Two lists on one sheet (a fresh invitation's role and
  departments) keep theirs, since then the captions tell them apart.
- **Adding a person is a sheet, whichever kind.** The People tab's one Add
  button asks scheduled or management (`AddPersonKindSheet`, handed off with
  `useModalHandoff`) and opens `AddPersonSheet` or
  `ManagementUserInviteSheet`. An access level offered as part of an
  invitation is `OrgRoleChoice`, the same described radio list as the App
  access sheet, which hides Super Admin unless the inviter holds it.
- **A decision that takes a note is a sheet, not a confirmation.** The
  Requests tab's Approve/Reject opens a `BottomSheetModal` with the note
  field; `ConfirmationModal` must never hold an editable field.
- **Titles go in the `header` slot** via `<SheetHeader>`, which puts them in the
  drag region. A title rendered in the body scrolls out of view and takes its
  drag target with it.
- **Every sheet shows the grabber and answers the drag, `dismissDisabled` ones
  included.** There is no `showGrabber` prop to opt out of. A blocking sheet
  follows the finger against rubber-band resistance (`resistSheetOverdrag`, max
  32pt) and settles back rather than sitting inert; an _upward_ drag gets that
  same resistance on every sheet, since none of them expand. Only a downward drag
  on a dismissable sheet closes anything. A sheet that ignores the gesture reads
  as a frozen app, which is why hiding the handle was the wrong answer.
- **On a `scrollable` sheet the list gets the drag only while it can still move.**
  `useSheetDragToDismiss` decides per frame from the scroll position and the
  measured content/viewport (`onScrollContentSizeChange` + `onScrollViewLayout`,
  both wired to the sheet's `ScrollView`), then rebases so the handover is
  continuous: past the top the sheet drags down, past the bottom it stretches up,
  and a short list that cannot scroll at all hands over both. Measure rather than
  wait for a scroll event — a sheet whose content never fills it never fires one.
  The list's own overscroll stays off (`bounces` / `overScrollMode`) so only one
  of the two effects ever answers a drag.
- **Action groups use `<ActionButtons>`; sheet footers use `<SheetActions>`.**
  Two buttons always share one equal-width row. With three or more, the first
  two share a row and each remaining button is full width below them. A single
  button stays full width. Supporting actions come first and the primary
  decision comes last, so pairs read secondary-left/primary-right and stacks
  read secondary-top/primary-bottom. Pass the primary decision through the
  group's `primaryAction` prop instead of relying on caller order. Keep errors
  or supporting text outside the action group. Conditional actions and
  fragments count by the buttons actually shown. Do not switch pairs to a
  vertical layout on narrow screens or at larger text sizes; let labels wrap
  within each button.
- **Public auth actions use `<AuthActions>` instead.** Their one primary action
  is a centered full-width row first, with help/navigation links centered
  underneath. This keeps `Continue` and `Sign In` visually dominant and stops
  a long help label from being compressed beside them.
- **A person page keeps Call and Email under the hero, Edit in the bar, and
  everything else at the foot.** `ProfileQuickActions` holds exactly the
  contact pair as `ProfileQuickAction` pills (the `plain` button with its
  glyph and its name; a missing number or address dims the pill rather than
  dropping it, so the pair keeps its shape). Edit is about the page rather
  than the person, so it is a text-only `createHeaderTextAction` in the
  navigation bar, cleared while an inline editor's footer owns Save and
  Cancel. It rides in `headerRight`, which iOS 26 wraps in the same Liquid
  Glass capsule as the back button; native-stack's `unstable_headerRightItems`
  would be the textbook route but comes up as an empty capsule on the pinned
  react-native-screens 4.17 (it sends `title`, screens 4.17 reads `label`).
  The management actions (invitation, schedule, management access, status)
  end the page in `ProfileActionStack`, full width one under the other, in
  web's staff-panel order: access first, status last. Keep the pair out of
  `ActionButtons`; the secondary-first/primary-last rule is for bottom
  content, form, and sheet actions.
- **`backdrop="cover"`** paints out the app behind the sheet instead of dimming
  it. Only the app lock wants this, and for it the choice is a security one.
- **A sheet holding unsaved input must guard its dismissal.** Route `onDismiss`
  into a `<ConfirmationModal>` and leave `visible` true; a dragged sheet settles
  back into place on its own (`useSheetDragToDismiss` re-runs its position
  effect after every dismissal attempt, not just when `visible` flips).
- Render that confirmation as a **sibling** of the sheet it guards, never nested
  inside it — a `Modal` inside a `Modal` does not reliably present on iOS.
- **The `<Modal>` keeps `statusBarTranslucent` _and_ `navigationBarTranslucent`,
  as a pair.** A modal is its own Android window and does not inherit the app's
  edge-to-edge treatment: React Native reads `statusBarTranslucent` to decide
  whether to set `fitsSystemWindows` on the frame it wraps the React root in, so
  with the props off the sheet **and its backdrop** stop a navigation bar short
  of the bottom edge and the undimmed app shows through the strip. Setting only
  `navigationBarTranslucent` is the worse version of the same bug (React Native
  warns about it) — the window goes edge-to-edge while the root stays inset, and
  the gap grows to the full status-plus-navigation bar. Neither prop does
  anything on iOS.
- **Never wrap the sheet in a `KeyboardAvoidingView`.** It lifts itself over the
  keyboard with an animated `marginBottom` driven by
  `useReanimatedKeyboardAnimation()`, and **only the sheet reads it** — a
  `KeyboardAvoidingView` would take the backdrop up too and leave a strip of
  undimmed app along the bottom edge. That height is negative (the library means
  it for `translateY`), so the sheet negates it.
- **Keyboard geometry has exactly one owner: `<KeyboardProvider>` in
  `app/_layout.tsx`.** `Screen`, `AuthShell` and the sheet all read from it.
  Do not add a `KeyboardAvoidingView`, a `Keyboard.addListener` inset, or an
  `automaticallyAdjustKeyboardInsets` of your own; those were the three
  mechanisms this replaced, and none of them did anything on Android. Keep the
  lift on the UI thread — a `useState` fed into `StyleSheet.create` rebuilds the
  whole sheet stylesheet per keyboard event and lands as an un-animated jump
  that races the keyboard's own slide, which is what read as jitter.
- **The sheet's `ScrollView` sets `keyboardShouldPersistTaps="handled"`.**
  Without it the default is `"never"`, and the first tap on a sheet's submit
  button while a field is focused is swallowed dismissing the keyboard.

### Unsaved changes

Nothing holding user input may be thrown away silently. There is one guard for
this — never hand-roll the `hasUnsavedChanges` + `showDiscardConfirmation` +
`close()` triad again, which had drifted across five copies before it was
shared.

- **`useUnsavedChangesGuard()`** owns the decision. Point the sheet's
  `onDismiss` _and_ its Cancel button at `guard.requestClose`, and render
  `<ConfirmationModal {...guard.confirmationProps} />` as a sibling. Its
  `onDiscard` runs on **every** exit through the guard, clean or dirty: it is
  the reset, not a side effect of confirming.
- **`useNavigationDiscardGuard(guard)`** adds back navigation to that same
  guard, for a screen with an inline editor. One guard, one confirmation, three
  triggers — a second guard would mean two modals racing. It covers stack
  removal only: `router.replace`, `<Redirect>`, tab switches and deep links do
  not fire `beforeRemove`.
- **Keep `isDirty` tight** (`editing && hasChanges`, not `editing`). Every
  detail screen sets `fullScreenGestureEnabled`, so on iOS the whole surface is
  a back-swipe target and a loose flag interrupts ordinary navigation.
- **Compute dirtiness once, at module scope**, and pass it into the edit panel
  (`profileDraftHasChanges`, `personDraftHasChanges`). Computed inside the panel
  the screen can't see it; computed twice, Cancel and the back button disagree
  about whether to ask.
- **Never route a screen's Cancel through `onClose` when that close is a
  navigation.** `router.back()` re-enters this same hook and asks again. Let the
  button call `router.back()` plainly and let the nav guard intercept it once.
- **Disarm the guard once a save succeeds** (`disabled: isPending || isSuccess`)
  where the success handler navigates away with the fields still filled in.
- Never set `headerBackButtonMenuEnabled: true` on a guarded screen —
  react-navigation warns, and native-stack forces it off while removal is
  prevented.
- Tests reach the guard through `src/test/shims/react-navigation-native`:
  `pressBack()` returns whether it was prevented, `navigatedActions` records
  what got through. Assert the action **lands** after Discard —
  `usePreventRemove` reads the render-time flag, so a guard that dispatches
  before React commits it vetoes its own exit and the back button dies silently.

### Skeletons

Primitives live in `src/shared/components/skeleton`: `SkeletonBlock`,
`SkeletonCircle`, `SkeletonIcon`, `SkeletonLine`, `SkeletonPill`,
`SkeletonCardSurface`, `SkeletonGroup`. Compositions are per screen, colocated
in that feature's `components/` folder. Three rules:

- **A skeleton reuses the real screen's own styles**, not a copy of its numbers
  (`ScheduleMeSkeleton` imports `scheduleScreenStyles`, `SkeletonCardSurface`
  shares `getCardSurfaceStyle` with `Card`). A copy drifts the first time a
  padding changes and nothing catches it. Use `SkeletonLine variant="body"`
  rather than a hardcoded height: it sizes the bar from the typography token
  and reserves the token's full line height, so no swap shifts the layout.
- **One skeleton per screen, shown once.** Every query the first paint needs
  folds into that screen's single `contentState` — including its `hasData`, or
  the gate clears while a folded query is still in flight. A nested skeleton
  inside a section is always wrong: it paints a second wave _after_ the page
  skeleton has already gone. A parent that picks between two screens must not
  guess while it is still loading either: `app/(tabs)/home/index.tsx` used to
  fall through to the personal schedule until bootstrap named the role, so an
  admin got that screen's skeleton and then the dashboard's.
- **Whatever appears in `isLoading` must appear in `hasData` too.** They are
  the two halves of one question, and the gate leaves `loading` as soon as
  _either_ says it can. A query in only `isLoading` clears the skeleton with
  its own data still missing, and whatever the screen derives from it renders
  wrong for a frame — `PersonDetailScreen` flashed "Person not found" this way,
  because the person is gated on a bootstrap permission.
- **Nothing the render branches on may be synced in an effect.** Effects run
  after the paint, so an effect-derived value is one frame behind the data it
  mirrors, and the branch above it paints the wrong state first. Derive during
  render, or adjust state during render with the stored-previous-value pattern
  (`PersonDetailScreen`'s edit draft). This is the React rule in the root
  `CLAUDE.md`, and a terminal state flashing before content is what breaking it
  looks like.
- **Never branch on a raw `isLoading`.** Go through `useMobileContentState`
  and render on `showSkeleton` (or `useSkeletonGate` where there is no error or
  empty state to model). Its `hasData` means "the query resolved"; pass
  `isEmpty` separately on any screen whose query key carries a search or filter.
- **A skeleton is drawn for this viewer.** Bootstrap is cached from app start,
  so the permissions that shape a page are known before its data. Pass them in
  (`showActions` and `showShiftmates` on `ShiftDetailSkeleton`; per-list
  `sections` and a `quickActions` count on `ProfileSkeleton`) rather than
  drawing the manager's page for everyone: a colleague's page promised three
  lists and three actions and delivered one list. When the permission is
  unknown, the smaller page is the guess. A surface the placeholder cannot
  paint, the Home hero's gradient with white text on it, loads as one block.

Animation is one app-wide clock (`useSkeletonWave`, a module-level
`makeMutable`) driving a single band of light across the window, so every block
sweeps in phase. It is off entirely under reduce motion.

### Rules

- **Buttons are solid, borderless, and squircle-shaped; chips stay pills.** Every
  tone. Do not add `borderWidth` back.
- **Soft control fills come from `controlNeutralBg` / `controlSecondaryBg`,
  not `surfaceSecondary` / `brandSoft`.** The shared tokens measure ~1.04:1
  against the page, which is not a perceivable edge for a borderless control.
  `controlSecondaryFg` pairs with the secondary fill: the standard `brand` blue
  on it measures 4.02:1 and fails AA. `src/shared/theme/contrast.test.ts` pins
  all of this.
- **`iconOnly` buttons must not carry vertical padding.** The fixed width/height
  is the box; padding on top of it squeezes the content below the glyph's line
  height and `overflow: "hidden"` clips it.
- **`EmptyStateCard` is centred, and `compact` is what earns the centring.**
  Every variant centres its icon badge over its copy, and that badge is always a
  **circle** — the rounded square is the card _header's_ shape (`cardIconFrame`),
  where it reads as chrome rather than as content. A full-page empty gets a 60pt
  `brandSoft`/`brandBorder` circle with a brand glyph; `compact` gets a 48pt
  circle in the card's own `surface`, lifted with `mobileElevation("raised")` and
  carrying a **muted** glyph, so it stays a quiet placeholder inside an otherwise
  busy dashboard rather than competing with the card's header.
  `iconName` is **required**: it used to default to `sparkles-outline`, so every
  caller that omitted an icon quietly shipped the four-point "AI" sparkle.
  The part that is easy to get wrong is the panel. `compact` renders inside a
  container with its own left-aligned header (`Card`, `ProfileSection`) and wraps
  itself in a `surfaceSecondary` panel at `mobileRadii.control` — one step tighter
  than the card's radius, so it nests rather than traces. That panel is
  load-bearing, not decoration: centred copy sitting loose under a left-aligned
  card header, in place of left-aligned rows, reads as misaligned, and bounding it
  is what makes the centring deliberate. `fillScreen` and the plain variant own
  the viewport with nothing to align against, so they take **no** panel — a small
  tinted box stranded mid-screen reads as a stray card. Empty state inside a
  card ⇒ `compact`.
- **`fillScreen` states stay in the scroll view; only skeletons leave it.**
  `Screen`'s `contentContainerStyle` carries `flexGrow: 1`, so a `flex: 1` child
  has the viewport's leftover space to claim without dropping out of scroll
  mode. Reach for `scrollEnabled={false}` for a **skeleton** and nothing else: a
  placeholder should not scroll and has nothing to refresh. Using it for an
  error or empty state costs two things — an iOS `headerLargeTitle` has nothing
  left to collapse against, so it sits permanently expanded and pushes the page
  down, and pull-to-refresh needs a scroll gesture to hang off, so it disappears
  from exactly the screens most likely to want a retry. (`AdminHomeScreen`'s
  empty state told the user to "pull to refresh" while doing this.) The lock
  must never change what is mounted: `Screen` keeps its `RefreshControl` in
  place and disarms it, because on iOS that control is the scroll view's first
  child and dropping it remounted the whole page, tearing down any sheet
  presented from it. A screen whose query re-keys while a sheet is up (Shift
  Detail widening the team range for Swap) keeps the previous data with
  `keepPreviousDataForMobileIdentity` rather than falling back to `loading`.
- **A page-owning empty or error state sits above centre, not dead centre.**
  `fill-screen-anchor` owns the ratio for both `EmptyStateCard` and
  `StatusBanner`, as two flex spacers rather than a fixed offset so it lands at
  the same fraction on every screen size. Centring in _all_ the leftover space
  marooned the message far below the filter row it belongs to.
- **Decorative "AI" iconography is lint-enforced out of the codebase.** The
  `design/no-decorative-ai-icons` rule fails the build on `sparkles*`, lucide
  `Sparkle`/`Wand*`, and the sparkle/wand emoji. It carries its own `files`
  globs because **nothing under `apps/mobile/app/` is otherwise linted** — those
  route files match no other config block's globs, so ESLint skips them
  entirely.
- **`fullWidth` defaults to true for text buttons.** A button inside a row that
  positions with `alignItems` needs `fullWidth={false}`, because
  `alignSelf: "stretch"` on the child wins.
- **Cards are borderless in light mode with `mobileElevation("card")`, and keep
  the hairline `borderSubtle` in dark mode** — a shadow is invisible against a
  near-black page, so the edge is what separates card from background.
- **Never set `fontWeight` next to a registered Inter `fontFamily`, and outside
  `mobileInputText()` never set `fontWeight` without a family.** Weight on
  ordinary mobile text is carried entirely by the family name.
  Inter loads as four single-weight files, and `expo-font` registers each
  under its own family at style NORMAL only, so the two mistakes fail in
  opposite directions and both land on the system font on Android:
  - `fontFamily` + `fontWeight: "600"` — Android asks that one-face family for a
    bold face, finds none and no `Inter_600SemiBold_bold` asset to load, and
    falls back to **Roboto**. Only 400 escapes, since it maps to the NORMAL face
    that is really there. iOS resolves the family either way, so an iOS build
    and the jsdom suite both look fine while Android ships the wrong typeface.
  - `fontWeight` alone, no family — nothing ever pointed at Inter, so it is
    Roboto at that weight on both platforms.

  So: spread a `mobileText` token, or `mobileTextWeighted(variant, weight)` for
  a different weight, or name a `mobileTypography.fontFamily.*` alias directly
  when there is no size to inherit (a nested `<Text>`, a `headerTitleStyle`, a
  native tab `labelStyle`). `mobileText` tokens carry no
  `fontWeight` at all, and `tokens.test.ts` asserts they never regain one.
  The deliberate editable-field exception is `mobileInputText()`: it uses the
  named Inter face after loading succeeds, then falls back to a bare
  `fontWeight` and the system font before or after a load failure. DM Sans is
  reserved for `DubGridWordmark` and its startup font load. Apply
  `mobileTabularText` only to operational dates, times, hours, counts, and
  schedule figures; ordinary prose keeps proportional numerals.

- **Route every duration through `useMotionPreference().d()`.** It returns 0
  when the OS reduce-motion setting is on, which is what makes that setting
  apply app-wide from one place.
- **Call `d`/`spring`/`timing` during render, never inside a worklet.** They are
  plain functions, and Reanimated serializes a captured non-worklet function as
  a remote-function _object_ — so `useAnimatedStyle(() => ({ opacity:
withTiming(1, timing("emphasized", 200)) }))` throws `timing is not a function
(it is Object)` on the UI thread and takes the whole app down. Resolve the
  config first (`useMemo`, since it returns a fresh object) and let the worklet
  close over the value. The unit tests cannot catch this: the harness stubs
  Reanimated, so worklets run as ordinary JS and the call succeeds.
- **iOS scales on press; Android does not.** Material's ripple _is_ the state
  layer, and scaling on top of it reads as a rendering bug. `usePressAnimation`
  already handles this — don't add a scale on Android.
- **There is no SVG or blur dependency, deliberately.** `react-native-svg` is a
  native module whose `src/utils/fetchData.ts` imports `buffer` without
  declaring it, so Metro fails to resolve it; `expo-blur` is iOS-only anyway
  (Android's `dimezisBlurView` snapshots and blurs every frame and janks on
  mid-range devices). Vector art is built from views plus
  `expo-linear-gradient`; frosted surfaces use `surface` + elevation. Adding
  either back means a dev-client rebuild, and `react-native-svg` also needs
  `buffer` installed explicitly.
- **Android `elevation` needs an opaque background** and reorders sibling z
  order. Never apply a level to a transparent wrapper.
- Style factories that use elevation take `(mobileColors, isDark)`; keep the
  `createStyles` + `useMemo` idiom.
- **Never put `flex: 1` on a child of an auto-width row** (`alignSelf:
"flex-start"` / `"center"`). Yoga collapses it to zero width and the control
  renders empty. Measure with `onLayout` instead — that is what
  `SegmentedControl` and `ScrollableTabStrip` do, and both had to be fixed after
  shipping this exact bug.

## UI Rules

- Follow existing screen/component patterns in `src/features` and `src/shared`.
- Preserve accessibility labels, touch targets (minimum 44pt), loading/error states,
  and offline/network handling.
- Regular users see directory facts about colleagues, nothing more: the person
  detail hides employment, account, and contact sections and the access pill for
  a viewer without employee-details permission, and the API redacts the fields.
  Who published a shift is withheld from a viewer who cannot open publish history.
- `react-native-screens` is pinned to 4.17.x above Expo SDK 54's own pin for the
  iOS 26 native back button (upstream #3294); it is excluded from `expo install
--check` on purpose and needs a dev-client rebuild. Never draw a JS back button
  on iOS: the glass capsule double-wraps it.
- Use existing shared primitives before adding new components.
- Avoid layout changes outside the requested screen or component.

## Test Harness Gotchas

- **Native modules are aliased to shims in `vitest.config.mts`**, not mocked per
  test. A new native dependency needs a shim there or every file that
  transitively imports it fails to collect.
- **`src/test/reanimated-stub.tsx` is an allowlist.** A Reanimated API it does
  not export is `undefined` at import time in every test that reaches it. Add
  the export before using the API.
- **`src/test/native.tsx` is a partial react-native emulation** that most screen
  tests swap in via `vi.mock("react-native", …)`. Vitest's mock proxy _throws_ on
  accessing an export it lacks, so only wrap primitives that module also
  provides.
- **The `style` prop is dropped before reaching the DOM.** Styles are not
  assertable, which makes visual change cheap but means style logic worth
  pinning has to be extracted as a pure function (see `getTextToneColors`).
- **`npm test` does not rebuild `packages/`.** Run `npm run build:packages` from
  the repo root after any token change or you will chase phantom failures.

## Verification

- UI, navigation, or state changes: `npm --workspace @dubgrid/mobile run test`.
- TypeScript or shared-package changes: `npm --workspace @dubgrid/mobile run type-check`.
- Mobile API contract changes: `npm run test:mobile` + relevant web mobile API tests.
