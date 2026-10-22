# Fix: Schedule notes show as dots with their own room on the grid

**Type:** Fix
**Status:** verified

### The problem

On the web schedule grid (Week and 2 Weeks views) a shift's notes show as one
coloured sticky-note icon, or a stacked pair, pinned to the pill's corner with
`position: absolute` (`apps/web/src/components/schedule-grid/noteDots.tsx`).
Three problems, the first in the corner the dots must leave to the mentored M:

- **A change chip moves the M.** When a mentored pill shows a "New" or
  "Edited" chip (a draft, or the last publish), the grid passes
  `topInset={19}` to `MentoredShiftBadge` (`ScheduleGrid.tsx`, the single
  pill and each pill of a double shift). On a 43px pill that puts the M in
  the bottom-right, where the dots are meant to go. The push cleared a chip
  in the top-right corner; since 39224ce2 every chip straddles the top-left
  edge instead, so it now avoids nothing.
- **It hides notes.** Past two notes the stack looks the same, so a third or
  fourth note cannot be seen at all.
- **Nothing reserves its space.** The mark is laid over centred text. In the
  replica grid it sits 0px from other content, and on a mentored pill with
  four notes it runs into the job code. A longer label or a narrower column
  makes this worse.

The chosen design is prototype variant A1, the bottom lane:
<https://claude.ai/artifact/W4eeN3HauYS3UJ1iicUKQp>.

### The fix

Replace the grid's corner mark with a row of dots in space the pill reserves
for them.

| Rule                      | Value                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dot size                  | 9px, the same in every state                                                                                                                                         |
| Published                 | Filled with the note's colour, 1px inset rim in the pill's text colour                                                                                               |
| Added, not published      | Hollow: 1.75px inset ring in the note's colour (lightened on dark pills, as today)                                                                                   |
| Added in the last publish | Filled, 1.75px inset ring in the publish "new" green (`getPublishDiffTone("new")`)                                                                                   |
| How many                  | At most 2 dots, then a `+n` count in the pill's text colour. On a double shift's pill (about 30px inside in 2 Weeks), more than two notes show one dot and the count |
| Where                     | Right-aligned in a 13px strip along the pill's bottom, 6px from the right edge                                                                                       |
| Second line of text       | A pill showing custom times or a job line has no strip; its dots end the last line instead                                                                           |

Rings are drawn inside the dot (inset `box-shadow`), so no state looks larger
or smaller than another. Only pills with notes reserve the strip.

It must not break:

- **The mentored M** keeps the top-right corner, and so do the lock avatar,
  the request fold and the diff badges.
- **Focus-area wings** on cross-focus pills keep their width; the dots never
  sit on them.
- **The author name** shown on a draft or audited pill stays readable. It
  overlays the pill's bottom-left, about 19px tall, so it shares the bottom
  row with the strip: it keeps its `noteMarksWidth` reservation and stops
  short of the dots. (A pill has about 38px inside, too little for the strip
  to sit above it.)
- **Name-mode labels** that would wrap to two lines keep to one line, with an
  ellipsis, on a pill with notes: the strip takes the second line's room.
- **Hover and screen readers** still name every note, hidden ones included:
  the hint and `aria-label` list all notes with their state suffix.
- **Note states** keep their meaning: removals show no dot, as today.
- **Inline placements** (Month view, phone Day view, dashboard) keep the
  text-coloured `ScheduleNoteIcon`; `placement="inline"` is unchanged.

### Build steps

- [x] **1. The mentored M stays in the top-right.** Drop the `topInset`
      push from all three `MentoredShiftBadge` call sites in
      `ScheduleGrid.tsx` (the single pill, each pill of a double shift, and
      the deleted-shift pill, whose "Deleted" chip always pushed it down),
      and remove the prop and its stale "top-right change chip" doc from
      `badges.tsx`. The lock-avatar clearance (`rightInset`) is unchanged.
      _Done when_ `ScheduleGrid.test.tsx` shows a mentored single pill and a
      mentored pill of a double shift, each with a draft chip and each with a
      publish chip, keeping the M at `top: 0.5px`, and the existing
      lock-avatar test still passes.
- [x] **2. Dots replace the corner mark.** In `noteDots.tsx`, the `corner`
      placement renders up to two dots and a `+n` count instead of the
      sticky-note glyph and stack. A pure helper splits the marks into the
      shown dots and the overflow count. Replace `NOTE_ICON_SIZE`,
      `NOTE_STACK_SIZE` and `noteMarksWidth` in `badges.tsx` with
      `NOTE_DOT_SIZE`, `NOTE_DOT_GAP`, `NOTE_LANE_HEIGHT` and
      `MAX_VISIBLE_NOTE_DOTS`. Each dot carries `data-note-mark="<state>"`;
      the count carries `data-note-more="<n>"`.
      _Done when_ `noteDots.test.tsx` covers 1, 2 and 5 notes (two dots and
      `+3`), the same rendered size for all three states, the overflow
      helper, and a label naming every note.
- [x] **3. The grid reserves the room.** In `ScheduleGrid.tsx`, every branch
      that draws notes puts them in flow instead of over the pill: the single
      pill, each pill of a double shift, the cell-level fallback when segments
      do not line up with pills (the last pill's strip), and both deleted-shift
      pills. Pills with a second text line end it with the dots. The author
      badge keeps its note reservation, measured to the dots in the strip.
      _Done when_ `ScheduleGrid.test.tsx` asserts dots, not glyphs, in each
      branch, including a third note shown as `+1`, and no `[data-note-dots]`
      element is absolutely positioned.
- [x] **4. Browser qualification.** On the local grid, signed in as the QA
      account, check light and dark, Week and 2 Weeks, for: a code with a job
      code, a mentored pill, a mentored pill with a draft chip, a cross-focus
      pill, custom times, a double shift, shift names, and a mentored pill
      with four notes.
      _Done when_ a measurement script, like the prototype's, finds no dot or
      count intersecting text, the M or a wing, and screenshots of each case
      are attached to the step.
      _Evidence:_ see Qualification evidence below.

### Qualification evidence

Run on 2026-10-19 against the worktree's dev server on :3002, Calm Haven
9/20 to 10/3, with temporary notes, a segment and drafts added and then
removed. Every dot and count was measured against the glyph boxes of the pill's
text (clipped to its truncation), the M, the wing, change chips and the
author chip. Dots are 9x9px in every state and end 7px inside the pill.

| View    | Theme       | Mode  | Pills with notes | Overlaps | Closest |
| ------- | ----------- | ----- | ---------------- | -------- | ------- |
| 2 Weeks | dark, light | codes | 8                | 0        | 2.2px   |
| 1 Week  | dark, light | codes | 6                | 0        | 3.6px   |
| 2 Weeks | dark, light | names | 8                | 0        | 4px     |

The first run found a double shift's half (about 30px inside in 2
Weeks) clipping its first dot behind two dots and `+1`; the owner chose
one dot and the count there, after which it reads `● +2` inside the
pill. Covered: code with job (Richard B, Mon 21), mentored (Christine
P), mentored with an "Edited" chip (M at `top: 0.5px`, dots 6px below
it), cross-focus wing (Brian S), custom times (Carol H), a mentored
double shift, shift names, four notes on a mentored pill (Raymond C,
`+2`), and an author chip (3px clear). Screenshots are in the session.
Not a dot issue, left as found: on a double shift's half the M already
sits over the job code, and an "Edited" chip now covers part of it.

### Verify

- `npm run type-check`, `npm run lint` and `npm run test:web` pass.
- Step 4's measurement reports zero overlaps in both themes.
- A mentored pill keeps its M in the top-right while it shows a draft chip.
- Hovering a pill with three notes lists all three.

Local Calm Haven opened as is for step 4 (trialing until 2027-01-17); no
billing change was needed.

### Out of scope

- Month view, the phone Day view, the dashboard, print and the mobile app:
  they keep their current note marks. Dots there can follow as their own fix.
- Note colours and note types in Settings.
