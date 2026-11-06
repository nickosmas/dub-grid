# Changing a sign-in email when the mailbox is lost

> **Draft for the owner's review (2026-11-05).** How much proof support asks for
> is the owner's call. Until this note is removed, treat the checks below as
> the minimum.

Whoever controls a sign-in email can reset the password, so changing one on
request hands over the account. This runbook is for a Gridmaster asked to do
that for someone who can no longer open their old mailbox. It is the only case
where support changes a sign-in email.

## Is this the right path?

| Situation                                                 | What happens                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| They can still sign in                                    | They change it themselves on My profile. Support does nothing.                                                  |
| They've lost the mailbox and are in one organization      | A Super Admin there uses **Move to a new email** on the staff page. Support does nothing.                       |
| They've lost the mailbox and are in several organizations | A move covers one organization only, so each would have to move them. Use this runbook to change it everywhere. |
| They're the organization's only Super Admin               | Nobody there can move them. Use this runbook, with the stronger check below.                                    |
| They also lost their authenticator                        | Use this runbook, then **Reset two-factor** on the same page. It asks for a reason.                             |

## Proving who is asking

Pick the first one that fits, and do it before opening the change dialog.

1. **A Super Admin of their organization asks.** The request comes from that
   Super Admin's own sign-in email, and a call to the phone on the Super Admin's
   staff record confirms it. This is the normal case.
2. **The person asks and a Super Admin is reachable.** Contact a Super Admin of
   their organization using the details already on record and have them confirm.
   Then follow case 1.
3. **They're the only Super Admin.** Do all of these:
   - Call the phone on their staff record.
   - Call the organization's phone on record.
   - Confirm a detail from billing that isn't on any screen they could have
     seen without signing in, such as the last invoice's amount and date. Read
     it from Stripe, and have them say it first.
   - If the organization has any Admin, have one confirm too.

In several organizations, a Super Admin of one organization is enough, since
the person keeps the same role everywhere. Tell them the change applies to all
of their organizations before making it, and don't name those organizations to
anyone who isn't already a member of them.

**Never:**

- Use a phone number, email address or link that came with the request. Use only
  what's already on record.
- Treat a message sent from the new address as proof. That only shows someone
  controls the new address.
- Go faster because the request is urgent or comes from a manager. Pressure is
  the usual sign of a takeover attempt.
- Say whether an address has an account, or whether a person is in another
  organization, while proving who is asking.

If a check fails or can't be done, stop and tell the owner. Don't partly do it.

## Making the change

1. In Gridmaster, open the person and check their organizations and Access role.
2. Choose **Change sign-in email**, enter the new address, and confirm your
   identity when asked.
3. Tell them to use **Forgot password** on the new address. The change ends every
   session, and their old password may be something they want replaced anyway.
4. Confirm they got back in.

The change ends every session, tells both addresses, and gives every linked
staff record the new address.

It's refused if another account holds the address, or if another staff record in
one of their organizations uses it. Ask that organization's Super Admin to change
the other record, then try again. Don't change the other record yourself.

## What to record

The platform audit log gets `user.email_changed` with both addresses. It can't
hold why, so write this in the support ticket:

- who asked, when, and how they reached us
- which check above was used, and the numbers called (from the record)
- who made the change
- the old and new addresses

## If someone says they didn't ask for it

The old address gets a notice, so this is how a mistake or takeover surfaces.
Treat it as a takeover until shown otherwise:

1. Change the sign-in email back to the old address and end their sessions.
2. Have them reset the password and, if they use two-factor, reset that too.
3. Check the platform audit log and the organization's activity log for what
   happened in between.
4. Tell the owner the same day.
