# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

_No findings recorded. `/audit` appends findings here when it finds them._

### F-01 [P2] closed - Realtime marketing copy promises a guarantee the product can disable

**File:** apps/web/src/app/page.tsx:65-67
**Found:** 2026-08-27 by /audit (scope: apps/web/src/app/page.tsx; lens: quality)
**Why it matters:** The landing page promises that publishing reaches every screen instantly and leaves no stale versions. `useOrganizationData` disables realtime when an organization's `disable_realtime` override is true, and offline or printed schedules cannot receive live updates.
**Suggested fix:** Describe publishing and live updates as available capabilities, without promising instant delivery to every screen or eliminating stale printouts.
**Resolution:** Closed 2026-08-27 after re-review. The organization-level pause control was removed, web and mobile realtime subscriptions now ignore the legacy `disable_realtime` value, and the claim now accurately describes updates to connected web and mobile apps.

### F-02 [P3] accepted - Infrastructure protection statement has no repository-level proof

**File:** apps/web/src/app/page.tsx:121-124
**Found:** 2026-08-27 by /audit (scope: apps/web/src/app/page.tsx; lens: security)
**Why it matters:** The landing page states that data is encrypted in transit and at rest. The privacy page makes the same policy statement, but the repository cannot prove the deployed infrastructure and database configuration that make it true.
**Suggested fix:** Confirm the deployed controls with the infrastructure owner before treating this wording as a verified product claim.
**Resolution:** The user explicitly chose not to verify or change this claim on 2026-08-27.
