# Fix: Record card, the month grid first, and one Edit details

**Type:** Fix
**Status:** verified
**Branch:** fix/record-card-month-grid
**Completed:** 2026-10-30

Owner feedback on the released staff page and profile.

### What changed

- The record (employee ID, added, joined, first day, status changed, planned,
  status note) moves from one quiet line at the bottom into a **Record** card
  beside Work and Access, on the staff page and the profile.
- The Schedule tab opens on the month grid for every period, not only This
  month. The period's days stand out and the rest of the month is dimmed; on
  the staff page the whole month loads, so the dimmed days show their shifts
  too. **Show as list** switches to the list.
- **Edit details** in the header is the only way into the details; the Work
  card's Edit is gone. Access and management stay separate, outside it: the
  Access card's **Change access** opens the access level and permissions, its
  management Edit the departments, and **Add to management** stays in the
  header (owner, 2026-10-30, after trying one tabbed editor).

### Evidence

- Type check, the staff page, profile, calendar and typography tests, and
  `npm run docs:check` passed in the worktree.
- Browser, local stack, QA Super Admin: the Record card beside Work and Access,
  and the Schedule tab with Current week showing October with that week at
  full strength and the rest of the month dimmed.
