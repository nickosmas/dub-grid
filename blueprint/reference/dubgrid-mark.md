# DubGrid mark

The approved mark, supplied 2026-09-18: four rounded squares in a pinwheel.
`dubgrid-mark.png` is a render of the shipped geometry, not the original
artwork.

- Solid diagonal runs top-right to bottom-left.
- The other diagonal is the same colour at `0.3` opacity, which over white
  gives `#BED0F9`.
- Gap is `4.5%` of the mark's width; corner radius is `20%` of a cell.

One definition per surface, all matching:

| Surface                      | File                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| Web component                | `apps/web/src/components/Logo.tsx`                          |
| Web animated (route loaders) | `apps/web/src/components/AnimatedDubGridLogo.tsx`           |
| Web OG and social cards      | `apps/web/src/app/logo-grid.tsx`                            |
| Web report PDFs              | `apps/web/src/features/reports/server/operations.ts`        |
| Mobile component             | `apps/mobile/src/shared/components/DubGridLogo.tsx`         |
| Mobile animated              | `apps/mobile/src/shared/components/AnimatedDubGridLogo.tsx` |
| Shipped SVG                  | `apps/web/public/logo.svg`                                  |
| Every raster asset           | `scripts/generate-logo-assets.ts`                           |

Regenerate the rasters with `npx tsx scripts/generate-logo-assets.ts` after any
change to the geometry above.
