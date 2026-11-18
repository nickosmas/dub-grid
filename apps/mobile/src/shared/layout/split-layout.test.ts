import { describe, expect, it } from "vitest";
import { getSplitLayout } from "./split-layout";

describe("getSplitLayout", () => {
  it("shows one page at a time on a phone or the closed Duo", () => {
    expect(getSplitLayout({ width: 466, height: 678, hinge: "closed" })).toBeNull();
    expect(getSplitLayout({ width: 402, height: 874, hinge: "unknown" })).toBeNull();
  });

  it("gives the list 360 when the Duo is open and held wide", () => {
    expect(getSplitLayout({ width: 951, height: 669, hinge: "fullyOpen" })).toEqual({
      listWidth: 360,
    });
  });

  it("splits at the fold when partly folded and held wide", () => {
    expect(getSplitLayout({ width: 951, height: 669, hinge: "partiallyOpen" })).toEqual({
      listWidth: 476,
    });
  });

  it("keeps a narrow list when held tall, folded or not", () => {
    expect(getSplitLayout({ width: 669, height: 951, hinge: "fullyOpen" })).toEqual({
      listWidth: 300,
    });
    expect(getSplitLayout({ width: 669, height: 951, hinge: "partiallyOpen" })).toEqual({
      listWidth: 300,
    });
  });

  it("splits a wide screen with no hinge, such as an iPad", () => {
    expect(getSplitLayout({ width: 1024, height: 768, hinge: "unknown" })).toEqual({
      listWidth: 360,
    });
  });
});
