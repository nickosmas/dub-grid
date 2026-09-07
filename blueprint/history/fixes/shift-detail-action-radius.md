# Shift-detail action button radius

**Type:** Fix
**Status:** implemented
**Authorization:** User clarified that the Drop shift and Swap buttons shown in
the supplied screenshot should be matching gray squircles with larger icons
above their labels.

This scoped record preserves the active production-migration spec and unrelated
shared-checkout work. No commit, push, staging change, or Blueprint ownership
replacement is authorized.

## Intended behavior

- Drop shift and Swap use the same gray squircle treatment.
- Each button centers a larger icon above its label.
- Their order, width, labels, and behavior remain unchanged.

## Build steps

- [x] Apply the clarified shape, color, and vertical icon-label treatment.
- [x] Run the focused shift-detail tests, mobile type check, and diff validation.

## Verification

- Mobile type check passed.
- Focused button and shift-detail tests passed: 45 tests.
- Formatting and diff validation passed.
