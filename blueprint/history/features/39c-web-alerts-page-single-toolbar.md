# Feature: Web alerts page single toolbar

**From build-plan:** feature 39c
**Status:** verified

## Goal

The `/alerts` page becomes a list under one toolbar. The left sidebar (Inbox /
Archived), the separate All / Unread / Read tabs, and the header's Mark all
read button fold into the toolbar that already holds search, category,
priority, sort, select-all, and bulk actions, so every control the page has
sits in one row that wraps at narrow widths.

## In scope

- One `role="toolbar"` row above the list, in this order: Inbox / Archived
  segments (archived count), All / Unread / Read segments (unread count),
  search, category, priority, sort, select-all with the bulk actions that
  appear on selection, Mark all read. It wraps with a 12px gap; nothing clips
  or overlaps at 1440, 960, and 720 CSS px in light and dark.
- The page header keeps the `h1` "Alerts" and one description; the title no
  longer changes with the section.
- `FilterSidebar`, `FilterChip`, `ReadFilterTabs`, `activeViewMeta`, and the
  `.dg-alerts-layout` / `.dg-alerts-sidebar` CSS go away. Segments share one
  small `Segments` component (`role="group"`, `aria-pressed` buttons, the
  existing `dg-span-tabs` look). Switching sections still resets the read
  filter, as the sidebar did.
- The gridmaster portal's inbox view gets the same toolbar for free.

## Out of scope

- Row content and navigation (39b, done) and mobile (39d).
- New filters or a saved-filter feature.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - One toolbar.** Rewrite the toolbar in `AlertsInboxPage.tsx`
      to carry the section and read segments and Mark all read; drop the
      sidebar, the read tabs, the header button, their components, and the
      layout CSS. Add `__tests__/AlertsInbox.toolbar.test.tsx` proving: one
      `role="toolbar"` holds Inbox, Archived, All, Unread, Read, the search
      box, both selects, the sort button, Select, and Mark all read; pressing
      Archived queries `includeArchived: true` with `read: null`; pressing
      Unread queries `read: "unread"`; no `aside` or sidebar remains. _Done
      when:_ that test and the existing inbox tests pass and `npm run type-check` passes.

- [x] **Step 2 - Qualify.** `npm run test:web`, `npm run lint`,
      `npx playwright test e2e/alerts-states.spec.ts e2e/gridmaster-portal-states.spec.ts`;
      screenshots of `/alerts` at 1440, 960, and 720 CSS px in light and dark
      with nothing clipped or overlapping. _Done when:_ all pass and the six
      screenshots are captured.

## Files / areas

- `apps/web/src/app/(app)/alerts/AlertsInboxPage.tsx`,
  `apps/web/src/app/globals.css`,
  `apps/web/src/__tests__/AlertsInbox.toolbar.test.tsx` (new).

## Data / contracts

- None; the search query shape is unchanged.

## Testing

- The toolbar test above; existing `AlertsInbox.*` tests; the route markers
  in `e2e/role-variance*.spec.ts` and `gridmaster-portal-states.spec.ts` keep
  matching on the "Inbox" segment.

## Notes for the AI

- `InboxView` stays free of `next/navigation`.
- Keep the `dg-span-tabs` look for the segments but use `role="group"` with
  `aria-pressed`, not a tablist inside a toolbar.
- No em dashes in code, comments, or copy.
