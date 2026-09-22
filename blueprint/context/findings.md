# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-17 [P2] open - Existing load tests do not qualify authenticated scheduling capacity

**File:** load-tests/schedule-load.js:12; load-tests/auth-flow.js:14
**Found:** 2026-09-21 by /audit (scope: full; lens: performance)
**Why it matters:** Current load scenarios exercise health, public page, and sampled login requests only. They do not measure authenticated schedule reads, writes, publishing, or realtime propagation against the stated launch thresholds.
**Suggested fix:** Add staging-account workflows for realistic schedule reads, versioned writes, concurrent editors, publishing, and websocket propagation with separate read and write thresholds.
**Resolution:**

### F-18 [P2] unverified - Native push delivery and signed release qualification lack evidence

**File:** apps/mobile/app.json:1; apps/mobile/src/features/notifications/lib/push-permission.ts:1
**Found:** 2026-09-21 by /audit (scope: full; lens: quality)
**Why it matters:** The tracked mobile configuration lacks an explicit EAS project identity, and no signed release artifact or provider configuration was available for inspection. Development configuration reports that a project identity is required, but deployed configuration could supply it externally.
**Suggested fix:** Verify the production build profile, signed iOS and Android artifacts, project identity, push-token registration, notification delivery, and opt-out behavior with dedicated release accounts.
**Resolution:**
