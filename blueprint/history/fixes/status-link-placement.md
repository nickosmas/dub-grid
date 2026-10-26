# Status link in the standard places

**Type:** Fix
**Status:** verified

## The problem

The status page link shipped in `status-page-links` sits in the signed-in
profile menu (desktop and phone-width sheet), which no comparable product does.
The landing footer labels it "Service status" where products such as Linear and
Notion say "Status", and the docs show it in the top bar rather than the footer
where help centers usually put it.

## The fix

- **Profile menus:** remove the Service status item from `Header.tsx` and
  `MobileNavSheet.tsx`, with their now-unused `Activity` and
  `SERVICE_STATUS_URL` imports.
- **Docs:** remove the profile menu line from `docs/account/profile.mdx`, and
  move the link from `navbar.links` to `footer.links` in `docs/docs.json`,
  labeled **Status**.
- **Landing footer:** relabel the link **Status**.
- **Error pages:** unchanged; both keep **Check service status**.

`SERVICE_STATUS_URL` stays in `@dubgrid/domain`; the landing footer and both
error pages still use it.

## Build steps

- [x] **1. Move the link.** The four changes above.
      **Done when:** neither profile menu shows a status item, the landing footer
      reads Status, the docs footer (not the top bar) links to the status page,
      both error pages are unchanged, and `docs:check`, `docs:validate`,
      type-check, lint and the Header, RouteBoundary and landing tests pass.

## Verify

- Signed in, open the menu with your name on desktop and at phone width: no
  status item.
- `/`: the footer shows Status, opening the status page in a new tab.
- `npm run docs:check`, `npm run docs:validate`, `npm run type-check`,
  `npm run lint`, and the affected web tests.

## Research

No comparable product puts its status link in the signed-in profile menu. Linear's site footer (Resources > Status) and Notion's help center footer (Company > Status) carry it, status page vendors recommend the website, help center and 5xx error pages, and GitHub's error page links its status page. Inside a signed-in app, the usual treatment is a banner shown only during an incident, left for later.

## Evidence

- `npm run docs:check` and `npm run docs:validate` pass; the same seven pages' fingerprints re-recorded (home, introduction, onboarding, dashboard, organization, reports, profile).
- `npm run type-check`, `npm run lint` (two older `<img>` warnings elsewhere) and `npm run build` pass.
- RouteBoundary, Header, SetupLockGate, landing and legal-copy tests pass (78).
- Browser, local dev server: the landing footer reads Status with `target="_blank"`; the profile menu (Profile, Test sandbox, View as User, Sign out) and the phone-width sheet (Profile, View as User, Sign out) have no status link.
- Not observed: the Mintlify-rendered docs footer.
