import type { EmptySceneShape } from "./scenes";

/** A week the two "this week" scenes draw: one letter per day, and which is today. */
export type EmptySceneWeek = {
  letters: readonly string[];
  todayIndex: number;
};

const BAR_LEFT = 10;
const BAR_STEP = 27;
const BAR_WIDTH = 22;

/**
 * The canvas's week scenes for the viewer's own week, so the letters follow
 * its first day and the marks fall on the right days. An empty week is all
 * dashed with a dot on today; a finished one fills and checks the days
 * before today and leaves the rest dashed.
 */
export function weekSceneShapes(
  kind: "me-week-empty" | "me-week-done",
  week: EmptySceneWeek,
): EmptySceneShape[] {
  const shapes: EmptySceneShape[] = [];
  week.letters.slice(0, 7).forEach((letter, index) => {
    const x = BAR_LEFT + BAR_STEP * index;
    const done = kind === "me-week-done" && index < week.todayIndex;
    shapes.push(
      done
        ? { shape: "rect", x, y: 4, width: BAR_WIDTH, height: 108, rx: 9, fill: "ink" }
        : {
            shape: "rect",
            x: x + 2,
            y: 6,
            width: BAR_WIDTH - 4,
            height: 104,
            rx: 7,
            stroke: "ink",
            strokeWidth: 4,
            dash: "7 5",
          },
    );
    if (done) {
      shapes.push({
        shape: "path",
        d: `M${x + 5} 58L${x + 9.5} 62.5L${x + 17} 55`,
        stroke: "ground",
        strokeWidth: 3.5,
      });
    }
    shapes.push({ shape: "text", x: x + 11, y: 136, text: letter, size: 16, fill: "ink" });
  });
  if (kind === "me-week-empty" && week.todayIndex >= 0) {
    shapes.push({
      shape: "circle",
      cx: BAR_LEFT + BAR_STEP * week.todayIndex + 11,
      cy: 22,
      r: 6,
      fill: "ink",
    });
  }
  return shapes;
}
