# Link the public status page

**Type:** Fix
**Status:** verified

## The problem

DubGrid has a public status page at `https://status.dubgrid.com`, hosted outside
DubGrid so it still loads when DubGrid is down. Nothing links to it: not the
docs, the landing page, the error pages, or any signed-in menu. Customers who hit
an outage have no way to find it.

## The fix

Add a plain **Service status** link, opening in a new tab, wherever a customer
would look for it, with the URL kept in one shared constant
(`SERVICE_STATUS_URL` in `@dubgrid/domain`) rather than repeated.

- **Docs:** a **Service status** link in the Mintlify navbar (`docs/docs.json`),
  and one line in `docs/account/profile.mdx` naming the menu item. Customer
  behavior only: no provider, monitor or endpoint names.
- **Landing footer** (`apps/web/src/app/page.tsx`, the only public page with a
  footer; privacy and terms have none): beside Privacy Policy and Terms of
  Service.
- **Error pages:** `ErrorBoundary` in `RouteBoundary.tsx` (every route's
  `error.tsx`) and `global-error.tsx` gain a **Check service status** link under
  Try again. A text link, not a second button, so the single action stays the
  primary one.
- **Signed-in web:** the profile menu (`Header.tsx`) and its phone-width sheet
  (`MobileNavSheet.tsx`) gain a **Service status** item above Sign out.
- **Mobile app:** skipped. The Profile tab has no help location; its only legal
  links are a **Policies** list inside Privacy & data, where a status row would
  be mislabeled. Not inventing a new menu.

Must not break: the landing footer's wrap on narrow screens, menu keyboard
focus, or the global error page's self-contained styling.

## Build steps

- [x] **1. Shared constant and every web and docs link.** `SERVICE_STATUS_URL`
      in `packages/domain`, used by the landing footer, both error pages and both
      profile menus; the docs navbar link and profile line.
      **Done when:** each surface renders the link with `target="_blank"` and
      `rel="noopener noreferrer"`, a RouteBoundary test asserts the error link,
      and `docs:check`, type-check, lint and the affected tests pass.

## Verify

- `/`: the footer shows Service status; it opens the status page in a new tab.
- Force a route error (or run the RouteBoundary test): Check service status is
  under Try again.
- Signed in, open the menu with your name: Service status sits above Sign out,
  on desktop and at phone width.
- `npm run docs:check`, `npm run type-check`, `npm run lint`, the web tests for
  `RouteBoundary`.

## Evidence

- `npm run docs:check` and `npm run docs:validate` pass; seven pages' evidence fingerprints re-recorded (home, introduction, onboarding, dashboard, organization, reports, profile), their text still accurate.
- `npm run type-check`, `npm run lint` (two older `<img>` warnings elsewhere) and `npm run build` pass.
- `RouteBoundary.test.tsx` asserts the error-page link; it and the Header, SetupLockGate, landing and legal-copy tests pass (78).
- Browser, local dev server: the landing footer, the profile menu and the phone-width sheet show Service status with `target="_blank"`, styled like their neighbours.
