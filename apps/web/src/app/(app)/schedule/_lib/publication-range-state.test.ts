import { describe, expect, it } from "vitest";
import {
  beginPublicationRangeLoad,
  completePublicationRangeLoad,
  failPublicationRangeLoad,
  getLoadedPublishedWindowState,
} from "./publication-range-state";

const dates = [new Date("2026-09-06T00:00:00"), new Date("2026-09-07T00:00:00")];

describe("publication range load state", () => {
  it("does not classify loading or failed requests as unpublished", () => {
    expect(getLoadedPublishedWindowState(beginPublicationRangeLoad(), dates)).toBeNull();
    expect(getLoadedPublishedWindowState(failPublicationRangeLoad(), dates)).toBeNull();
  });

  it("classifies a successful empty result as unpublished", () => {
    expect(getLoadedPublishedWindowState(completePublicationRangeLoad([]), dates)).toBe(
      "unpublished",
    );
  });

  it("classifies successful partial and complete publication results", () => {
    expect(
      getLoadedPublishedWindowState(
        completePublicationRangeLoad([{ startDate: "2026-09-06", endDate: "2026-09-06" }]),
        dates,
      ),
    ).toBe("partial");
    expect(
      getLoadedPublishedWindowState(
        completePublicationRangeLoad([{ startDate: "2026-09-06", endDate: "2026-09-07" }]),
        dates,
      ),
    ).toBe("published");
  });

  it("keeps known ranges while a refresh is loading or fails", () => {
    const ranges = [{ startDate: "2026-09-06", endDate: "2026-09-07" }];

    expect(beginPublicationRangeLoad(ranges).ranges).toEqual(ranges);
    expect(failPublicationRangeLoad(ranges).ranges).toEqual(ranges);
  });

  it("moves from an error through retry loading to a successful empty result", () => {
    const failed = failPublicationRangeLoad();
    const retrying = beginPublicationRangeLoad(failed.ranges);
    const retried = completePublicationRangeLoad([]);

    expect(getLoadedPublishedWindowState(failed, dates)).toBeNull();
    expect(getLoadedPublishedWindowState(retrying, dates)).toBeNull();
    expect(getLoadedPublishedWindowState(retried, dates)).toBe("unpublished");
  });
});
