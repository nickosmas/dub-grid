# Confirmation dialogs and task sheets

**Type:** Fix
**Status:** implemented; full automated verification passed
**Fixes:** F-56, F-57, F-58, F-59, F-60, F-61
**Authorization:** The user approved the dialog/sheet audit recommendations and requested a scoped local commit on dev.

## Implemented behavior

- Brief consequential decisions use centered confirmations. Choices and short tasks use sheets on mobile and contextual popovers, dialogs, or panels on web. Substantial workflows use pages.
- Ordinary profile edits save directly. Email, schedule, and access consequences keep specific confirmations. Deactivation choices and reason input use a guarded task sheet.
- Pending work blocks dismissal consistently. Cancel does not execute the action. Request errors remain visible on the surface that failed.
- Web dialogs use the existing Base UI accessibility foundation, including focus containment and restoration. Sign-out restores focus to the surviving account/menu trigger; unsaved-edit confirmations reuse ConfirmDialog.
- Mobile presentation tracking distinguishes sheets, confirmations, and required gates. One task sheet may coexist with one confirmation. Gate callers explicitly identify themselves. Task handoffs and unsaved-change guards retain their existing transition roles.
- Mobile confirmations use restrained motion, meaningful optional icons, and equal-width side-by-side actions. Guidance and regression tests document the surface policy.

## Verification

The commit candidate was isolated from committed `ffcb9be8`, preserving unrelated dirty work and the global Blueprint spec. The previously missing avatar dependency and three failing schedule checks are now in the committed baseline. One existing shift-detail test received formatting-only correction so the candidate passes the repository formatter.

Final automated result: all 22 serial Turbo test tasks passed, including 361 web test files / 3008 tests and 120 mobile test files / 967 tests. Formatting, root lint, full typecheck, and the production build passed. Lint has five existing warnings and no errors.

Earlier authenticated browser checks verified sign-out Cancel focus, Tab containment, Escape dismissal, and Account-menu focus restoration. A nested unsaved-management-editor confirmation preserved the draft when cancelled and restored focus to the editor; discarding restored focus to the page's Edit button. No account or access changes were saved during those checks.

## Remaining runtime limitations

Native iOS/Android transitions, swipe dismissal, keyboard layout, enlarged text, VoiceOver/TalkBack, and required gates interrupting a task still need device review. Component tests use native shims. The presentation registry diagnoses invalid compositions; it does not coordinate native transitions.

F-56 through F-61 remain fixed pending audit re-review. This scoped record leaves the unrelated active Blueprint spec and other pending work intact. No push was requested.
