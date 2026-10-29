# Fix: A lint rule that keeps copy plain

**Type:** Fix
**Status:** complete

## The problem

The app-wide copy review (`blueprint/history/fixes/app-copy-review.md`)
removed em dashes, en dashes, the ellipsis character, "Please", "Failed to"
and hardcoded "focus area" from user-facing copy on web and mobile. Nothing
stops them coming back: the existing `copy/no-technical-user-copy` rule only
catches "Failed to" at the start of a string, and only in a few positions.
The review's section 6 asked for a rule.

## The fix

Add `copy/no-copy-style-drift` to `eslint-rules/`, registered in the same
copy plugin and file scope as `copy/no-technical-user-copy` (web and mobile
source, tests and stories excluded). It reports, in any user-visible place:

| Pattern                  | Why                        | Hint                                                                   |
| ------------------------ | -------------------------- | ---------------------------------------------------------------------- |
| `—` (em dash)            | reads as AI-written        | rephrase with a comma, colon or full stop                              |
| `–` (en dash)            | ranges use " - "           | write `7:00 AM - 3:00 PM`                                              |
| `…` (ellipsis character) | house style                | drop it ("Loading", "Search staff")                                    |
| `Please `                | hedging                    | say what to do ("Try again.")                                          |
| `Failed to ` anywhere    | no next step               | "We couldn't <verb>. Try again."                                       |
| `focus area(s)`          | an organization renames it | build it from the org's label (`singularLabelNoun`, `pluralLabelNoun`) |

User-visible means: JSX text; a user-visible prop (the existing list plus
`body`, `detail`, `heading`, `ariaLabel`, `accessibilityLabel`,
`accessibilityHint`); a toast call; and object keys `error`, `message`,
`title`, `description`, `label`, `body`, `detail`, `subtitle`,
`placeholder`. Plain string literals and the static parts of template
literals both count. Fallbacks such as `org.focusAreaLabel || "Focus Areas"`
are not in a visible position and stay allowed.

Narrow allowances, each with a reason in the code: the Labels settings
example that names "Focus Areas" as the thing being renamed, and legal or
marketing pages if a check shows they need one.

Must not break: existing lint rules and `npm run lint:rules`.

## Build steps

1. [x] **Rule and tests.** `eslint-rules/no-copy-style-drift.mjs` with a
       `node:test` RuleTester file covering each pattern in each position, the
       fallback case, and the allowance; registered in `eslint.config.mjs`.
       **Done when** `npm run lint:rules` passes.
2. [x] **Clear what it finds.** Run `npm run lint`, then fix each report the
       way the review did (org labels, plain characters, next steps). Update any
       unit or E2E tests that pin the old text.
       **Done when** `npm run lint`, `npm run type-check` and the touched
       workspaces' tests pass.

## Verify

- `npm run lint:rules`, `npm run lint`, `npm run type-check`, and the tests
  of the workspaces touched.
- Adding `"Please wait…"` to any toast or JSX text fails `npm run lint`.

## Outcome

`copy/no-copy-style-drift` runs with the other copy rules on web and mobile
source. Its `allowFocusArea` option is on only for files that name the label
setting itself or speak about the product in general: Settings > Labels,
onboarding's labels step, Gridmaster, the organization settings route and
`organization-settings.ts`, and the landing, privacy and terms pages.

The first run found 39 reports. The real ones are fixed: onboarding's
"successfully ... Please", two schedule toasts, Jobs, Shifts, recurring
schedules, onboarding's Shifts and Jobs steps, bulk import (its preview column
and instructions now use the organization's label), the settings validation
name, the import route's unknown-name error, two ellipses, one em dash, and
the pagination gap.
