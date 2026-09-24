# Pinned application fonts

These are the unmodified WOFF2 files emitted by the successful Next.js 16.3.5
production build of commit `20b0ca0a129053f429b59be535074afe0c01da42` on 2026-09-24.
They replace build-time Google Fonts fetching after CI encountered an internal
Turbopack Google-font URL-resolution failure. No font design was changed.

`src/app/fonts.css` preserves every emitted face: DM Sans 600/700 (brand),
Inter 100–900 (product), and DM Mono 400/500, including all original Unicode
subsets, swap behavior, and metric-adjusted Arial fallbacks. The root layout
preloads only the original four Latin files (marked `-s.p.`); remaining
subsets load on demand. Filenames retain the build's content hashes and are
immutable-cached. A font update must use new filenames, never overwrite them.

Upstream sources and included SIL Open Font License notices:

- [DM Sans](https://github.com/google/fonts/tree/main/ofl/dmsans): `dmsans-OFL.txt`
- [Inter](https://github.com/google/fonts/tree/main/ofl/inter): `inter-OFL.txt`
- [DM Mono](https://github.com/google/fonts/tree/main/ofl/dmmono): `dmmono-OFL.txt`

`manifest.json` records SHA-256 checksums of the pinned files. The font contract
test verifies each byte checksum, CSS reference, preload selection, and family
boundary. When updating, review the source, license, metrics, weights, and
Unicode coverage together, then run typography E2E checks in all three engines.
