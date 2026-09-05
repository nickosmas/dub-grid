/**
 * How many sheets may be on screen at once, checked at runtime.
 *
 * iOS will not dismiss a presenting view controller while its presented child is
 * still mid-transition, and React Native drops that second
 * `dismissViewControllerAnimated:` without an error. The deeper the stack, the
 * more ways there are to reach that state, and the symptom is a sheet stranded
 * on screen behind a live backdrop with no way out.
 *
 * Depth is the part worth policing here because it is a plain count, true at any
 * instant, with no assumption about when React commits. Sequencing two
 * transitions is the other half of the problem and belongs to `useModalHandoff`.
 * (A same-commit detector was tried here first: under `act()` several commits
 * flush before any microtask, so it could not tell one commit from the next and
 * reported ordinary renders as violations.)
 *
 * When a surface is really a form rather than a question, the better answer than
 * either is a pushed route: a screen cannot stack over a sheet at all. That is
 * what the two staff-access editors became.
 */

/** A sheet, and one confirmation layered over it. Anything more is a bug. */
const MAX_VISIBLE_SHEETS = 2;

let visibleCount = 0;
let deepest: string[] = [];

function isTestEnv(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV === "test";
}

/**
 * Raised synchronously from inside the effect that broke the rule, so a test
 * fails on the offending render with a usable stack. Everywhere else warns: a
 * stranded sheet is bad, but shipping a crash over it is worse.
 */
function report(message: string): void {
  if (isTestEnv()) {
    throw new Error(`[modal-presentation] ${message}`);
  }
  console.warn(`[modal-presentation] ${message}`);
}

/** Called by `BottomSheetModal` as it becomes visible or hidden. */
export function trackSheetPresentation(kind: "show" | "hide", label: string): void {
  if (kind === "hide") {
    visibleCount = Math.max(0, visibleCount - 1);
    const index = deepest.lastIndexOf(label);
    if (index >= 0) deepest.splice(index, 1);
    return;
  }

  visibleCount += 1;
  deepest.push(label);

  if (visibleCount > MAX_VISIBLE_SHEETS) {
    report(
      `"${label}" is sheet number ${visibleCount} on screen (${deepest.join(" > ")}), ` +
        `past the limit of ${MAX_VISIBLE_SHEETS}. Close the one underneath before opening this ` +
        "(sequence the two through useModalHandoff), hide it while this is up, or make this a " +
        "pushed screen instead of a sheet.",
    );
  }
}

/** Test-only reset, so one suite's mounted sheets can't fail the next. */
export function resetSheetPresentationTracking(): void {
  visibleCount = 0;
  deepest = [];
}

export function getVisibleSheetCount(): number {
  return visibleCount;
}
