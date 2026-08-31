import { describe, expect, it } from "vitest";
import { mapInBatches } from "./async-batch";

describe("mapInBatches", () => {
  it("preserves input order", async () => {
    const result = await mapInBatches([1, 2, 3, 4, 5], 2, async (value) => value * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it("never runs more than the batch size at once", async () => {
    let running = 0;
    let peak = 0;

    await mapInBatches(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async (value) => {
        running += 1;
        peak = Math.max(peak, running);
        await Promise.resolve();
        running -= 1;
        return value;
      },
    );

    expect(peak).toBeLessThanOrEqual(3);
  });

  it("returns an empty array without invoking the task", async () => {
    let calls = 0;
    const result = await mapInBatches([], 5, async (value) => {
      calls += 1;
      return value;
    });

    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("rejects an invalid batch size", async () => {
    await expect(mapInBatches([1], 0, async (value) => value)).rejects.toBeInstanceOf(RangeError);
  });

  it("propagates a failing task", async () => {
    await expect(
      mapInBatches([1, 2], 2, async (value) => {
        if (value === 2) throw new Error("boom");
        return value;
      }),
    ).rejects.toThrow("boom");
  });
});
