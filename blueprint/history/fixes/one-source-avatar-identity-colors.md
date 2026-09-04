# Current Feature

**Title:** One source of truth for avatar colors, with a more vibrant palette

**Type:** Fix

**Status:** verified

## The problem

Avatar color is identity: the same person should look the same everywhere. It
did not.

`packages/design-tokens/src/avatar-tone.ts` already held a shared palette and
was the only person-to-color hash in the repo, and mobile consumed it cleanly
through a one-line re-export. Three things were wrong anyway.

1. **Eight web surfaces bypassed the palette.** The signed-in header avatar, the
   Gridmaster header, the mobile nav sheet, and the schedule-grid peer-editor
   marker were flat brand blue. The person detail page at `/people/[id]` was
   neutral gray. The landing mockups still used the continuous `hsl()` hue
   rotation the palette was written to replace.

2. **The seed was inconsistent.** Presence hashed the auth user id while the
   people table and detail panels hashed the employee id. `Employee.userId`
   exists, so the same human was hashed two different ways and got two different
   colors depending on the page. `DirectoryPerson.personId` was worse: a
   composite like `u:<uuid>` that could never match either id.

3. **The colors were washed out.** Light backgrounds sat near OKLCH L 0.93 with
   very little chroma, so a chip read as a gray tint rather than a color.

## The fix

| Concern                   | Owner                                             |
| ------------------------- | ------------------------------------------------- |
| What color is this person | `getAvatarTone(seed, isDark)`, one palette        |
| Which id identifies them  | `resolveAvatarSeed`, account id first             |
| Which theme               | `useAvatarTone` on web, `useIsDarkMode` on mobile |
| How the chip is drawn     | 1px border in the slot's own darker shade         |

The palette row now carries only `{ name, light, dark }`. Presence draws the
same chip as every other surface, so the separate gradient
(`getAvatarGradientTone`, `AvatarGradientTone`, the `base`/`baseDeep` stops, and
`avatarGradientCss`) was removed rather than left as dead code inviting the same
divergence back.

Semantic avatars are deliberately untouched: staff-hours avatars stay red for
overtime and the Gridmaster all-users avatars stay role-tinted, because there
the color carries meaning rather than identity.

## Build steps

- [x] **1. Regenerate the palette in OKLCH.** Ten chromatic slots 36 degrees
      apart at close to the highest chroma each hue can hold, plus one desaturated
      slate. Light backgrounds moved from L 0.93 to L 0.82. A first pass at uniform
      chroma collapsed `slate` into `blue` and `amber` into `brown`, so adjacent
      slots also alternate lightness. `brown` and `violet` are gone; `magenta`,
      `orange`, and `lime` replace them. Slot indices are preserved, so a seed keeps
      its position.

- [x] **2. One seed rule.** `resolveAvatarSeed` prefers the linked account id and
      falls back to the employee id. Applied across web and mobile, including
      `getDirectoryPersonAvatarSeed` for the composite `personId`, an `avatarSeed`
      threaded through `DashboardScheduleItem`, and mobile's profile hero, which had
      preferred the employee id, the opposite of everything else. `cellEditors` was
      widened to carry `userId` so the grid marker can seed at all.

- [x] **3. Migrate the bypassing surfaces.** Added `useAvatarTone`, modelled on
      the existing `useShiftPillColors`. Header, Gridmaster header, mobile nav sheet
      (colors stripped from `.dg-bottom-sheet-avatar`), grid marker, `/people/[id]`
      header, and the landing mockups now read the palette.

- [x] **4. Presence uses the same chip.** `PresenceAvatars` and the in-cell
      marker call `getAvatarTone`; the gradient machinery was deleted.

- [x] **5. Consistent thin borders.** Every avatar draws a 1px border in its own
      `tone.borderColor`. Fixed a neutral `ring-1 ring-[var(--dg-color-border)]`
      on the person detail header that painted a gray ring over the tone, three
      2px chips, and a colored `boxShadow` that only the read-only detail panel
      carried.

- [x] **6. Mobile cleanup.** Removed the hardcoded `#DBEAFE`/`#93C5FD`/`#1D4ED8`
      overflow-chip trio duplicated across two files with no dark variant, a baked
      `#2946C7` border that was always overridden, and the dead
      `meCollaboratorAvatar` styles. Settled `ScheduleScreen` on one dark-mode hook.

## Verify

- `npm run type-check` (24 tasks), `npm run test` (2893 web, 883 mobile, 34
  design-tokens), `npm run lint` (0 errors), `npm run build` - all pass.
- `avatar-tone.test.ts` gates the palette itself: every background/text pairing
  clears WCAG AA, and no two slots fall within an OKLab deltaE of 0.05. It also
  asserts `resolveAvatarSeed` prefers `userId`, which is the bug a contrast test
  cannot catch.

Browser evidence, signed in as `qa-super-admin@dubgrid.test` on
`pacific-wellness`, People and `/people/[id]` in both themes:

| Check                               | Result                                           |
| ----------------------------------- | ------------------------------------------------ |
| Chips measured                      | 14                                               |
| Neutral (gray) borders              | 0                                                |
| Borders not 1px                     | 0                                                |
| Leftover box shadows                | 0                                                |
| Console errors                      | 0                                                |
| Same person across table and detail | Slate `#B2B8C2` in both                          |
| Theme flip                          | `html.light` / `html.dark`, tones swap correctly |

Every measured hex matched the shipped palette exactly.

## Out of scope

- The overtime staff-hours avatars and the Gridmaster role-tinted avatars, where
  color is semantic.
- Initials helpers: web still has both `getInitials` and `getAvatarInitials`, and
  mobile has three copies. Only the schedule grid's inline copy was replaced,
  because that code was already being rewritten.
- Mobile was not driven in a simulator; its changes ride on the shared palette,
  type-check, and 883 passing mobile tests.
