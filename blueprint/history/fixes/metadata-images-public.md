# Current Feature

## Let link previews reach the Open Graph and Twitter images

- **Type:** Fix
- **Status:** verified

### The problem

`apps/web/src/app/opengraph-image.tsx` and `twitter-image.tsx` are Next.js
metadata image routes served at `/opengraph-image` and `/twitter-image` (the
page metadata appends a `?<hash>` query). They have no file extension, so the
proxy matcher in `apps/web/src/proxy.ts` (`config.matcher`) does not exempt them
the way it exempts `.png` files, and they are not in the proxy's public-route
list either. An anonymous request falls through to the auth check and answers
307 to `/login`. Confirmed 2026-10-09: `curl -I https://www.dubgrid.com/opengraph-image`
returns 307 to `https://www.dubgrid.com/login`, and so does
`http://localhost:3000/opengraph-image`. Every link preview of dubgrid.com
therefore shows no image.

### The fix

Name both paths in the matcher's negative lookahead, anchored with `$`, the
same way `sitemap.xml` was exempted in 7db85130. The matcher tests the pathname
only, so the `?<hash>` query does not affect it. Anchoring keeps the exemption
to those two exact paths: `/opengraph-image-foo` or
`/opengraph-image/anything` stay behind the auth check.

Must not break: authenticated routes still match, and the existing exemptions
(`/sitemap.xml`, `/robots.txt`, `/_next`, `/api`, `/favicon.ico`,
`/monitoring`) keep behaving as `proxy-matcher.test.ts` asserts.

### Build steps

- [x] Exempt `/opengraph-image` and `/twitter-image` in `config.matcher` and
      extend `apps/web/src/__tests__/proxy-matcher.test.ts`: both paths do not
      match, while near-miss paths (a suffix, a subpath) still do.
      **Done when:** the matcher test passes and fails against the old matcher.

### Verify

- `npm run test:web -- proxy-matcher` passes; `npm run type-check` passes.
- Against the local dev server, anonymous
  `curl -sI http://localhost:3000/opengraph-image` and `/twitter-image` (with
  and without a `?<hash>` query) each return 200 with
  `content-type: image/png`, not 307 to `/login`.
