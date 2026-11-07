# Fix: Email dark mode is all black, because Outlook turns near-black gray

**Type:** Fix
**Status:** verified
**Branch:** `fix/email-black-cards`

## The problem

Most customers may read email in Outlook, and in a real Outlook for Mac dark
mode test the owner found the card a mid gray with poor contrast (2026-11-07).
Pixels showed `#18181B` and `#27272A` both came out about `#525154`, so the fine
print and fact labels fell to 3.3:1 and the support link to 3.05:1, under the
4.5:1 target. Only pure black came through unchanged.

## The fix

- **Dark palette.** The page, the card and the facts box are all black, and the
  facts box is marked by its border. A test with a black card on a `#27272A`
  page kept the card black, but Outlook turned the page and the facts box gray,
  and the owner didn't want gray in either place. With no contrast between them,
  the big card has no visible edge in dark mode.
- **Small text.** The dark muted color moves up to `#D4D4D8`, as the owner saw
  in the test they reviewed.
- **Supabase templates.** Regenerated, and pushed after the release.

## Considered and dropped

- A gradient on the cards could leave light text on white in a client that keeps
  the gradient and lightens the text.
- Real links for `support@dubgrid.com`. It is plain text in about 15 places, and
  the mail app's own link blue passes on black, so it stays as it is.

## Checks

- `src/emails` tests pass, with the three dark backgrounds pinned, and web
  type-check is clean.
- Light and dark renders were checked in Chromium.
- In Outlook for Mac, pure black survived as the page in one test and as the
  card in another, and the `#3F3F46` borders held. This final all-black version
  was not sent to Outlook. Windows and web Outlook were not checked.
