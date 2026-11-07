# Fix: Alert emails carry the details, in a card on a gray page

**Type:** Fix
**Status:** verified
**Branch:** `fix/email-useful-details`

## The problem

Looking at a real "Swap request to approve" test, the owner said emails should
hold as much useful data as possible and tell the reader to go to the app to
respond (2026-11-07). The email said only "Sam Rivera sent a swap request." Most
alerts were one sentence, with no button.

The same day they said the background was an unclear gray rather than following
the theme. React Email's own wrapper cell kept its light inline background with
none of our dark classes, so the sides of the email never followed dark mode, and
clients that drop the body's background left their own color there.

## The fix

- **Requests.** Every shift request email shows the shifts in full (date, shift,
  job, 12-hour times with hours, focus area). Whoever is on the request reads
  "Your shift" rather than their own name, approvers included (owner,
  2026-11-07). While it waits, it shows when it expires and says to go to the app to
  approve, reject, accept or decline it. Manager's notes move from the sentence
  to the card, in email only. Why someone called off goes to approvers and the
  person themself, never to whoever picks the shift up.
- **Other alerts.** Permission changes list every permission added and removed.
  Role and status changes show Before and After, with the return date for Away.
  A new staff member's email gives their contact details and placement.
  Suspensions give the end date, schedule notes the date and note, invitations
  the address, role and expiry, payment failures the amount and pay-by date,
  profile changes every field, and security alerts the time and device.
- **Buttons.** Every alert with an organization now has a button, by default
  to where the alert goes in the app. The email-needs-a-fix alert opens the
  record that holds the address, and alerts about the reader open their profile.
- **Layout.** The whole email now sits in one white card, with no border or
  shadow, on a light gray page (`#F5F5F5`), which replaces the 2026-11-06 choice of no outer card (owner,
  2026-11-07, after first asking for pure white and black). Dark mode is a zinc
  card on a black page. The logo sits inside the card, so its white plate stays
  hidden, and a full-width table carries the page color with `bgcolor`, so it
  survives a client dropping the body's background.

Push and the in-app inbox keep their one sentence. A failed lookup never costs
an alert: the email falls back to fewer facts.

## Checks

Unit tests cover the details from each side, the fallback, the default button
and the wrapper. A real render was checked in light and dark.

Not checked: how Gmail, Outlook and Apple Mail show the new background.
Shift names rely on `requester_state` as stored; only a sample was rendered.

## Follow-up

The eight Supabase templates changed with the wrapper, and reach production
through `npm run auth:templates:push`, separately from the web release.
