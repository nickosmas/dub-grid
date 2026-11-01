# Fix: Native Team lists and Alerts

**Type:** Fix
**Status:** complete
**Completed:** 2026-11-01
**Branch:** `fix/native-sweep`

## The problem

Owner, 2026-11-01: some surfaces were still drawn rather than native, for
example the full lists behind the admin Home Team cards. A sweep of the app on
the iOS Simulator found the following:

- **Team lists** (Coverage, Open shifts, Overtime watch, Recent activity,
  Pending approvals): the count and a full-width Filter button sat in the
  page, and the rows lay straight on the gray page instead of in a grouped
  card.
- **Recent activity:** request rows named the shift by its code ("Pickup
  request · E · Approved").
- **Alerts:**
  - Opened cold, iOS 26 drew the large title over the stacked search field
    until the page was pulled.
  - "Mark all read" and an "N unread" line sat in the page, repeating the
    Unread filter's count.
  - Unread rows had a blue fill.

## The fix

- `HeaderFilterAction` (shared, also used by People) puts Filter in the native
  bar: a Liquid Glass button on iOS, a Material icon button on Android, filled
  while a filter is on.
- `DashboardListSection` draws a Team list as one grouped card, with its count
  as the group's caption.
- Mobile activity rows take the shift's name from its segment before the code.
- **Alerts:**
  - An inline title, which fixed the overlap; a declared search bar and an
    unlocked scroll did not.
  - Mark all read is a bar action: words on iOS, Material's done-all icon on
    Android.
  - Unread is the dot and the weight only.

## Verified

- `type-check`, `lint`, `test:mobile` (1538 tests) and the mobile-api-core
  dashboard tests (a new test for the segment's shift name).
- iOS Simulator: a cold open of Alerts, and Overtime watch and Recent activity
  with their bar Filter and grouped cards.
- Not verified on Android or a phone.

## Left for later

The sweep's full list of remaining drawn surfaces is in the owner's summary
(Requests cards, Shift detail, the Profile subscreens, Person detail's status
card, Home's hero card and others).
