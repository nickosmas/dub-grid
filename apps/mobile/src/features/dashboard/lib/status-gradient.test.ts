import { describe, expect, it } from "vitest";
import { buildStatusGradient } from "./status-gradient";

const HEX = { warning: "#F59E0B", danger: "#EF4444" };

describe("buildStatusGradient", () => {
  it("is nothing at all when every section is neutral", () => {
    expect(
      buildStatusGradient(
        [
          { key: "a", tone: "neutral" },
          { key: "b", tone: "neutral" },
        ],
        HEX,
        0.2,
      ),
    ).toBeNull();
  });

  it("spaces one stop per section from the top edge to the bottom, in that section's tone", () => {
    const gradient = buildStatusGradient(
      [
        { key: "coverage", tone: "neutral" },
        { key: "approvals", tone: "warning" },
        { key: "overtime", tone: "danger" },
        { key: "activity", tone: "neutral" },
      ],
      HEX,
      0.2,
    );

    expect(gradient?.locations.map((l) => Number(l.toFixed(3)))).toEqual([0, 0.333, 0.667, 1]);
    // Neutral runs take the neighbour's RGB at zero alpha, never "transparent".
    expect(gradient?.colors).toEqual([
      "rgba(245, 158, 11, 0)",
      "rgba(245, 158, 11, 0.2)",
      "rgba(239, 68, 68, 0.2)",
      "rgba(239, 68, 68, 0)",
    ]);
  });

  it("still makes a gradient from a single coloured section", () => {
    const gradient = buildStatusGradient([{ key: "overtime", tone: "danger" }], HEX, 0.2);

    expect(gradient?.locations).toEqual([0, 1]);
    expect(gradient?.colors).toHaveLength(2);
  });
});
