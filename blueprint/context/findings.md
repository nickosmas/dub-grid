# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-03 [P2] open - Organization-user lookup fans out one Auth request per membership

**File:** apps/web/src/app/api/organizations/users/route.ts:29-32
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Larger organizations create an unbounded burst of upstream Auth requests.
**Suggested fix:** Fetch needed Auth-user fields in bounded batches or persist them with membership data.
**Resolution:**

### F-04 [P2] open - Mobile People renders an unvirtualized full roster

**File:** apps/mobile/src/features/people/screens/PeopleScreen.tsx:761-866
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Render, layout, animation, and memory cost grow with the complete organization roster.
**Suggested fix:** Replace the roster body with a virtualized list while preserving existing behavior.
**Resolution:**

### F-05 [P2] open - Landing page hydrates all mobile mockups and reveal sections on first load

**File:** apps/web/src/app/page.tsx:1-16, 383-547
**Found:** 2026-08-28 by /audit (scope: full; lens: performance)
**Why it matters:** Every landing visitor downloads, hydrates, and lays out below-the-fold mockup work.
**Suggested fix:** Keep the hero minimal and load below-the-fold mockups and reveal behavior on demand.
**Resolution:**
