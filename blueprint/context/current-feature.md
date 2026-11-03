# Current Feature

## Filled status icons in toasts and banners

**Type:** Fix
**Status:** in progress
**Branch:** `fix/filled-status-icons`

## The problem

Toasts and banners mark their tone with a small outlined icon (16 or 20px on
web, 16 to 24pt on mobile), so a success, an error and a warning read alike at
a glance, and the Android toast has no icon at all. The owner wants the tone to
stand out (2026-11-02).

## The fix

Owner decisions (2026-11-02, the "Mobile toasts, solid" canvas):

**Toasts: a large filled icon.** Each tone is a filled shape with a white mark:
success a green circle with a check (`#16A34A`), warning an amber triangle with
! (`#F59E0B`), information a blue circle with i (`#2563EB`), error a red
octagon with ! (`#DC2626`).

- Web: the icon is 28px and the card's content centers on it; the card,
  timing, Undo and close stay as shipped.
- iOS: the Liquid Glass capsule stays; the icon is a 28pt SF Symbol
  (`checkmark.circle.fill`, `exclamationmark.triangle.fill`,
  `info.circle.fill`, `exclamationmark.octagon.fill`, offline
  `wifi.slash`), drawn in palette with the white mark.
- Android: the snackbar takes iOS's colours (the surface in light and dark,
  not Material's inverse), a 28dp Material icon (`check-circle`, `warning`,
  `info`, `report`, offline `cloud-off`), and the title above the message.

**Banners: the same icons, solid, banners unchanged.** Backgrounds, borders,
text and buttons stay as they are.

- Web `Banner`: the tone icon is 20px and drawn solid from its Lucide shape
  with the marks cut out to the banner's background; error uses the octagon.
  An own icon with a solid form (lock, hourglass, clock, mail, moon, mask, eye,
  shield) is drawn solid without a circle; any other own icon sits white in a
  tone-coloured circle. The colour is checked against each tint: light
  `#DC2626`, `#D97706`, `#2563EB`, `#15803D`; dark `#F87171`, `#FBBF24`,
  `#60A5FA`, `#4ADE80`. A bar draws the icon white with the cut-outs in the
  bar's colour.
- Mobile `StatusBanner` and People `SectionNotice`: the same filled symbols
  in the same colours, the error and danger icon an octagon; sizes stay (24,
  48 and 18pt).

Must not break: toast timing, dedupe, actions and dismissal; every banner's
copy, role and action; the `toast-notification` and `offline-toast` test ids.

## Build steps

- [ ] **1. Shared tone colours.** `@dubgrid/design-tokens` gains the toast
      fills and the banner icon colours per theme, tested.
- [ ] **2. Web.** A solid status icon component; `AppToaster` and its CSS use
      it at 28px; `Banner` draws its tone and own icons solid at 20px.
- [ ] **3. Mobile.** A `ToneSymbol` (SF Symbols on iOS, Material icons
      elsewhere); the iOS and Android toasts, `StatusBanner` and
      `SectionNotice` use it; Android takes the surface colours and stacked
      text.

**Done when:** `npm run type-check`, `npm run lint`, `npm run test:web` and
`npm run test:mobile` pass.

## Verify

- Web, light and dark: each toast tone, and a box banner, an own-icon banner
  and the away bar.
- Android emulator and iOS Simulator, light and dark: each toast tone and an
  inline and centered status banner.

## Out of scope

- Banner backgrounds, borders and copy.
- The rest of the parked mobile toast spec (shared timing, actions).
