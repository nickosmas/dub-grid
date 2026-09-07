# Mobile action button layout

**Type:** Fix
**Status:** implemented; mobile checks pass, root build blocked by existing web errors
**Authorization:** User requested this mobile layout fix directly.

Preserve the active migration spec, avatar work, and existing dialog/access changes. Work stays on dev without commits or staging changes.

## Intended behavior

Two actions share one equal-width row. With three or more, the first two share a row and each remaining action occupies its own full-width row. A single action stays full width. Conditional actions count only when present; fragments do not create extra slots. Labels wrap without switching the pair to a vertical layout. Preserve action order, callbacks, errors, pending states, and minimum touch targets.

## Build step

- [x] Apply the shared layout to sheet/form wrappers, confirmations, filters, profile settings and custom action groups; keep supporting errors outside the button row. Update mobile guidance and verify grouping plus mobile consumers.

## Verify

Mobile tests and typecheck; focused grouping checks and formatting/lint; production build. Inspect narrow-screen and long-label rendering when runtime access is available. Native-device evidence must be identified separately from shim tests.

## Evidence and limits

- Final mobile suite: `npm --workspace @dubgrid/mobile run test`, 121 files and 953 tests passed. Includes conditional/fragment action grouping and existing form, sheet, authentication, and confirmation consumers.
- Final mobile typecheck: `npm --workspace @dubgrid/mobile run type-check`, passed.
- Scoped ESLint, Prettier, and `git diff --check` passed.
- `npm run build` compiled successfully, then failed on six pre-existing web TypeScript errors in no-floating-async-handler, SettingsNavigationGuard, usePermissions, StructureStep, settings-help-tooltips, and employee-activity tests. No web source was changed for this fix.
- Expo web preview failed before app rendering with `Cannot find native module 'ExpoTrackingTransparency'`. Android Studio showed the running People screen, but native interaction/capture subsequently failed. The new action layouts have not been visually verified on iOS/Android, at narrow widths, or with enlarged system text.
- Existing equal-width form/footer rows were retained. SheetActions, AuthActions, filter footers, confirmations, profile management, two-factor setup, custom request groups, and sign-in/MFA actions now use the shared ActionButtons pattern. Button labels can shrink and wrap within the available width.
- Regular audit/check/try gates are manual. No commit, push, staging change, or modification to the active migration spec was performed.
- Task-only patch: `/tmp/dubgrid-mobile-button-layout.patch`. Verification logs: `/tmp/dubgrid-mobile-button-layout-tests-final.log`, `/tmp/dubgrid-mobile-button-layout-typecheck-final.log`, `/tmp/dubgrid-mobile-button-layout-build.log`.
