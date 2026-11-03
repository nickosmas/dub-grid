# Fix: Banner and status icons drawn solid, without a ring inside a disc

**Type:** Fix
**Status:** verified
**Branch:** `fix/no-nested-ring-icons`

## The problem

`StatusIcon` (web banners since #300) draws an own icon with no solid form in
white inside a tone-coloured disc. An icon already drawn in a ring
(`CircleCheck`, `CircleX`, `Info`, `AlarmClock`) then shows its ring inside
the disc: two circles around a small mark. The owner saw it on the Settings >
Billing seats banner ("this kind of design is a big no", 2026-11-03). The
Schedule's own bars still drew a thin 16px outline, and every banner icon sat
on the first line of text.

## The fix

Owner decisions, 2026-11-03:

- **No disc where the icon has a body.** The four ring icons and 17 more
  (calendars, trash, credit card, pause, file warning, file pen, flask,
  shield off, monitor and phone, and the four person icons) draw as one solid
  shape with their marks cut out. Only line icons with nothing to fill
  (refresh, repeat, replace, unplug) stay in a disc, with a larger mark (13.5
  of 24 units, was 12).
- **25px.** Banner icons go from 20px to 25px (30px was tried and was too big).
- **Centered.** A banner's icon is centered on all of its text, not its first
  line.
- **Schedule's bars** (draft changes, unpublished and published in other
  weeks, open elsewhere, session ended, bulk delete) use the same icon through
  `BannerIcon`. "Also unpublished in other weeks" shows the file with a pen,
  as Draft changes does, in place of the calendar.

- **Status icons.** The status card, the First day and Planned cards, the
  invitation card and each Change status option drew an outline icon in a
  tinted circle; they now draw the same solid 25px icon in the tone colour,
  with no circle (`StatusSymbol`). Active is the solid check circle; each
  card sets `--dg-icon-cut` to its own background, the selected option
  included.
- **Away is a plane** on web, in place of the moon: the status
  card, Change status, the mark beside a name, the "You're away" bar and the
  Mark away dialog. Mobile keeps the moon (its icon sets have no match).

- **Crisper solids.** Marks are cut out as real holes through an SVG mask,
  in place of lines painted in the background colour, so they stay sharp and
  show whatever is behind; the `--dg-icon-cut` wiring is gone. Fills are
  still traced with the line icon's 2px line, so every part and gap matches
  the line icon, but with mitred joins, so corners stay sharp. Filling
  without that line was tried and dropped: filled parts shrank while line
  parts did not, which loosened the person, monitor and phone, hourglass,
  alarm clock and envelope icons. The owner chose to keep these over another
  icon set after comparing 11 (2026-11-03).

- **Better icons for three banners** (owner's picks, 2026-11-03): two
  people for possible duplicates in bulk import (was a person with a
  magnifier), a monitor for Schedule open elsewhere (was a monitor and phone),
  and a calendar with a 1 for a series changed on one day only (was a
  calendar with a cog). `front` shapes draw one figure in front of another
  with a gap cut around it. Calling off and Session ended keep their icons.

Toasts keep their size and timing; their marks stay white through a
`markColor`, as decided on 2026-11-02.

## Build steps

- [x] **1.** Solid forms in `StatusIcon`, with a test that ring icons draw one
      `svg` and that an icon with no solid form still sits in a disc.
- [x] **2.** Banner icons at 25px and centered; `BannerIcon` in the
      Schedule's bars.
- [x] **3.** `StatusSymbol` for the status cards and Change status; Away as
      a plane.
- [x] **4.** Real holes and mitred fills in `StatusIcon`; toasts pass a
      white `markColor`.
- [x] **5.** Two people, monitor and calendar with a 1 in their banners.

## Verify

`StatusIcon.test.tsx`, the web UI tests, web `type-check`, ESLint and
Prettier. Rendered the real `Banner` with compiled Tailwind, and every banner
icon solid and in a disc, at 24, 25 and 30px.
