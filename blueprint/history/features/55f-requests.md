# Feature: One staff page - Requests

**From build-plan:** feature 55f
**Status:** verified

## Goal

A Requests tab shows the pickups, swaps, call-offs and profile change
requests involving the person, sent in the chosen period, with their state
and who decided; the Overview shows what is still waiting on a manager.

## In scope

- `lib/person-requests.ts`: shift requests where they are the requester or
  the target, read from their side ("with Margaret Sullivan" or "from Cal
  Moss"), shifts spelled out from the request's segments, state labels and
  tones, and the manager who approved or rejected named from the directory;
  profile change requests naming the fields asked for, the focus area through
  org terminology. Rows follow the period by the day they were sent.
- The tab shows only to someone who can review every request (Super Admin,
  Gridmaster, or Manage employees, Approve shift requests or Edit shifts),
  since the route scopes anyone else to their own requests; profile change
  requests load only with Manage employees, Super Admin or Gridmaster.
- Overview's Waiting on you card: up to three requests awaiting approval, and
  a button to the tab.
- `fetchPeopleProfileChangeRequests` takes a null status to read every status.
- Also fixed here: a planned away is named "away" in a planned change (the
  status itself stores "inactive"), so Time off and Next time off now show a
  planned away as Away.

## Build steps

- [x] **Step 1 - The model** - tested for order, both sides of a request, the
      decider, someone else's profile request and the period filter.
- [x] **Step 2 - The tab and the card** - tested for the rows, the filter and
      the error; the page gates both queries.
- [x] **Step 3 - Docs and qualification** - the Requests bullet, the Overview
      line and the period sentence; a browser check of the tab and of Next
      time off for a planned away.
