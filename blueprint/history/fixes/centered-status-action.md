# Center full-screen status actions

**Type:** Fix
**Status:** implemented
**Authorization:** User reported that the Try again button in the centered
schedule error state remains left aligned, and requested reassuring client copy
that does not name the product.

This scoped record preserves the active production-migration spec and unrelated
shared-checkout work. No commit, push, staging change, or Blueprint ownership
replacement is authorized.

## Intended behavior

- A centered status state centers its action beneath the centered icon and copy.
- Error and supporting copy uses neutral, reassuring language without naming
  the product.
- Generic load failures use the concise supporting message “Please try again in
  a moment.”
- Inline status banners keep their existing action alignment.
- Button styling and behavior remain unchanged.

## Build steps

- [x] Correct the centered status action row's flex-axis alignment.
- [x] Remove product-name references from mobile client-facing prose and update
      affected copy assertions.
- [x] Run the shared-state and schedule tests, mobile type check, and diff validation.

## Verification

- `cd apps/mobile && npm test` — passed.
- `cd apps/mobile && npm run type-check` — passed.
- `cd packages/client-errors && npm test` — 29 tests passed.
- Prettier and `git diff --check` passed for the scoped files.
