# code_review.md

Use this guide whenever Codex is asked to review code in this repository.
Review for concrete, evidence-backed risks first. Do not nitpick style unless
it affects readability, consistency, correctness, or maintainability.

## Review Priorities

Review in this order:

1. Security issues
2. Tenant isolation issues
3. Data loss risks
4. Auth or permission regressions
5. Cross-app breakage between Next.js and Expo
6. Shared package breaking changes
7. API contract changes
8. Database migration risks
9. Missing tests
10. Accessibility issues
11. Performance regressions
12. Maintainability concerns

## Finding Format

For every confirmed issue, include:

- Severity: Critical, High, Medium, or Low
- Affected area
- File and location
- What is wrong
- Why it matters
- Suggested fix

## Review Rules

- Lead with findings, ordered by severity.
- Clearly separate confirmed issues from questions, assumptions, or follow-up
  checks.
- Do not report speculative issues as confirmed bugs.
- Do not claim a root cause unless the evidence supports it.
- Cite exact files, functions, commands, or test output used as evidence.
- If no issues are found, say what was reviewed and what was not reviewed.
- Mention relevant checks that were not run.
