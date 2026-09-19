# Setup wizard findings F-92, F-94, F-100, F-101

**Type:** Fix (findings F-92, F-94, F-100, F-101)

**Status:** verified

## The fixes

- F-92: a scheduled department with zero focus areas offers "+ Add" again.
- F-94: add buttons read "+ Add Role", not "+ Add add a role...".
- F-100: wizard descriptions wrap and the display-mode sample shrinks with
  its column (buttons never wrap by default; these hold prose).
- F-101: Create Organization inputs are labelled with `htmlFor` / `id`.

## Evidence

- Unit: settings, onboarding, and OrganizationSetupWizard suites pass with
  two new cases. Web type-check and lint clean.
- F-100 is verified by rule inspection, not a 1440x900 screenshot.
