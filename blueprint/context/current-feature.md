# Feature: Mobile role certification eligibility

**From build-plan:** feature 17a
**Status:** in progress

## Goal

Mobile staff editors must receive each role's certification requirement and block
new incompatible role selections before save. The existing server validation
remains authoritative, and mobile must preserve an already-selected role so it
can always be removed after a certification changes.

## In scope

- Add `requiredCertificationIds` to mobile bootstrap role data from data access
  through the authenticated mobile contract.
- Move the shared role certification predicate from the web app into
  `@dubgrid/domain`, retaining its existing any-of requirement semantics and
  preserving the existing web import as a compatibility re-export.
- Add disabled-state and requirement-hint support to mobile role choices.
- Apply the gate in People staff detail and Profile work editors, respecting
  the organization full-name versus compact-label preference.
- Add focused contract, data mapping, shared-domain, and mobile editor tests.

## Out of scope

- Dashboard data or presentation work, deferred to 17b and 17c.
- Role or certification settings editors, migrations, and Supabase changes.
- Schedule editing, publishing, or other F-16 functionality.
- Rebuilding management-staff or compact-label functionality already present.

## Build loop

Build one step at a time, show the diff and focused evidence, then wait for the
configured per-step review before proceeding. Keep all work on `dev` and leave
unrelated dirty mobile files untouched.

## Build steps

- [x] **Step 1 - Share the eligibility rule and expose mobile role requirements.**
      Export the existing requirement predicate from `@dubgrid/domain`, keep the
      web helper as a compatibility re-export, and add `requiredCertificationIds`
      to the mobile role row, bootstrap schema, and server mapping. _Done when:_ an
      authenticated bootstrap response validates role requirement IDs, empty
      requirements allow anyone, and matching any one held certification passes.

- [ ] **Step 2 - Make role choices explainably unavailable.**
      Extend the mobile profile-choice primitive to accept per-item disabled state
      and an accessible requirement reason, then use the shared predicate for
      unselected role choices in both staff detail and self-service work profile.
      _Done when:_ an incompatible role cannot be selected, its requirement is
      announced to assistive technology, and an already-selected incompatible role
      remains enabled solely so the user can remove it.

- [ ] **Step 3 - Lock the release behavior with regression coverage.**
      Add focused tests for data access and API mapping, domain requirement
      semantics, and both mobile editor surfaces in full-name and compact-label
      modes. _Done when:_ the new focused tests pass, existing web requirement
      behavior still passes, and no editor sends a newly incompatible role through
      the normal selection interaction.

## Files / areas

- `packages/domain` exports the requirement predicate used by web and mobile.
- `packages/contracts`, `packages/data-access`, `packages/mobile-api-core`, and
  `apps/web/src/features/mobile/server` carry the authenticated role field.
- `apps/mobile/src/features/profile/components/ProfilePrimitives.tsx`,
  `apps/mobile/src/features/people/screens/PersonDetailScreen.tsx`, and
  `apps/mobile/src/features/profile/screens/ProfileWorkScreen.tsx` render the
  guarded choices.

## Data / contracts

- `MobileBootstrapResponse.roles` changes from the generic named item shape to
  a role shape with `id`, `name`, `abbr`, and `requiredCertificationIds: number[]`.
- Requirement semantics are OR-based because an employee holds one current
  certification: no required IDs permits selection; otherwise one held ID must
  be in the required set.
- This is an additive authenticated API response field. No database schema or
  mutation request changes are required.

## Testing

- Unit-test the shared predicate and the bootstrap role mapping/schema.
- Test both mobile editors with matching, missing, and legacy-selected role
  cases, including accessible disabled state and compact-label rendering.
- Run focused web/mobile tests during steps. Before a requested commit or push,
  run `npm run type-check`, `npm run lint`, `npm run test`, `npm run test:mobile`,
  and `npm run build`.

## Notes for the AI

- Use the effective authenticated organization ID in every server-side query.
- Match web `EditEmployeePanel` behavior exactly for selected incompatible
  roles: preserve them and allow removal, never silently strip persisted data.
- Do not alter existing dirty mobile UI work except where a direct overlap is
  unavoidable; report that overlap before editing it.
- F-15 is the tracked parity finding this feature repairs. Mark it `fixed` only
  after the implementation step and leave final closure to a subsequent audit.
