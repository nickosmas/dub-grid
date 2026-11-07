# Fix: Every email is redesigned, and the logo shows in dark mode

**Type:** Fix
**Status:** verified
**Branch:** `fix/email-redesign`

## The problem

The logo was a transparent image with a dark wordmark, so it disappeared on a
dark background. The owner also wanted every email more refined, and asked
whether we should address people by name (2026-11-06).

## The fix

Owner decisions, 2026-11-06, from the "DubGrid email redesign" canvas.

- **Logo.** No mail app recolors an image, so the header carries two. The first
  is the dark wordmark on an opaque white plate, which disappears on the white
  page. Where a client honors the dark styles, the white wordmark replaces it at
  the same size. Gmail's phone apps darken a message without saying so, ignore
  the styles and keep the first image, so the logo shows on a small white chip.
  Delivered emails still load the old images, so those stay in `public/`.
- **Layout.** The email sits directly on the page, with no outer card, left
  aligned, with one footer and no second wordmark.
- **Dark mode.** A full dark palette, for `prefers-color-scheme` and Outlook's
  `data-ogsc` and `data-ogsb`.
- **Cards.** A card holds facts or a code, never a sentence, and an email has one
  at most. That is 7 of the 61 emails. The owner first asked for highlights in
  cards, then saw that 20 cards held a single sentence and chose this.
- **Organization name.** Bold, under the logo, on alerts, invitations and any
  notice about an organization. Security alerts show the name alone, not "While
  signed in to". Email changes made by the person or by support leave it out, as
  those can reach a mistyped address.
- **First names.** "Hi Maria," on alerts, the trial welcome and the suspension
  notice, which go to a member's own verified address. Invitations, confirmations
  and every Supabase template keep "Hi there,", since the address may not be the
  reader's and those templates have no reliable name. This replaces the 2026-09-26
  rule of no names anywhere.
- **Open schedule.** Schedule change alerts told people to open the schedule with
  no link. They now have a button into the organization's own subdomain.

Copy is unchanged apart from the greeting, the button and moving "from" and "to"
in the email changed notice into labeled facts. The invitation's expiry and its
72-hour note are now separate sentences.

## Verify

- `npm run email:build` regenerated all eight Supabase templates, and their drift
  test passes.
- New tests: both logo images and every dark hook, the first name and its
  fallback, the button and its subdomain, no button without an organization, one
  card at most on every sign-in email and template, no invitation sentence in a
  card, and the organization name per email change sender.
- All 61 emails and variants were rendered in Chromium in light and dark and
  reviewed by the owner on the canvas.

Not verified: real Gmail, Apple Mail and Outlook. The Gmail column on the canvas
is a simulation of forced dark.

## Follow-up

The eight Supabase templates reach production through `npm run auth:templates:push`,
separately from the web release.
