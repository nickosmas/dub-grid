# Fix: Staff emails that fall behind a sign-in change

**Type:** Fix
**Status:** verified
**Branch:** fix/email-repair-job

## The problem

When someone confirms a new sign-in email, the auth trigger (022) updates their
linked staff record in every organization. If an organization already has
another staff record on that address, that one update is skipped with only a
database warning, and nobody hears about it. The record stays on the old
address indefinitely, and the person sees that organization's old email.
Reproduced on 2026-11-05: six of seven records moved, one stayed behind.

Someone choosing an address another account holds saw Supabase's raw message,
or a toast that didn't say why. Support also had no written process for
changing an email for someone who lost their mailbox.

## The fix

- **Daily repair.** A step in the return-from-away job, so it shares that job's
  switch and needs no migration, compares each linked active record with its
  sign-in and moves any that differ. Test sandboxes and closed organizations
  are skipped. Each move is logged. A record that still clashes is retried after
  the rest, so a clash this run has already cleared raises nothing.
- **Clash alert.** Super Admins of that organization get one alert, on the
  person's staff page, naming the record that holds the address. It's logged to
  the activity log, which is also what stops a repeat. The audit row is written
  after the alert, so a failed alert is tried again the next day. The other
  record is never changed.
- **Wording.** "That email belongs to someone else. Try a different one." When
  other changes saved in the same save: "That email belongs to someone else, so
  your email stayed the same. Your other changes were saved."
- **Inline check.** My profile and the staff page check a changed email and
  phone as you type. If either belongs to someone else, the field says so and
  Save stays off. My profile's email is checked in every organization the
  person belongs to, so it stops most clashes before they start; the wording
  above only shows if someone takes the address in the moment before the save.
- **Runbook.** `internal/operations/lost-mailbox-email-change.md`, approved by
  the owner.

## Not in this fix

- Mobile's email change and fields, which the owner set aside for this work.
- The Gridmaster person page, which already refuses a clash when saved.
- A repeat alert if a clash is left unresolved: one alert per record and address.
