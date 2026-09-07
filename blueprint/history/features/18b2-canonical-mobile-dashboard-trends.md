# Feature: Canonical mobile dashboard trends

**From build-plan:** feature 18b2
**Status:** verified

## Goal

Deliver a bounded, canonical period-history trend payload for the authenticated
mobile dashboard. It reports the same coverage and staffing facts as web while
leaving all native chart and detail-screen presentation to 18c.

## Delivered

- A stable five-point trend contract with raw ISO bounds, coverage percentage,
  scheduled-staff count, and total required coverage slots.
- Five contiguous inclusive periods, ordered oldest to newest, with malformed
  and inverted ranges rejected.
- One effective-org context and one draft-preferred historical schedule read for
  all five periods, then in-memory coverage evaluation through the shared engine.
- Authenticated admin and super-admin dashboard API exposure, route validation,
  and mobile client-parser coverage.

## Out of scope

- Native trend cards, chart controls, detail screens, schedule editing, and
  publishing. Those remain feature 18c or intentional web-only boundaries.

## Verification

- `npm run test:web` - 372 files, 3,179 tests passed.
- `npm run test:mobile` - 123 files, 988 tests passed.
- `npm run type-check` passed.
- `npm run build` passed.
- Focused contract, core, mobile data-route, and mobile API parser suites passed.

## Notes

- `trends` returns exactly five oldest-first points. The requested range is the
  newest point and the preceding periods have the same inclusive day count.
- `coveragePct: null` means coverage requirements are not configured. Zero is
  an observed coverage value, not a redaction.
- The route derives organization and authorization from mobile auth; clients
  cannot choose the organization or bypass admin role enforcement.
