import { describe, expect, it } from "vitest";
import { groupFreeDays } from "./free-days";

const week = (flags: Array<"free" | "shift" | "changed">) =>
  flags.map((flag, index) => ({
    date: `2026-12-0${index + 1}`,
    free: flag !== "shift",
    changed: flag === "changed",
  }));

describe("groupFreeDays", () => {
  it("folds free days in a row into one row from the first to the last", () => {
    expect(
      groupFreeDays(week(["free", "free", "free", "shift", "free", "free", "shift"]), "x"),
    ).toEqual([
      { kind: "free", from: "2026-12-01", to: "2026-12-03" },
      { kind: "day", date: "2026-12-04" },
      { kind: "free", from: "2026-12-05", to: "2026-12-06" },
      { kind: "day", date: "2026-12-07" },
    ]);
  });

  it("keeps a lone free day as a day of its own", () => {
    expect(groupFreeDays(week(["shift", "free", "shift"]), "x")).toEqual([
      { kind: "day", date: "2026-12-01" },
      { kind: "day", date: "2026-12-02" },
      { kind: "day", date: "2026-12-03" },
    ]);
  });

  it("gives today a row of its own inside a run of free days", () => {
    expect(groupFreeDays(week(["free", "free", "free", "free", "shift"]), "2026-12-03")).toEqual([
      { kind: "free", from: "2026-12-01", to: "2026-12-02" },
      { kind: "day", date: "2026-12-03" },
      { kind: "day", date: "2026-12-04" },
      { kind: "day", date: "2026-12-05" },
    ]);
  });

  it("keeps a day whose shift was removed, which says what it was", () => {
    expect(groupFreeDays(week(["free", "changed", "free", "free"]), "x")).toEqual([
      { kind: "day", date: "2026-12-01" },
      { kind: "day", date: "2026-12-02" },
      { kind: "free", from: "2026-12-03", to: "2026-12-04" },
    ]);
  });
});
