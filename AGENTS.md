# Agent Steering

This file is the agent-facing steering guide for DubGrid. It is derived from
`CLAUDE.md` and should stay aligned with it. Keep the hard constraints here
explicit, and use `CLAUDE.md` for the longer examples and rationale.

If instructions conflict, follow the project-specific constraints first.

## Workflow

- Enter a planning step for any non-trivial task, especially work with 3+ steps,
  architectural decisions, or meaningful verification.
- If execution stops matching the plan, stop and re-plan before continuing.
- Prefer autonomous bug fixing: inspect logs, failing tests, and errors, then
  fix the root cause without unnecessary back-and-forth.
- Do not mark work complete until it is verified. Compare behavior when
  relevant, run tests, and check the result like a staff-level review would.
- Keep changes as simple as possible and limit the blast radius, but do not ship
  hacks where a clean solution is clearly warranted.
- If agent tooling supports delegation, use it for bounded research or parallel
  analysis. Keep one focused task per delegated agent.

## Core Principles

- Find root causes. Do not stop at temporary fixes.
- Minimize impact. Touch only what is necessary and avoid introducing risk.
- When a correction reveals a recurring pattern or misunderstanding, capture the
  lesson in the project's memory or guidance files.

## Project-Specific Constraints

- Migrations: all schema changes live in exactly 4 files (`001` through `004`).
  Do not create new migration files.
- Routes: use simple route files such as `apps/web/src/app/staff/page.tsx`, not catch-all
  routes. Catch-all routes break static prerendering on Vercel.
- Naming: `gridmaster` is the platform role and route (`/gridmaster`).
  `admin` is the organization role. Do not call the gridmaster portal the
  "admin portal."
- Testing: run `npm test` after changes. The test stack is Vitest with jsdom
  and Testing Library.
- Cookie consent: when adding or removing cookies, changing analytics
  providers, or updating cookie/privacy policy text, bump `CONSENT_VERSION` in
  `apps/web/src/components/CookieConsent.tsx`.

## React Guidance

- Prefer derived values in render over mirrored state. If a value can be
  computed from props or existing state, compute it inline.
- Use `useEffect` only to synchronize with systems outside React, such as
  browser APIs, subscriptions, or third-party libraries.
- Do not use `useEffect` to sync one piece of state to another, transform props,
  respond to user events, or reset state on prop changes.
- Put event-driven logic in event handlers, not effects.
- Reset component state with a `key` when a prop should force a remount.
- Use React Query, SWR, or framework-native loaders for data fetching instead of
  raw `useEffect` plus `fetch`.
- Use `useMemo` and `useCallback` intentionally, not by default.
- Favor composition, controlled forms, stable named components, and small
  focused components.
- Use stable unique keys in lists. Do not use array indices for re-orderable
  collections.

## Next.js Guidance

- Default to Server Components. Add `'use client'` only where browser APIs,
  event handlers, or React client hooks are required.
- Push client boundaries to the leaves. Keep data fetching, auth checks, and DB
  access in Server Components whenever possible.
- Fetch server data directly in Server Components with `async` and `await`.
- For client-side fetching after interaction or for user-specific live data, use
  React Query or SWR, not raw `useEffect` plus `fetch`.
- Treat caching deliberately. Prefer `revalidatePath` or `revalidateTag` after
  mutations instead of globally disabling caches.
- Use Server Actions for internal form submissions and mutations. Validate and
  sanitize all `FormData` before use.
- Use Route Handlers only for public HTTP endpoints such as webhooks, callbacks,
  or externally consumed APIs.
- Use `layout.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx` for route
  structure. Keep layouts lean and fetch data close to where it is used.
- Define metadata with the `metadata` export or `generateMetadata`, not with
  `<Head>`.
- Validate environment variables at startup. Never expose server-only secrets in
  Client Components.
- Use `next/image` for images, `next/font` for fonts, and `next/link` for
  internal navigation.
- Keep middleware light and edge-safe. Do not import heavy Node modules or ORMs
  into middleware.
- Use `dynamic()` and `Suspense` where they improve performance. Avoid
  `force-dynamic` unless it is truly necessary.
- Follow App Router conventions such as route groups, `_components`,
  co-located `actions/`, and shared `lib/` and `types/` folders.

## Security Guidance

- Validate all inputs at server boundaries, including Server Actions, Route
  Handlers, and middleware. Use Zod or an equivalent schema layer.
- Never pass raw user input into database queries, shell commands, or file
  paths.
- Use established authentication systems. Check both authentication and
  authorization inside every Server Action and Route Handler, not only in
  middleware.
- Never rely on the client to decide what a user can see or do.
- Never hardcode secrets. Keep server secrets out of `NEXT_PUBLIC_` variables
  and validate env vars at startup.
- Use parameterized SQL, a query builder, or an ORM. Never interpolate user
  input into SQL.
- Avoid `dangerouslySetInnerHTML`. If it is unavoidable, sanitize content first
  and maintain a strict CSP.
- Do not expose mutating behavior through GET handlers. For mutating Route
  Handlers, validate `Origin` or use CSRF protection.
- Configure strong security headers in `apps/web/next.config.ts`.
- Rate-limit all public or side-effectful endpoints, especially auth, contact,
  email, and webhook-style flows.
- Validate uploaded files by content, enforce size limits, and store them in
  dedicated storage with access control.
- Audit dependencies, commit lockfiles, and review new packages before adding
  them.
- Do not leak stack traces, internal paths, SQL errors, or implementation
  details to clients. Return generic client errors and log detailed failures
  server-side.
- Never log passwords, tokens, payment data, SSNs, or unnecessary PII.
- Load third-party scripts through `next/script` and audit their data access.

## Reference

- `CLAUDE.md` remains the longer-form source for examples, rationale, and the
  full wording of these rules.
