# Fix: A refined access star, with a soft bevel and a truer gold

**Type:** Fix
**Status:** complete
**Branch:** `fix/access-insignia-bevel`
**Owner decisions (2026-11-11):** on the "Admin insignia, glass" prototype
canvas (https://claude.ai/artifact/SVRVb3EMLLrRUM7KzeqZYY), after trying glass,
enamel, frosted and faceted finishes, six shapes and twelve icons: "the 3d
effect should be subtle" and "only be on the circle edges", "I like how soft
bevel appears on all sizes", the star "should be accurate" at small sizes,
the gold "more yellow than brown" then "more gold", and "I'll stick with
circle and star". Then "Use #C9920A" over the canvas's `#DCA312`, for
contrast. The prototype is approved; this spec builds it.

## The problem

The access star (`AccessInsignia`, beside the name of an Admin or Super Admin
on web and mobile) is a flat disc. The owner wants it more refined and
premium without becoming heavy. Two smaller faults come with it:

- The Super Admin gold, `#D97706`, reads brown beside a name.
- Web and mobile draw different stars: web draws its own centered polygon,
  mobile uses the MaterialCommunityIcons `star` glyph at 13/16 or 16/20 of
  the disc.

## The change

The badge keeps its shape, icon, sizes, colors per role, label, hint and the
`pull` toward the name. Only its finish, its star and the gold change.

| Part           | Rule                                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape and icon | A circle with a five-point star, as today.                                                                                                                                                                                         |
| Edge           | A soft bevel on the circle's edge only: a 1px line lit along the top (white at 30%) and a 1px line shaded along the bottom (black at 16%). The same pixel width at every size.                                                     |
| Face and star  | Flat. No gloss, gradient, facets or drop shadow. The star is white.                                                                                                                                                                |
| Star size      | Sized to the face inside the 1px edge, not to the whole circle, so a 14px badge is a true scaled-down copy of a 20px one. Same star geometry as web today: outer radius 7.6 and inner 3.4 in a 24 box, stroked 2 with round joins. |
| Admin          | Brand blue, as today (`#2563EB` light, `#2075FF` dark on web).                                                                                                                                                                     |
| Super Admin    | Gold `#C9920A`, in both themes, replacing `#D97706`.                                                                                                                                                                               |

`insigniaGold` (`@dubgrid/design-tokens`, light and dark) and
`--dg-color-insignia-gold` (`globals.css`) are used only by the two
`AccessInsignia` components, so the new gold changes nothing else. The
neighbouring `#D97706` values (`warning-dark`, banner and pill warnings, the
coverage wash, `colors.ts` `modified`) are different tokens and stay.

**Must not break:** plain users, members with no account and platform roles
stay unmarked; the label and hint stay "Admin" and "Super Admin"; sizes stay
14, 16 and 20px on web and 16 and 20 on mobile; a long name still shrinks
before the badge does.

**Accessibility (owner accepted, 2026-11-11):** white on `#C9920A`, and the
badge against a white page, are about 2.8:1, down from 3.2:1 with `#D97706`
and just under the 3:1 WCAG asks of graphics. The owner chose it over the
canvas's `#DCA312` (about 2.3:1). The label and hint still name the role, so
nothing is lost to a screen reader.

## Build steps

- [x] **1. Shared star and new gold.** Add `access-insignia.ts` to
      `@dubgrid/design-tokens` exporting the star's points in a 24 box (moved from
      web's `STAR_POINTS`), its stroke width, and the bevel's edge width and two
      colors, with a test that the star is centered in the box and spans the
      same share of it as today. Change `insigniaGold` (light and dark) and
      `--dg-color-insignia-gold` to `#C9920A` and fix the comments beside them,
      which describe a surface ring the badge doesn't draw. Rebuild packages.
      **Done when:** the new test passes, both token sources read `#C9920A`, and
      `npm run type-check` passes.
- [x] **2. Web badge.** `components/staff/AccessInsignia.tsx`: the chip keeps
      its color and gains the bevel as two inset shadows (`inset 0 1px 0`
      white 30%, `inset 0 -1px 0` black 16%); the star `svg` sits 1px in from
      each side and draws the shared points. Update `AccessInsignia.test.tsx`
      for the bevel and the inset star. **Done when:** the web test passes, and
      a browser screenshot shows the badge at 14, 16 and 20px in the People
      list, the staff page header and a panel, in light and dark.
- [x] **3. Mobile badge.** `shared/components/AccessInsignia.tsx`: draw it with
      `react-native-svg` at the badge's pixel size: the filled circle, a 1px
      ring at radius minus half a pixel stroked with a vertical gradient from
      the lit top to the shaded bottom, and the shared star scaled to the face
      inside the ring. Drop the MaterialCommunityIcons star. **Done when:**
      `npm run type-check` and `npm run test:mobile` pass, and iOS Simulator and
      Android emulator screenshots show the badge in the People list (16pt) and
      a profile header (20pt), in light and dark, matching web.
      _Seen on the iOS Simulator (People row 16pt, profile and person headers
      20pt, light and dark). Not yet seen on an Android emulator._

## Verify

1. Web: open People as a Super Admin. Admins carry a blue star, Super Admins
   a gold one, each with a faint light top edge and dark bottom edge; open a
   person and see the 20px badge beside their name. Switch to dark.
2. Mobile: open People and a person who is an Admin, on iOS and Android, in
   light and dark.
3. At 14px the star sits clear of the edge and looks the same as at 20px,
   only smaller.
4. `npm run type-check`, `npm run test:web`, `npm run test:mobile` and the
   design-tokens tests pass.

## Shipped

- `packages/design-tokens/src/access-insignia.ts` (with its test): the star's
  points in a 24 box, its stroke, and the 1px bevel colors, shared by both apps.
  `insigniaGold` (light and dark) and `--dg-color-insignia-gold` are `#C9920A`.
- `apps/web/src/components/staff/AccessInsignia.tsx`: inset shadows for the
  bevel and the shared star at the badge less 2px (12, 14, 18px).
- `apps/mobile/src/shared/components/AccessInsignia.tsx`: `react-native-svg`
  circle, a gradient 1px ring and the shared star, replacing the
  MaterialCommunityIcons glyph. The test stub for `react-native-svg` gained
  `Polygon`, `Defs`, `LinearGradient` and `Stop`.

**Evidence (2026-11-11):** `npm run type-check`, `npm run lint`,
`npm run test:web` (7,779 tests), `npm run test:mobile` (1,691) and the
design-tokens tests (111) passed in the worktree. In the local app the web
badge measured `rgb(201, 146, 10)` with both inset shadows at 14px (People
list) and 20px (staff page), light and dark; the iOS Simulator showed it at
16pt (People list) and 20pt (profile and person headers), light and dark.
Not observed: an Android emulator, and a blue Admin badge in a running app
(the local org shows no Admin with an account; covered by tests). The iOS
shaded edge reads slightly heavier than web's, since mobile shades along the
ring.
