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

  it("runs from the first attention tone on the page to the second", () => {
    const gradient = buildStatusGradient(
      [
        { key: "coverage", tone: "neutral" },
        { key: "approvals", tone: "warning" },
        { key: "overtime", tone: "danger" },
        { key: "open-shifts", tone: "danger" },
        { key: "activity", tone: "neutral" },
      ],
      HEX,
      0.2,
    );

    // Two stops and only two, whatever the page holds.
    expect(gradient).toEqual({
      colors: ["rgba(245, 158, 11, 0.2)", "rgba(239, 68, 68, 0.2)"],
      locations: [0, 1],
    });
  });

  it("fades a single tone to clear in its own RGB, never to transparent", () => {
    const gradient = buildStatusGradient(
      [
        { key: "overtime", tone: "danger" },
        { key: "activity", tone: "neutral" },
      ],
      HEX,
      0.2,
    );

    expect(gradient).toEqual({
      colors: ["rgba(239, 68, 68, 0.2)", "rgba(239, 68, 68, 0)"],
      locations: [0, 1],
    });
  });
});
