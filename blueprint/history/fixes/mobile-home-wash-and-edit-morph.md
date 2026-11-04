# Fix: Home's gradients are back, and Edit turns into the checkmark cleanly

**Type:** Fix
**Status:** verified
**Branch:** `fix/mobile-home-wash`

## The problem

The owner asked for two things on 2026-11-04:

- Bring back Home's gradients on the phone. The native sweep (#267) had
  turned off the page washes there: the coverage wash behind admin Home and
  the aurora behind the staff Home. The hero card kept its gradient.
- On Profile, tapping Edit stretched the bar's Edit into a long pill before it
  became the editor's checkmark.

## The fix

- Admin Home draws its coverage wash and the staff Home its aurora on every
  platform again; the team schedule stays plain.
- Edit is a native bar item on iOS (`HeaderTextBarAction`) on Profile and the
  person page, now that react-native-screens is 4.26, where a custom view
  wrapped in a bar item was used before. Android keeps its Material text
  action.
- Profile details adds its bar actions once its push has finished
  (`usePushSettled`, with a 600 ms fallback). Added during the push, iOS 26
  morphed the plain Edit into the filled checkmark through a wide pill; added
  after, Edit fades with the push and the checkmark appears.
- The editor's checkmark starts as the system symbol until its drawn image is
  ready, and drawn bar icons are kept after their first use.

## Evidence

- Mobile: all 1,585 tests pass, type-check and lint clean. New tests for the
  native bar item and `usePushSettled`.
- iOS Simulator: screenshots of both Home views with the wash; frame-by-frame
  recordings of Profile's Edit before (wide pill) and after (fade, then the
  round checkmark).
- Not fixed: the person page, whose editor opens in place, still shows one
  frame of a wider empty capsule before its checkmark. Not checked on Android
  or a physical phone.

## Also in this fix (owner, same day)

- **App lock:** the locked page keeps its message in the middle and puts
  Unlock (solid blue) and Sign out (neutral gray) as full-width buttons at the
  foot, in thumb reach, instead of a compact button over a text link. Seen in
  light and dark on the simulator, drawn on its own; the real lock already
  covers the whole app, tab bar included.
- **No logo animation on the way in:** the app's splash (launch, the wait for
  startup, and the app lock's cover while Face ID runs) is the native launch
  image held still: the same mark at the same size on the same background. The
  breathing mark, the wash and the wordmark fade are gone, and so is the
  900 ms minimum; the splash lifts when the first screen is ready, with the
  short fade it had. A cold launch on the simulator shows one still frame from
  the launch image to Home.
