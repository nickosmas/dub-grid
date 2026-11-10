# Current Feature

## Every unsaved change asks before you leave

**Type:** Fix
**Status:** verified
**Branch:** `fix/leave-guards-everywhere`

### The problem

Any surface where someone has typed or changed something that isn't saved yet
should ask before they leave it, offering Save, Discard and Keep editing (owner,
2026-11-10). An audit of web and mobile on 2026-11-10 found the guards exist but
cover a minority of surfaces, and the popup never offers Save:

- **The popup can't save.** `UnsavedChangesDialog` (web) and
  `useUnsavedChangesGuard` (mobile) offer only Keep editing and Discard.
- **Web page editors don't register.** Only five Settings sections call
  `useNavigationGuard`. `UnsavedChangesBar` (8 uses) registers nothing, so
  Display, Schedule Rules, the staff page, profile tabs and the recurring grid
  lose work to a header link, a sidebar link or a refresh.
- **Web navigation the guard can't see.** The guard intercepts `<a>` clicks and
  `beforeunload` only. These leave silently: the staff page's previous/next
  arrows (`router.push`), the profile tabs (`router.replace`, which unmount the
  Account and Alerts editors), Gridmaster portal views (`setView`) and org tabs
  (`setTab`), and onboarding Back and Continue.
- **Web closers with no dirty check.** `useSlideoverClose` closes on Escape,
  backdrop and X with no way to ask, and `ConfirmDialog` closes on Escape and
  Cancel, though several dialogs hold typed forms.
- **Onboarding sits outside `NavigationGuardProvider`** (`AppShellProviders.tsx`),
  so its editors' guard calls do nothing.
- **Mobile native bottom sheets close before the guard can refuse.**
  `BottomSheetModal.native.tsx` sets `enablePanDownToClose={!dismissDisabled}`,
  so a drag, scrim tap or Android back closes the sheet natively; Keep editing
  then most likely leaves `visible` true with no sheet on screen (traced, not run
  on a device). `FullPageSheet` already gets this right.
- **Mobile surfaces with no guard or a wrong one.** No guard: the request
  decision note, Permissions, Invite to the app. Wrong dirty check: Add to
  schedule compares counts only, the admin invite ignores the access role, admin
  access rebuilds its baseline on refetch, Profile work compares order. Six
  sheets can be dragged away mid-save.

### The fix

Shared pieces first, so each surface is a small change, then every surface the
audit found, then a guard that keeps new ones from slipping through.

**The popup (both apps):**

- Three choices: **Save** (filled blue), **Discard** and **Keep editing**
  (outlines), in `ConfirmDialog`'s action row like every other dialog. Title "Save your changes?", message "You haven't saved what you
  changed here." Discarding unsaved edits is not destructive under the button
  rules, so Discard is no longer red; the `EDITOR_ACTION_LABELS.discard` comment
  is updated to match.
- **Save** runs the surface's own save. On success the exit continues; on
  failure the popup closes, the surface shows its usual error, and nothing
  leaves. A surface whose form can't be saved right now (invalid, or no single
  save) passes no save, and the popup reads "Discard your changes?" with
  Discard and Keep editing only.
- Mobile keeps the system alert, which takes three buttons on both phones.

**Exits each surface must route through the guard:** its own Cancel, X, Escape
and backdrop (web) or drag, scrim, Cancel and Android back (mobile); in-app
links and stack back; tab or section switches and previous/next that unmount it;
opening another item in the same editor; and refresh or tab close on web.

**Out of scope, deliberately:**

- **Web browser Back and Forward.** Catching them needs a history sentinel,
  which the provider avoided on purpose. A separate decision for the owner.
- **Mobile `router.replace`, deep links, forced sign-out, losing a tab's
  access and the app being killed.** A plain tab switch keeps the pushed screen
  and its draft, so nothing is lost there.
- **Not dirty surfaces:** sign-in, password and code fields (a password should
  not outlive the screen), typed delete confirmations, controls that save as
  they change, and filters, search and sort.

Nothing may stop a save in flight, and a clean surface must never ask.

### Build steps

- [x] **1. Web: the three-choice popup.** `UnsavedChangesDialog` takes an
      optional `onSave` and `saving`; `useUnsavedChangesPrompt` and
      `NavigationGuardHandle` take an optional `save` that returns whether it
      succeeded. Provider and prompt run save, then the exit, only on success.
      Done when: unit tests cover Save success (leaves), Save failure (stays,
      popup closed), no save (two choices) and a clean surface (no popup).
- [x] **2. Web: navigation the guard can't see.** The provider exposes
      `useConfirmLeave()`, returning `confirmLeave(proceed)` that asks when any
      registered surface is dirty and runs `proceed` after Save or Discard.
      `NavigationGuardProvider` moves above `OnboardingGate`. Done when: tests
      show `confirmLeave` asks only while dirty, and an onboarding editor's
      registration reaches the provider.
- [x] **3. Web: shared closers.** `UnsavedChangesBar` registers
      `useNavigationGuard` itself while `dirty` (its save as `save`).
      `useSlideoverClose` takes an optional guard that its Escape, backdrop and
      X go through. `ConfirmDialog` takes `hasUnsavedChanges` (and an optional
      save) that routes Escape and Cancel through the prompt. Done when: tests
      cover each, and Display and Schedule Rules ask on a sidebar link and a
      refresh with no change of their own.
- [x] **4. Web Settings row editors.** Jobs, Absence types, Schedule note
      types and Shift categories register `useNavigationGuard` while a row is
      dirty, with that row's save. Done when: a dirty row asks on a sidebar
      link, a header link and a refresh.
- [x] **5. Web schedule.** `ShiftEditPanel` routes Escape, backdrop, X, the
      dismiss button and opening another cell through one guard (dirty =
      `hasEdits` or the repeat form; the dismiss button follows
      `getEditorDismissLabel`), and the Schedule page registers it for links
      and refresh. The Requests panel's decision note guards its slide-over.
      Done when: in the browser a dirty shift editor asks on every one of those
      exits, and Save from the popup saves the cell.
- [x] **6. Web people.** The staff page learns the details editor is dirty
      (`onDirtyChange`), registers it, and runs previous/next through
      `confirmLeave`. The recurring schedule grid and seniority reorder
      register. `EmployeeManagementAccessModal`'s Cancel asks when creating.
      Shift preferences checks its `touched`. Change status, bulk status and
      Move email pass `hasUnsavedChanges` to `ConfirmDialog`. Done when: each
      asks on its exits in the browser.
- [x] **7. Web profile.** Personal details, Work and Alerts preferences
      register, the profile tabs switch through `confirmLeave`, the name change
      request modal guards its close, and Two-factor setup in progress asks
      before leaving (Keep going instead of Keep editing). Done when: each asks
      on a tab switch, a header link and a refresh.
- [x] **8. Web Gridmaster, onboarding and public pages.** Portal views and
      org tabs switch through `confirmLeave`. The Create Organization wizard,
      org details edit, staff record edit, name edit and termination reason,
      Add Feature Control, billing policy cards, impersonation and suspend
      reasons and add-user email guard their closes. Onboarding Back and Skip
      run through `confirmLeave`, and the Schedule step's Jobs and Shift
      category rows register with the wizard collector so Continue saves or
      asks. The public demo request form asks on its links and on refresh. Done
      when: each asks on its exits in the browser.
- [x] **9. Mobile shared.** `useUnsavedChangesGuard` takes an optional
      `onSave` and shows Save, Discard and Keep editing.
      `BottomSheetModal.native` takes `hasUnsavedChanges` and turns off pan,
      scrim and back dismissal while it is true, as `FullPageSheet` does, so the
      X and Cancel route through the guard. A shared set-equality helper for
      id lists. Done when: tests cover the three choices and the sheet's
      dismiss props, and on the iOS Simulator and an Android emulator a dirty
      sheet can't be swiped away and Keep editing leaves it on screen.
- [x] **10. Mobile surfaces.** Guard the request decision note, Permissions and
      Invite to the app. Pass `hasUnsavedChanges` from every guarded bottom
      sheet, and `dismissDisabled` during save on Add person, the three admin
      access sheets, Permissions and Invite. Fix the dirty checks: Add to
      schedule, the admin invite's access role, admin access's frozen baseline,
      Profile work's order and departments, the person editor's trims. Done
      when: tests cover each corrected check and each surface asks on every
      exit in the list above.
- [x] **11. Keep it from regressing.** A lint rule or test that fails when a
      web `Modal` or slide-over holding a form has no `onRequestClose` or
      guard, or a mobile sheet with a text field has no guard. Done when: it
      passes on the fixed tree and fails when one surface's guard is removed.

### Verify

- `npm run type-check`, `npm run lint`, `npm run test` in the worktree.
- Web, in the browser as a Super Admin: make a change on each surface in steps
  5 to 8, then try each exit; the popup appears, Keep editing stays, Discard
  leaves, Save saves and leaves. A clean surface leaves without asking.
- Mobile, on the iOS Simulator and an Android emulator: the same for each
  sheet and screen in steps 9 and 10, including drag, scrim and Android back.
- Browser Back on web still leaves without asking (out of scope).

### Outcome (2026-11-10)

- Web: one three-choice popup (Save, Discard, Keep editing; Save only where a
  surface saves in one step), `useConfirmLeave` for state and router moves, the
  Unsaved changes bar, slide-overs and `ConfirmDialog` asking on their own, and
  every surface from the audit wired. Onboarding sits inside the guard.
- Mobile: the same three choices in `useUnsavedChangesGuard`, native bottom
  sheets that refuse swipe, scrim and Android back while dirty (with a close
  button on Android), the request note, Permissions and Invite guarded, and
  the corrected dirty checks.
- `unsaved-changes-coverage` tests in both apps fail when a form surface has
  no guard; each was proven to fail with a guard removed.
- Checks: `npm run type-check`, `npm run lint`, `npm run lint:rules`, and
  `npm run test` (web 7,691, mobile 1,689, packages all pass). Browser, on a
  worktree dev server: Display asked on a header link and Discard left; the
  shift editor asked when another cell was clicked and Save saved the draft.
- Not run: the iOS Simulator and an Android emulator, so the native sheet
  behavior and Android's new close button need a device look. The public demo
  request page uses the browser's own prompts, since the app dialog's styles
  are app-only. Browser Back on web is still not guarded (a separate decision).
