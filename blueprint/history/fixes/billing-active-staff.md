# Fix: Bill only active staff, and never schedule inactive or removed staff

**Type:** Fix
**Status:** verified

> `dev` holds migrations through `066`. This fix takes `067`; the notes fix
> (`fix/note-dots-and-attribution`) also needs a number, so whichever lands
> second renumbers.

## The problem

Reported 2026-09-28 by the owner.

1. **Inactive staff are billed.**
   - `countBillableAppUsers` (`features/billing/server.ts:188`) and the Gridmaster copy `billableAppUserCountForOrg` (`api/gridmaster/_lib/oversight.ts:611`) count every employee with `archived_at` null.
   - Deactivate sets `status = 'inactive'` and leaves `archived_at` null, so an inactive person stays a billed seat.
   - Remove archives the employee, but only a Super Admin or Gridmaster also archives the membership. When an Admin removes a linked person, the live membership is counted again as a management-only user.
   - Checkout, the seat true-up and the Billing settings figure all read these counts.
2. **Inactive or removed staff can still be scheduled.** The grid shows only active staff, and `write_schedule_cell_snapshot`, `move_shift`, `create_shift_series` and `import_previous_schedule` refuse them. But:
   - **Recurring apply** (`manage/route.ts:1612`) loads every template with no employee filter. The first non-active person raises in the RPC, the request answers 500, and the batches already written stay written. `upsert_recurring_shift` (`002:2276`) checks `archived_at` only, so it accepts an inactive person.
   - **`update_series_all_shifts`** (`002:2101`) rewrites every cell in the series through the unchecked internal writer, whatever the person's status.
   - **`publish_schedule`** (`039`) publishes a draft for a person deactivated after the draft was made.
   - **Direct table writes** to `schedule_cells`, `schedule_cell_snapshots`, `schedule_cell_segments`, `recurring_shifts` and `shift_series` are gated by RLS permission only, with no status check.
   - **`create_shift_request`** (`002:4503`) checks the requester for `archived_at` only, so an inactive person can raise a call-off, swap or pickup.
   - **Mobile swap options** (`shift-swap-options.ts:93`) list inactive people. The server refuses the choice, so this is a display gap only.
3. **Leaving does not clear what is ahead.**
   - Deactivate and remove leave future drafts, published shifts, recurring templates and series in place.
   - Deactivate also leaves open requests alive. Remove expires them through `expire_shift_requests_on_employee_archive`, which fires on archive only.

## The fix

### Billing

- A seat is:
  - an employee with `status = 'active'` and `archived_at` null, plus
  - a live membership whose user is linked to no employee record in the organization, whatever its status.
- A membership linked to an inactive or removed employee is not billed.
- Both counting paths use one shared pure helper in `features/billing`, so they cannot drift.
- The Billing settings hint changes to say seats are active staff plus management-only users.

### One gate in the database

- **Migration `067_inactive_staff_unschedulable.sql`:**
  - One `BEFORE INSERT OR UPDATE` trigger function, `refuse_unschedulable_employee`, refuses any write that would schedule a person who is not active or is archived. It is attached to:
    - `schedule_cell_snapshots`, where the state lives; a `deleted` state passes
    - `schedule_cell_segments`
    - `recurring_shifts` and `shift_series`; a row with `archived_at` set passes
    - `shift_requests`, on insert only, by requester, so existing requests can still expire or be settled
  - Every path meets the gate, whether an RPC or direct DML: series updates, recurring upserts, request creation and resolution. The existing message, `Employee not found, archived, or inactive`, is reused.
  - `publish_schedule` is not rewritten. The leaving step below discards every non-deleted draft a leaver holds, and the gate stops new ones, so publish never meets one. A leaver's pending removals (`deleted` drafts) still publish.
- **`clear_future_schedule_for_employee(p_org_id, p_emp_id)`:** a SECURITY DEFINER function run from the leaving trigger below. From the organization's current local date on, it:
  - deletes the person's draft-only cells
  - marks their published cells as pending removal (the same state `delete_schedule_cell_draft` writes), so the next publish shows the gap and the manager sees it before staff do
  - before today, discards any unpublished shift or absence draft (a draft-only cell is deleted, an edited published cell reverts to its published state), since publish could no longer carry it
  - archives their recurring templates and series
  - expires their open and pending requests, as the archive trigger already does on remove
  - leaves past dates and history untouched
- **Trigger on `employees`:** when `status` changes from `active` to `inactive` or `removed`, it calls the function in the same transaction, so web, mobile and any future path all clear alike.

### App

- Recurring apply filters templates to active, non-archived staff before writing, so one leaver can no longer fail the whole apply.
- Mobile swap options drop non-active people.
- The web and mobile status writes set `updated_by` to the verified actor, and the leaving trigger passes it to `clear_schedule_for_departed_employee`, so the pending removals appear under that manager's drafts at publish and "Discard my drafts" reaches them. The one-time backfill has no actor, so what it clears publishes as unattributed drafts.

### Reactivation

- Reactivating restores access and schedulability only. Cleared shifts, archived templates and expired requests stay cleared.

### Must not break

- the Test Sandbox clone and cleanup, which copy and delete these rows through the service role
- deleting or clearing an inactive person's leftover cells
- import-previous-schedule's `employee_inactive` skip reason
- trial activation, checkout and the Gridmaster true-up

## Build steps

- [x] **1. Bill active staff only.**
  - A shared seat helper, used by `countBillableAppUsers` and the oversight summary, plus the hint copy.
  - _Done when:_
    - unit tests show inactive and removed employees are not billed
    - a membership linked to a removed employee is not billed
    - a management-only member is billed
    - the Gridmaster and settings counts agree for the same facts
- [x] **2. The database refuses scheduling a non-active person.**
  - `067`'s write gate and the checksum.
  - _Done when:_ integration tests prove:
    - a worked or absence snapshot for an inactive or removed employee is refused, through the sync every series, recurring and request path uses, and directly
    - a live template or series for them is refused, and archiving one passes
    - an inactive requester cannot create a request, and an existing request can still expire
    - clearing an inactive person's cell still works
    - the tests fail without `067`
- [x] **3. Leaving clears the future.**
  - `clear_future_schedule_for_employee` and the `employees` trigger.
  - _Done when:_ an integration test deactivates a person with:
    - a past published shift, which stays
    - a future draft, which is deleted
    - a future published shift, which becomes a pending removal
    - a template and a series, which are archived
    - an open call-off, which expires
    - a past unpublished draft, which is discarded

    A second test proves the same on remove, and publishing a range that covers the leaver succeeds and removes their future published shift.
- [x] **4. App paths skip leavers.**
  - Recurring apply filters to active staff; mobile swap options drop non-active people; status writes name their actor.
  - _Done when:_
    - a route test shows apply with one inactive person's template writes everyone else's and answers success
    - a swap-options test excludes an inactive person
    - status route tests (web and mobile) show the actor in the write, and an integration test shows the pending removals credited to it
    - locally, deactivating `qa` staff with future shifts removes them from the grid's next publish, listed under "Your drafts"

## Verify

- `npm run type-check`, `npm run test`, `npm run db:migrations:check`
- **Browser, as `qa-super-admin@dubgrid.test`:**
  1. Deactivate someone with future shifts and a recurring template.
  2. Apply recurring: it succeeds.
  3. Publish: their future shifts show as removals.
  4. Billing settings: the seat count drops by one.
- **Release:** `067` is rehearsed on a scratch stack at production's ledger (`066`), then applied before the release PR merges. Its one-time backfill changes live data, so the owner first runs this read-only preview in the Supabase SQL editor and confirms the counts. The clearing it previews is the same as the migration's.

  ```sql
  -- 067 backfill preview: read-only. What clearing would do for staff already
  -- inactive or removed, per organization.
  WITH leavers AS (
    SELECT e.id, e.org_id, (now() AT TIME ZONE o.timezone)::date AS today
    FROM public.employees e
    JOIN public.organizations o ON o.id = e.org_id
    WHERE e.status <> 'active' OR e.archived_at IS NOT NULL
  ),
  cells AS (
    SELECT c.org_id, c.date, l.today,
      EXISTS (SELECT 1 FROM public.schedule_cell_snapshots s
               WHERE s.cell_id = c.id AND s.snapshot_kind = 'published') AS has_published,
      (SELECT s.state_kind FROM public.schedule_cell_snapshots s
        WHERE s.cell_id = c.id AND s.snapshot_kind = 'draft') AS draft_state
    FROM public.schedule_cells c
    JOIN leavers l ON l.id = c.emp_id AND l.org_id = c.org_id
  )
  SELECT o.name AS organization,
    (SELECT count(*) FROM leavers l WHERE l.org_id = o.id) AS leavers,
    count(c.*) FILTER (WHERE NOT c.has_published) AS unpublished_cells_deleted,
    count(c.*) FILTER (WHERE c.has_published AND c.date >= c.today
                         AND c.draft_state IS DISTINCT FROM 'deleted') AS future_shifts_to_pending_removal,
    count(c.*) FILTER (WHERE c.has_published AND c.date < c.today
                         AND c.draft_state IS NOT NULL AND c.draft_state <> 'deleted') AS past_drafts_discarded,
    (SELECT count(*) FROM public.recurring_shifts r JOIN leavers l ON l.id = r.emp_id
      WHERE r.org_id = o.id AND r.archived_at IS NULL) AS templates_archived,
    (SELECT count(*) FROM public.shift_series ss JOIN leavers l ON l.id = ss.emp_id
      WHERE ss.org_id = o.id AND ss.archived_at IS NULL) AS series_archived,
    (SELECT count(*) FROM public.shift_requests q
      WHERE q.org_id = o.id AND q.status IN ('open', 'pending_approval')
        AND (q.requester_emp_id IN (SELECT id FROM leavers)
             OR q.target_emp_id IN (SELECT id FROM leavers))) AS requests_expired
  FROM public.organizations o
  LEFT JOIN cells c ON c.org_id = o.id
  GROUP BY o.id, o.name
  ORDER BY o.name;
  ```

Release: migration 067 applied to production 2026-09-28 by the owner, together
with 068 and ahead of the release that carries them (#123), after a scratch
rehearsal from 066 whose inspector report matched production's line for line
(applied from `86b6bbad`). Before: 66 ledger entries, only 067 and 068 missing;
latest backup 2026-09-28 13:41:39 UTC. The backfill preview, read on production
first, found 18 leavers across seven organizations, of which 34 future published
shifts became pending removals (6 of them in Arden Wood, 28 in the seeded
organizations) and nothing else to clear: no unpublished cells, past drafts,
templates, series or open requests. After: 68 ledger entries, none missing,
every invariant passing, health 200.
