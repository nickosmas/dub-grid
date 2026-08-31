# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-04 [P2] open - Mobile People renders an unvirtualized full roster

**File:** apps/mobile/src/features/people/screens/PeopleScreen.tsx:761-866
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Render, layout, animation, and memory cost grow with the complete organization roster.
**Suggested fix:** Replace the roster body with a virtualized list while preserving existing behavior.
**Resolution:** Not attempted. Deferred deliberately: the roster renders inside the shared `Screen`
ScrollView (sticky-header, scroll-offset, and scrollTo machinery), so virtualizing means moving the
screen onto a FlatList with the filters and tabs as `ListHeaderComponent` and reworking
`AnimatedListItem`'s index-staggered entrance for recycled rows. That is a feature-sized change to a
shared scroll architecture and needs its own spec, not a cleanup pass.

### F-14 [P2] fixed - Web bulk security-session sign-outs bypass confirmation

**File:** apps/web/src/components/account/SecurityPanel.tsx:142-156, 294-315
**Found:** 2026-08-29 by /audit (scope: full; lenses: security, tests)
**Why it matters:** The Security panel immediately signs out other devices or every device after one
click. This contradicts the panel's current-device confirmation and the mobile session flow, which
requires a confirmation for each destructive session scope. There is no focused SecurityPanel test
to protect the expected confirmation contract.
**Suggested fix:** Route both bulk actions through ConfirmDialog with scope-specific copy, then add
focused coverage that verifies no sign-out request occurs until confirmation.
**Resolution:** 2026-08-29 by /implement. The web Security panel now opens
scope-specific confirmation dialogs before either bulk sign-out action. On both web and mobile,
the other-devices action is disabled when no other active device exists. Focused coverage proves
neither web action runs until the corresponding dialog is confirmed.
