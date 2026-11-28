# Fix: no "Correct this day" label above the name in the correction editor

**Type:** Fix
**Status:** complete
**Branch:** `fix/past-day-no-eyebrow`

### The problem

After `past-day-read-only`, a past day opens read only and its one button is
Correct this day. The correction editor that button opens still put "Correct
this day" above the person's name, repeating what was just pressed. The owner
asked for it to go (2026-11-28).

### The fix

The editor drops the label. The dialog keeps "Correct this day" as its
accessible name, and Save correction and the reason field still mark it as a
correction.

### Build steps

1. [x] **Drop the label.** Remove the eyebrow from `ShiftEditPanel.tsx`; the
       panel test asserts the editor has none.
       **Done when:** `ShiftEditPanel.test.tsx` passes (134 of 134).
