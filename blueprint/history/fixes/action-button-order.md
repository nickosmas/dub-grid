# Primary and secondary action order

**Type:** Fix
**Status:** implemented
**Authorization:** User requested consistent primary and secondary ordering on mobile and web.

This scoped record preserves the active migration spec and concurrent avatar,
dialog, access-management, and mobile-layout edits. Work stays on `dev`; no
commit, push, staging change, or Blueprint ownership replacement is authorized.

## Intended behavior

- Horizontal action groups show secondary, cancel, or back on the left and the
  primary, confirm, or submit action on the right.
- Vertically stacked action groups show secondary first and primary last.
- With three or more mobile actions, the first two retain the requested shared
  row and later actions remain full width, while semantic priority still places
  the primary action last in reading order.
- Destructive actions count as primary only when they are the decision being
  confirmed. Independent destructive utilities keep their existing placement.
- Error messages, progress copy, links, and supporting text are not reordered as
  actions. Focus, loading, disabled states, callbacks, and accessibility labels
  stay unchanged.
- Profile hero quick actions retain their pre-fix centered wrapping arrangement.
  The ordering rule applies to bottom content, form, and sheet actions.

## Build steps

- [x] Enforce the order in shared mobile and web confirmation, sheet, form, and
      settings action primitives; update direct callers that cannot use a primitive.
      Done when representative primary/secondary, cancel/confirm, and three-action
      groups follow the same order on both platforms.
- [x] Update regression coverage and platform guidance, then run focused and
      applicable platform verification. Done when the ordering contract is tested
      and any unrelated failures are recorded separately.

## Verification

- Mobile type check passed.
- Mobile test suite passed: 121 files and 953 tests.
- Focused web regression tests passed: 2 files and 15 tests.
- Web type check remains blocked by six pre-existing errors in unrelated test,
  settings, permissions, onboarding, and audit files. None of the errors point
  to this fix.
- Follow-up: restored the profile page's top quick actions exactly to their
  previous layout while retaining standardized bottom action groups.
- Follow-up verification passed: mobile type check and 55 focused profile tests.
