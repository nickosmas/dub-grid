# Fonts for generated images

DM Sans 400 and 700 (Latin) for the Open Graph and Twitter cards
(`src/app/logo-grid.tsx`). Satori, which renders those cards, reads WOFF but not
WOFF2, so the pinned WOFF2 files in `public/fonts/` cannot serve here.

They are bundled so the production build never fetches a font: prerendering the
cards used to download these from jsDelivr, and a connection timeout failed the
build. They sit outside `public/` because nothing serves them to browsers.

Source: the unmodified `files/dm-sans-latin-{400,700}-normal.woff` from the npm
package `@fontsource/dm-sans@5.3.0`, the same files the CDN URL served.
License: SIL Open Font License 1.1, `dmsans-OFL.txt` (the package's `LICENSE`).

| File                            | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `dm-sans-latin-400-normal.woff` | `38702875fe179437d200e7ba6f7fab4d497ffe48117ef332029b2081751186ad` |
| `dm-sans-latin-700-normal.woff` | `af422a448ac00679a8dbb13532db3616829c5a35b58d3eeea5903ce17ad2e36a` |
