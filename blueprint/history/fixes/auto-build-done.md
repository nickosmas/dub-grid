# Auto-build: Done ends it, and a built period doesn't offer a fresh build

**Type:** Fix
**Status:** verified

## The problem

After a build was applied, **Done** cleared the report and put Auto-build back at its start, with the how-it-works points and a primary **Generate schedule**, as if nothing had been built. The owner found that confusing: it invites building the same period again, which only fills what is still empty, since a build never reshuffles what is already scheduled and gives the same result for the same draft.

## The fix

- **Done** (after a build, and on "Nothing to fill") closes Schedule Builder.
- While a build applied to the period is still in the draft (its line under **Applied**), Auto-build leaves out the how-it-works points and offers a secondary **Fill what's still empty** in place of **Generate schedule**. Undoing the build brings the usual start back. No extra text, at the owner's request.

## Verify

- Unit: `CoveragePanel.test.tsx` (Done calls the new `onDone`, not Cancel; a built period offers only "Fill what's still empty", secondary, which previews the rows shown). Full web suite, type-check and lint pass.
- Browser (local stack, Calm Haven, Nov 1 to 7, with a temporary Day Shift requirement): Generate, Apply (133 changes), Done closed the panel; reopening showed the Applied line, the options and "Fill what's still empty"; Undo brought back Generate schedule and left no cells. The temporary requirement was deleted.
- Docs: `docs/features/coverage-and-open-shifts.mdx` (what Done does and the built period's button); fingerprints re-recorded.

## Release

No migration.
