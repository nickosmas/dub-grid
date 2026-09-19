# Feature: Fix schedule page double-fetching published date ranges

**From build-plan:** feature 28
**Status:** verified

## Goal

The build plan traced this one precisely: on every schedule page mount
`fetchPublishedDateRanges` fires twice, once inside `loadSchedule()`'s
initial `Promise.all` and again from a separate `useEffect` that calls
`refetchPublishedRanges` whenever its `[org, shiftFetchEnd,
shiftFetchStart]`-keyed callback identity changes — which it does on that
same mount. The asked-for fix is to gate the second effect so it only
refetches on a genuine window change.

Measured on a schedule entry as `qa-super-admin` before and after, by
counting `/api/schedule/*` requests (dev server, so StrictMode inflates
both sides equally; the comparison is what matters):

| Request                          | before | after |
| -------------------------------- | ------ | ----- |
| `/api/schedule/published-ranges` | 3      | **1** |
| `/api/schedule/actor-names`      | 2      | **1** |
| `/api/schedule/manage`           | 5      | 5     |
| everything else                  | 1-2    | same  |

`actor-names` fell out with it: it is fetched off the back of the ranges
load, so removing the duplicate removed its follow-on too.

## The fix

The plan suggested gating on `scheduleLoadStarted`, but that ref is set
synchronously inside the load effect, which runs before this one on the
same mount — so the guard would already be `true` and would skip nothing.
Instead the initial load now _claims_ the window it is about to fetch:

- New `publishedRangesWindowRef` holds `orgId|start|end` for the ranges
  already fetched, cleared on an org switch alongside the other load guards.
- `loadSchedule()` sets it before its `Promise.all` issues the initial
  fetch.
- The window-change effect compares the current `orgId|start|end` against
  that ref and returns early when they match, so it fires only on a real
  window or org change. The `!org` branch keeps its previous behavior of
  resetting the range state to its loading placeholder.

## Build steps

- [x] **Step 1 - Trace the two call sites.** Confirmed both:
      `SchedulePageClient.tsx` initial `Promise.all` and the
      `refetchPublishedRanges` effect. Also confirmed the plan's suggested
      guard would not work, and why.
- [x] **Step 2 - Implement the window claim.** Ref + claim in the load
      effect + early return in the window effect + reset on org change.
- [x] **Step 3 - Measure.** Table above: 3x -> 1x, with `actor-names`
      2x -> 1x as a knock-on. Baseline captured by stashing the change and
      re-running the same probe, so both numbers come from identical
      conditions.
- [x] **Step 4 - Regression.** `tsc --noEmit` clean, eslint clean,
      `schedule.spec.ts` and `schedule-states.spec.ts` green on chromium.

## Files / areas

- `apps/web/src/app/(app)/schedule/SchedulePageClient.tsx` - the fix

## Notes

No unit test: the change is guard state inside a 7k-line client component
with no existing harness, and the observable contract is the request count,
which the before/after measurement covers. The window-change path stays
exercised by the schedule e2e specs, which navigate between weeks.
