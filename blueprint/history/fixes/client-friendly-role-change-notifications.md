# Client-friendly role change notifications

**Type:** Fix

**Status:** verified

## The problem

Promoting someone sent them a notification telling them what they had lost.

`PATCH /api/organizations/access` dispatches two independent notification
events. `role_changed` fires when the role moves, and
`admin_permissions_changed` fires whenever the `admin_permissions` JSONB
differs. Those are not independent in practice: only the `admin` tier carries
per-key grants, so the route nulls the column for every other role. Promoting a
member to Super Admin therefore always looks like a permission wipe, and the
second notification enumerates it:

> Nic Kosmas removed your access to view staff, view schedule, view
> organization labels, view focus areas, view indicator types, view employee
> details, view recurring shifts, view dashboard analytics, view shifts and
> jobs, and view coverage requirements.

The reader was just given more authority, not less. The same list appears on a
demotion, where it is technically accurate but reads as a punitive inventory
next to the role line that already said what happened.

Two smaller defects sit next to it. `summarizePermissionChanges` has no length
limit, so a wide permission edit produces a ten-clause sentence in an inbox row.
And the gridmaster Users tab queued its own `role_changed` through
`/api/send-notification` on top of the one the access endpoint already
dispatches, so role changes made from that surface delivered two identical
"Your role changed" alerts.

## The fix

Let the role notification stand alone. A role change already names both ends of
the move, which is all the reader needs and all they should be told; the
permission rows it drags along are bookkeeping. Spell out granted and revoked
access only for a permission-only edit, where the person stays an admin and
someone deliberately retuned their keys, because there the detail is the entire
message.

Cap the permission list so the sentence stays readable, and route both role
mentions through the shared label map so no message can surface a raw enum
value.

Drop the duplicate client-side dispatch.

## Build steps

- [x] Suppress the permission notification on a role change. Done when
      `admin_permissions_changed` dispatches only while the role is unchanged,
      a promotion that nulls the permission column sends exactly one
      notification, and a permission-only edit on an admin still sends its own.
- [x] Use friendly role labels in notification copy. Done when the
      `role_changed` and `invitation_accepted` messages read role names through
      `formatOrganizationRoleLabel`, the same map the UI uses, and a test proves
      `super_admin` renders as "Super Admin".
- [x] Cap the permission list. Done when a change spanning more than three keys
      renders the first three followed by "and N more", and shorter lists are
      unchanged.
- [x] Remove the duplicate role notification. Done when the gridmaster Users tab
      no longer queues `role_changed` client-side and its unused import is gone.

## Verify

- Focused tests cover both PATCH dispatch paths, the friendly role copy, and the
  list cap.
- `npm run type-check`
- `npm run test` (web workspace)
- `npm run build`
- `npm run lint`

## Notes

`titleCaseWords` happened to render `super_admin` correctly because it splits on
underscores, so the role line in the reported screenshot was already right. It
was still the wrong helper: it derives a label from the slug rather than reading
one, so it would have failed on any role whose display name is not its enum
title-cased. Both role sites now use `formatOrganizationRoleLabel`, which also
covers `gridmaster`.

The `role_changed` schema in `/api/send-notification` now has no caller. It was
left in place as API surface rather than widening the diff.

Deliberately out of scope: the two-event model itself. Collapsing role and
permission changes into one notification type would be cleaner, but it changes
the stored `NotificationType` values that the inbox and bell already switch on,
and the suppression rule fixes the reported behavior without a data migration.

## Evidence

Recorded 2026-09-03.

| Gate                 | Result                                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| `npm run test` (web) | 352 files, 2866 tests, 0 failures                                           |
| `npm run type-check` | 24/24 tasks successful                                                      |
| `npm run build`      | 11/11 tasks successful                                                      |
| `npm run lint`       | 0 errors (146 pre-existing warnings)                                        |
| Focused suites       | 3 access-route tests, 21 notification-event tests, 3 permission-label tests |

**Not verified in a browser.** The change is server-generated notification copy
with no UI surface of its own, and proving it end to end means promoting a real
account and reading the resulting inbox row. The dispatch decision is asserted
directly at the route boundary instead: one test promotes a member whose
permission column is non-empty and asserts a single `role_changed` dispatch, and
a second edits permissions without touching the role and asserts the
`admin_permissions_changed` dispatch still fires. The message strings themselves
are asserted verbatim in the notification-event and permission-label tests.

## Scope note

Reported from a screenshot of the alerts inbox during a live role change. The
duplicate-notification defect was not in the report; it was found while tracing
the dispatch path and is fixed here because it shares the same call site.

This fix was built directly in chat rather than through `/fix`, so this spec was
written at completion from the delivered diff rather than ahead of it.
