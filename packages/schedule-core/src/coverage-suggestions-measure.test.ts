import { describe, expect, it } from "vitest";
import { measureCoverageChange } from "./coverage-suggestions";
import { DAY_CN, DAY_MA, ROW_CN, ROW_MA, buildWorld, toDay } from "./coverage-suggestions.fixture";

const MON = "2026-10-26";

describe("measureCoverageChange", () => {
  it("closes a gap when a person is added", () => {
    const world = buildWorld({ draft: { [`ana|${MON}`]: { work: [DAY_MA] } } });
    const result = measureCoverageChange(world, [
      { employeeId: "ben", dateKey: MON, side: "draft", day: toDay({ work: [DAY_MA] }) },
    ]);

    expect(result.effects).toEqual([
      expect.objectContaining({
        rowKey: ROW_MA,
        dateKey: MON,
        past: false,
        draftBefore: expect.objectContaining({ actual: 1, required: 2 }),
        draftAfter: expect.objectContaining({ actual: 2, required: 2 }),
      }),
    ]);
    expect(result).toMatchObject({ closes: 1, opens: 0, filled: 1, worsened: 0, clearsOver: 0 });
  });

  it("opens a gap when a person is removed", () => {
    const world = buildWorld({
      draft: { [`ana|${MON}`]: { work: [DAY_MA] }, [`ben|${MON}`]: { work: [DAY_MA] } },
    });
    const result = measureCoverageChange(world, [
      { employeeId: "ben", dateKey: MON, side: "draft", day: toDay({}) },
    ]);

    expect(result).toMatchObject({ closes: 0, opens: 1, filled: 0, worsened: 1 });
  });

  it("fills half a gap with a mentored person", () => {
    const world = buildWorld({ draft: {} });
    const result = measureCoverageChange(world, [
      {
        employeeId: "ana",
        dateKey: MON,
        side: "draft",
        day: toDay({ work: [DAY_MA], mentored: [DAY_MA] }),
      },
    ]);

    expect(result).toMatchObject({ closes: 0, filled: 0.5 });
  });

  it("reports every row a change counts in", () => {
    const world = buildWorld({
      draft: {
        [`ana|${MON}`]: { work: [DAY_MA] },
        [`ben|${MON}`]: { work: [DAY_MA] },
        [`cat|${MON}`]: { work: [DAY_MA] },
      },
    });
    const result = measureCoverageChange(world, [
      { employeeId: "cat", dateKey: MON, side: "draft", day: toDay({ work: [DAY_CN] }) },
    ]);

    expect(result.effects.map((effect) => effect.rowKey).sort()).toEqual([ROW_CN, ROW_MA].sort());
    expect(result).toMatchObject({ closes: 1, clearsOver: 1, opens: 0 });
  });

  it("changes only the published side for a published override", () => {
    const world = buildWorld({ draft: { [`ana|${MON}`]: { work: [DAY_MA] } } });
    const result = measureCoverageChange(world, [
      { employeeId: "ben", dateKey: MON, side: "published", day: toDay({ work: [DAY_MA] }) },
    ]);

    expect(result.effects).toEqual([
      expect.objectContaining({
        rowKey: ROW_MA,
        draftBefore: expect.objectContaining({ actual: 1 }),
        draftAfter: expect.objectContaining({ actual: 1 }),
        publishedBefore: expect.objectContaining({ actual: 1 }),
        publishedAfter: expect.objectContaining({ actual: 2 }),
      }),
    ]);
    expect(result).toMatchObject({ closes: 0, filled: 0 });
  });

  it("reports a started cell but counts nothing for it", () => {
    const world = buildWorld({ draft: {}, startedDateKeys: [MON] });
    const result = measureCoverageChange(world, [
      { employeeId: "ana", dateKey: MON, side: "draft", day: toDay({ work: [DAY_MA] }) },
    ]);

    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].past).toBe(true);
    expect(result).toMatchObject({ closes: 0, opens: 0, filled: 0 });
  });

  it("returns nothing for no overrides", () => {
    expect(measureCoverageChange(buildWorld({ draft: {} }), [])).toEqual({
      effects: [],
      closes: 0,
      opens: 0,
      filled: 0,
      worsened: 0,
      clearsOver: 0,
    });
  });
});
