/**
 * Geometry for the schedule grid's sticky focus-area label and date row.
 *
 * The pair is a native `position: sticky` group so the compositor moves it in
 * lockstep with the page. That rules out keeping the date row inside the
 * horizontal scroller (a scroll container would become its scrollport), so the
 * header lives in its own mirrored scroller above the card body instead.
 */

/** Staff rows kept clear of the sticky group at the bottom of a section. */
export const STICKY_RELEASE_ROWS = 5;

/**
 * How far a change chip hangs above its row's top edge. The card body reserves
 * this much transparent padding so the first row's chip can paint over the
 * header cap while the group is at rest, exactly as it hangs into the row above
 * everywhere else.
 */
export const CHIP_OVERHANG_PX = 6;

export interface StickyReleaseInsetInput {
  /** Viewport y of the card body's bottom edge. */
  cardBottom: number;
  /** Viewport y of the release anchor row, or null when the section has none. */
  releaseRowTop: number | null;
}

/**
 * A sticky element is confined to its containing block's content box. Padding
 * the section by this inset (and pulling the card body back up by the same
 * amount, so nothing moves visually) ends that content box at the release row,
 * which makes the group slide away that many pixels before the section ends.
 */
export function computeStickyReleaseInset({
  cardBottom,
  releaseRowTop,
}: StickyReleaseInsetInput): number {
  if (releaseRowTop == null) return 0;
  if (!Number.isFinite(cardBottom) || !Number.isFinite(releaseRowTop)) return 0;
  return Math.max(0, cardBottom - releaseRowTop);
}

/** One step of a layout task. Even steps only read layout; odd steps only write it. */
export type LayoutStep = () => void;

/** Builds a fresh set of steps each time its section is measured. */
export type LayoutTask = () => readonly LayoutStep[];

/**
 * Runs every task's first step, then every task's second, and so on. With reads
 * and writes on alternate steps, measuring N sections costs one style and
 * layout pass per read step rather than one per section.
 */
export function runLayoutSteps(tasks: ReadonlyArray<readonly LayoutStep[]>): void {
  const depth = tasks.reduce((max, task) => Math.max(max, task.length), 0);
  for (let step = 0; step < depth; step += 1) {
    for (const task of tasks) task[step]?.();
  }
}

export interface StickyLayoutObserver {
  /** Runs `task` whenever `target` resizes, and once when first observed. Returns a stop function. */
  observe(target: Element, task: LayoutTask): () => void;
}

/**
 * One ResizeObserver shared by every section. A delivery runs each affected
 * section's task together through runLayoutSteps. ResizeObserver delivers after
 * the browser lays the frame out and before it paints, so the first reads find
 * layout done, the writes still land before the paint, and observing a new
 * element delivers its initial size the same way.
 */
export function createStickyLayoutObserver(Observer: typeof ResizeObserver): StickyLayoutObserver {
  const tasksByTarget = new Map<Element, Set<LayoutTask>>();
  const observer = new Observer((entries) => {
    const due = new Set<LayoutTask>();
    for (const entry of entries) {
      tasksByTarget.get(entry.target)?.forEach((task) => due.add(task));
    }
    runLayoutSteps([...due].map((task) => task()));
  });

  return {
    observe(target, task) {
      let tasks = tasksByTarget.get(target);
      if (!tasks) {
        tasks = new Set();
        tasksByTarget.set(target, tasks);
        observer.observe(target);
      }
      tasks.add(task);
      return () => {
        const current = tasksByTarget.get(target);
        if (!current?.delete(task) || current.size > 0) return;
        tasksByTarget.delete(target);
        observer.unobserve(target);
      };
    },
  };
}
