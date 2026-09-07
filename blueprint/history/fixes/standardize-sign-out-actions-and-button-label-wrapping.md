# Fix: Standardize Sign out actions and prevent button-label wrapping

**Type:** Fix
**Status:** complete

## The problem

Mobile's ordinary current-session Sign out actions were not consistently
styled: the Terms gate used a ghost action while other app-level exits used
the standard neutral treatment. Separately, buttons on web and mobile could
wrap labels onto a second line at constrained widths or larger text sizes.

## The fix

- Applied the standard non-primary treatment to ordinary mobile
  current-session Sign out actions, including the Terms gate and app-level
  sign-out entry points.
- Preserved danger treatment for account-security operations that sign out
  other devices or all devices, along with their behavior, disabled states,
  and primary companion actions.
- Enforced a single-line label contract in the shared button systems: mobile
  labels scale to a legible floor before truncating, and web labels never wrap.

## Build steps

- [x] **Standardize ordinary mobile Sign out actions** - apply the shared
      secondary button treatment across the mobile app and update focused
      coverage.
- [x] **Enforce app-wide one-line button labels** - make shared mobile and web
      button primitives keep labels to one line.

## Verification

- Focused mobile Button tests passed (19 tests).
- Focused web control-chrome tests passed (16 tests).
- Full mobile suite passed (123 test files, 987 tests).
- Full web suite passed (372 test files, 3,177 tests).
- Production build, scoped lint, Prettier formatting, and `git diff --check`
  passed.
