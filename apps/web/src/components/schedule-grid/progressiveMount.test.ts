import { describe, expect, it } from "vitest";
import { initialGridMount, nextGridMount, sectionMount, type GridMount } from "./progressiveMount";

const CHROME = 100;
const ROW = 50;

describe("initialGridMount", () => {
  it("mounts everything when the whole grid fits the budget", () => {
    expect(initialGridMount([2, 3], 1000, CHROME, ROW)).toBe("all");
    expect(initialGridMount([], 1000, CHROME, ROW)).toBe("all");
  });

  it("mounts the first rows of the section the budget ends in", () => {
    // Section 0 takes 100 + 4 * 50 = 300 of 600; 300 left covers section 1's
    // chrome and 4 of its 10 rows.
    expect(initialGridMount([4, 10, 6], 600, CHROME, ROW)).toEqual({ sections: 1, rows: 4 });
  });

  it("mounts at least one row of a section that starts inside the budget", () => {
    expect(initialGridMount([10], 120, CHROME, ROW)).toEqual({ sections: 0, rows: 1 });
    expect(initialGridMount([10], 0, CHROME, ROW)).toEqual({ sections: 0, rows: 1 });
  });

  it("mounts a section whole when the budget ends on its last row", () => {
    expect(initialGridMount([4, 10], 300, CHROME, ROW)).toEqual({ sections: 1, rows: 0 });
    expect(initialGridMount([4, 10], 299, CHROME, ROW)).toEqual({ sections: 1, rows: 0 });
    expect(initialGridMount([4], 300, CHROME, ROW)).toBe("all");
  });
});

describe("nextGridMount", () => {
  it("completes the partly mounted section, then adds one section a step", () => {
    const steps: GridMount[] = [{ sections: 1, rows: 4 }];
    while (steps[steps.length - 1] !== "all") {
      steps.push(nextGridMount(steps[steps.length - 1], 4));
    }
    expect(steps).toEqual([
      { sections: 1, rows: 4 },
      { sections: 2, rows: 0 },
      { sections: 3, rows: 0 },
      "all",
    ]);
  });

  it("stays at all", () => {
    expect(nextGridMount("all", 3)).toBe("all");
  });

  it("finishes when sections were removed meanwhile", () => {
    expect(nextGridMount({ sections: 3, rows: 2 }, 2)).toBe("all");
  });
});

describe("sectionMount", () => {
  it("reads each section's share of a mount", () => {
    const mount: GridMount = { sections: 1, rows: 4 };
    expect(sectionMount(mount, 0)).toBe("full");
    expect(sectionMount(mount, 1)).toEqual({ rows: 4 });
    expect(sectionMount(mount, 2)).toBe("pending");
    expect(sectionMount({ sections: 1, rows: 0 }, 1)).toBe("pending");
    expect(sectionMount("all", 5)).toBe("full");
  });
});
