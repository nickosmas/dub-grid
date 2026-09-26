# Feature: Impersonation and force logout need fresh proof

**From build-plan:** feature 41d7
**Status:** in progress (built alongside 43a, which holds
`current-feature.md` in another session)

## Goal

`start_impersonation` and `force_logout_user` are granted to
`authenticated` and authorize a Gridmaster with `is_gridmaster()` alone, so
a stale or stolen Gridmaster token can start an impersonation (with its
in-app notices but without the route's audit row and email notice) or sign
anyone out through the data API (F-75). Both are rare, deliberate actions
with no editing flow to interrupt, so they should need a recent sign-in in
the database, and starting an impersonation should ask for it in the portal.

## In scope

- **The impersonation route asks first.** `action: "start"` calls
  `requireSensitiveActionAuth` after the Gridmaster session check; ending an
  impersonation never asks. A database refusal answers with the step-up
  prompt (`stepUpResponseForRefusal`).
- **The portal prompts.** The impersonation start runs through
  `useStepUpAction` with the credential preflight, passing the assured token;
  its confirmation hides while the prompt shows.
- **The database refuses a stale Gridmaster.** Migration 055 redefines
  `start_impersonation` and `force_logout_user` from their newest
  definitions with the 051 guard first. `end_impersonation` is unchanged.

## Out of scope

- The schedule, recurring, publish and request functions (the rest of
  F-75): requiring fresh proof there would interrupt impersonated editing.

## Build steps

- [ ] **Step 1 - route and portal** - _Done when:_ route tests prove a
      stale session starts nothing and ending still works; a view test
      proves the start runs through step-up with the assured token.
- [ ] **Step 2 - migration 055** - _Done when:_ live tests prove each
      function refuses a stale Gridmaster, a fresh one works, and
      `end_impersonation` still ends a session with a stale token; a static
      test pins the guard.
- [ ] **Step 3 - inventory and records** - the sensitive-action inventory
      classifies the impersonation route; F-75 narrowed to schedule editing.

## Files / areas

- `apps/web/src/app/api/gridmaster/impersonation/route.ts` and its test.
- `apps/web/src/components/gridmaster/EnhancedImpersonation.tsx`,
  `apps/web/src/features/gridmaster/client/api.ts`.
- `supabase/migrations/055_*.sql`, `checksums.sha256`.
- `apps/web/src/__tests__/` (live, static and inventory tests).

## Data / contracts

- No schema change; the functions keep their signatures.
- Production: 055 goes with or after the release that carries the route
  and portal change, since production's current portal starts
  impersonation without a step-up prompt.

## Notes for the AI

- Build each function from its newest definition. No em dashes.
