# Fix: Remove the unused send-notification route

**Type:** Fix
**Status:** verified
**Branch:** `fix/remove-send-notification`

## The problem

Any signed-in organization member could call `POST /api/send-notification` to
send alerts such as "schedule published", "role changed" and request-resolved
to other people. The route checked sign-in, CSRF, the rate limit and the
caller's organization, but no permission, and it took the request id, roles and
approval result from the caller.

## The fix

Nothing calls it. Web, mobile, the packages and the scripts have no caller: the
one helper that posted to it, `queueNotification` in `apps/web/src/lib/notify.ts`,
was imported by `OrganizationDetail.tsx` but never called. Alerts are sent by the
server routes that make each change, through `dispatchNotificationEvent`.

- Deleted the route, its test and `lib/notify.ts`.
- Removed the unused import, the two test mocks of the helper, the entry in the
  authentication entry-point inventory, and the lines in `internal/api-reference.md`
  and `internal/architecture/folder-structure.md`.
- Regenerated the documentation inventory.

The `schedule_published` case in `dispatchNotificationEvent` has no dispatcher
left, since publishing alerts through `notifyPublishedShiftChanges`. It stays for
now; the notification type itself is still read for older alerts.

## Verify

- `npm run type-check` passes.
- The entry-point inventory, shift request, Gridmaster and notification event
  tests pass (56 tests).
- `npm run docs:check` passes with no fingerprint changes.
