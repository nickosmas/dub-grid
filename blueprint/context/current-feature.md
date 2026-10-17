# Current Feature

## Fix: Call the organization's address its "domain" in customer copy

**Type:** Fix
**Status:** in progress

### The problem

Customer-facing copy calls an organization's address (`yourorg` in
`yourorg.dubgrid.com`) its "subdomain". Most customers don't know that word,
and they hesitate when a sign-in screen asks for it. The owner chose "domain"
(2026-10-17) because it is the friendlier word, and it is still technically
correct: every DNS name is a domain. The word appears on these surfaces:

- **Web sign-in:** `DomainSelector.tsx` (the errors and the help modal),
  `SubdomainField.tsx` (the field's accessible label), `login/constants.ts`
  (the not-found message), and `OrgLogin.tsx` (the closed-organization
  notice).
- **Mobile sign-in:** `LoginScreen.tsx` (the subtitle, the help button, and
  the help text).
- **Mobile Profile:** the organization row in `ProfileScreen.tsx` labeled
  "Subdomain".
- **Shared:** the organization-not-found message in
  `packages/client-errors/src/index.ts`, which the mobile API returns.
- **Public docs:** `introduction`, `quickstart`, `onboarding` (2),
  `configuration/organization`, and `features/mobile-navigation`.

### The fix

Change the customer-facing wording only:

| Where                              | Today                                                                       | After                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web field accessible label         | Organization subdomain                                                      | Organization domain                                                                                                                                                                  |
| Web, empty field                   | Please enter your subdomain.                                                | Please enter your organization's domain.                                                                                                                                             |
| Web, taken or reserved             | That subdomain isn't available. Check your organization's URL.              | That domain isn't available. Check it and try again.                                                                                                                                 |
| Web, check failed                  | Unable to verify that subdomain. Please try again.                          | Unable to verify that domain. Please try again.                                                                                                                                      |
| Web, not found                     | No organization found for that subdomain. Please check and try again.       | No organization found for that domain. Please check and try again.                                                                                                                   |
| Web, closed organization           | Its subdomain no longer signs anyone in. ...                                | Its domain no longer signs anyone in. ...                                                                                                                                            |
| Web help link                      | Need help finding your subdomain?                                           | Need help finding your domain?                                                                                                                                                       |
| Web help modal title               | How to find your subdomain                                                  | How to find your domain                                                                                                                                                              |
| Web help modal body                | Your organization subdomain is the first part of your URL (e.g. yourorg...) | Your organization's domain is the address you use for DubGrid, such as **yourorg**.dubgrid.com. Enter the first part. If you don't know it, contact your organization administrator. |
| Mobile subtitle                    | Enter the subdomain for your team.                                          | Enter your organization's domain.                                                                                                                                                    |
| Mobile help button                 | Need help with your subdomain?                                              | Need help with your domain?                                                                                                                                                          |
| Mobile help text                   | Your subdomain is the first part of your organization URL - for example...  | Your organization's domain is the address you use for DubGrid, such as yourorg.dubgrid.com. Enter the first part, **yourorg**.                                                       |
| Mobile Profile row                 | Subdomain                                                                   | Domain                                                                                                                                                                               |
| Shared not-found (`client-errors`) | ... Check the subdomain and try again.                                      | ... Check the domain and try again.                                                                                                                                                  |

The help text keeps the base domain dynamic (`baseDomain` on web,
`orgSuffix` on mobile), as it does today. The docs pages say "domain" the
same way, for example "enter your organization's domain (the `yourorg` part
of `yourorg.dubgrid.com`)".

**Must not break:**

- **Code and data keep `subdomain` and `slug`:** the `organizations.slug`
  column, `lib/subdomain.ts`, `parseHost`, `SubdomainField`, the
  `dg-subdomain-field` classes, the `organization-subdomain` element ids, and
  `/api/validate-domain`. Only words a customer reads change.
- **Email domain naming:** any future setting about email addresses (joining
  by email domain, SSO) is called "email domain", never a bare "domain".
- **No em dashes** in new copy or docs.

**Out of scope:**

- **The Gridmaster portal:** it is internal, so "subdomain" stays there.
- **Mobile Profile value:** the row keeps showing the slug (`yourorg`), as the
  sign-in field does next to its suffix. Showing the full address is a
  separate change.
- **Code comments and test names** that say "subdomain".
- **Terms of Service and Privacy Policy:** `TermsContent.tsx` and
  `privacy/page.tsx` say "subdomain". Changing legal text is the owner's call,
  separate from this fix.

### Build steps

1. [x] **Web and mobile copy.** Change the strings in the table in the web
       sign-in files, `LoginScreen.tsx`, `ProfileScreen.tsx` and
       `client-errors`, and update the tests that pin them
       (`DomainSelector.test.tsx`, `LoginScreen.test.tsx`,
       `ProfileScreen.test.tsx`, `auth-login.test.ts`, and any other test
       or E2E spec that matches the old text).
   - Done when no customer-facing string in `apps/web/src` (outside the
     Gridmaster portal), `apps/mobile/src` or `packages/client-errors` says
     "subdomain", and the web and mobile tests pass.
2. [x] **Public docs.** Reword the 6 mentions in the 5 docs pages and refresh
       their evidence fingerprints (`npm run docs:fingerprint`).
   - Done when `grep -ri subdomain docs` finds nothing and
     `npm run docs:check` passes.

### Verify

- `npm run type-check`, `npm run lint` and `npm run test` pass.
- `npm run docs:check` passes.
- **Browser check:** on the apex sign-in page, submit an empty field, an
  unknown domain and a reserved one, open the help modal, and read each
  message. A screen reader names the field "Organization domain".
- **Mobile:** the sign-in subtitle, the help button and its text, the
  not-found error, and the Profile organization row all say "domain". Jest
  tests cover them in this cloud session; a simulator check is optional.
