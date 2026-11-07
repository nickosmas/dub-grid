# Fix: Web empty states and a UI audit

**Type:** Fix
**Status:** verified
**Completed:** 2026-11-06

### The problem

The owner sent the staff page's Requests tab for a month with nothing in it: a
heading, "0 requests sent in August", an "All requests" filter, and a bold line
floating on a blank page. They asked to refine every web empty state, to stop
showing this week while viewing other weeks, to audit every page and view for
other UI bugs, and to consider whether a popup should open when it has no data
and how to make popups as useful as possible.

### Rules for a web empty state

- Every empty state sits in a dashed box (owner, 2026-11-06), so a page, tab or
  card never ends in loose text. `EmptyState` draws it, with nothing to opt into.
- Say it once: no zero count beside it, and no filter, sort, export or select
  with nothing to act on, unless a filter caused the emptiness.
- Copy names the thing and the period. A title has no trailing period. A helper
  line appears only when it says what to do or when the list fills.
- A next step appears only when it is on screen: clear the filter, jump to the
  nearest period with data, or a Settings link.
- The box replaces the list it stands in for, so it runs full width, stretches
  to fill its card, and holds 360, 240 or 140px by size (owner, 2026-11-06).
  Carbon's empty states pattern says the same of placement; it publishes no
  sizes, so those three are our own.
- Compact and inline empties are text only; a full-page one may keep its icon.
- The illustrated scenes stay on mobile.

### Rules for a popup

- A tile with no data has no expand button, so its popup can't open empty.
- A popup adds what the tile can't, and each row goes to its subject.
- A filter appears only when it has more than one real option.
- Its title matches the tile that opened it.

### The fix

**Staff page.** Requests, Activity and Schedule follow the rules above, and
Requests and Activity offer the nearest month that has something. The This week
strip shows only while the month on screen holds today.

**Dashboard.** The period label names the dates unless the period holds today,
so another week no longer reads "this week", on either dashboard. Expand is
gone from tiles with no data, and from Coverage on an unpublished period.

**Popups.** Open shifts rows and Coverage's day cells open that date in the
schedule, and Activity rows open their period. Coverage lists the worst first,
filters only by areas it has, and dates its columns in 2 Weeks. Open shifts'
urgency filter matches its badges (Urgent and Open), and Staff hours is titled
Overtime watch, as its tile is. The Open shifts tile says "No open shifts", not
"All shifts covered", which was untrue for a past week short of its coverage.

**People.** Reordering measures a move against the order it started from, so a
search can no longer offer Save order with nothing moved. Administrative Teams
loses the tiles that counted the other tab. Import closes on Escape and is a
dialog to assistive tech. The Access column is Access role on both lists, and a
missing certification reads "-".

The toolbar keeps search and Import, Export and Add on one row at 1440px, and
the empty spacing the filter bar left above the table is gone. Roles truncate
with the full text on hover.

**Buttons.** Labelled buttons on People, Reports, Alerts, the person form, the
calendar card, the status card and Gridmaster exports carry no icon. Icon-only
controls and the Filter button's phone form keep theirs. Schedule Builder keeps
its calendar icon, which item 49b asked for.

**Reports and Alerts.** Refresh and Close appear once a report is open, and
every field shares one height, font and label line. Alerts keeps sort, Select
and Mark all read on their own row, hides that row with nothing to act on, and
drops the bullet before Details.

**Settings.** Coverage's rows use the app's chevron.

**Gridmaster.** Stat numbers use Inter tabular figures, Impersonation's lists
stop cutting off at 200px, History scrolls instead of breaking emails, Security
hides its counts until they load and names both the same way, and the sign-in
heading no longer says "Platform admin".

**Loading.** The slow-load screen says "You can keep waiting or try again",
which matches the buttons under it.

### Verified

On a production build against the local stack, as Super Admin, Admin, staff and
Gridmaster, with no console errors: every main page, the empties above, Import's
Escape, the sign-in and invitation pages, phone width and dark mode. The dev
server couldn't carry the sweep, because the machine was out of swap.

The Coverage and Open shifts popups were checked with real numbers through two
temporary local coverage rules, removed afterward. The Overtime watch popup kept
its layout and was not opened. Mobile is untouched.

### Left as it was

- `ExpandedBreakdown` couldn't be opened. The owner approved removing it, which
  landed separately on fix/remove-shift-breakdown-popup.
- Staff Export covers the whole directory, so it stays enabled when a filter
  shows nobody.
- The Tools menu's red Bulk Delete Entries needs the owner's ruling on whether
  "no red negative actions" covers menus.
- Security's Impersonation Governance table lists target accounts by id.
- Import's sample rows use made-up area and role names rather than the
  organization's own.
