import { describe, expect, it } from "vitest";
import { sheetOpenSize, type SheetOpenSizeInput } from "./sheet-open-size";

const base: SheetOpenSizeInput = {
  isIos: true,
  floating: true,
  sizes: { header: 60, content: 300, footer: 0 },
  hasBarFooter: false,
  bottomInset: 34,
  topInset: 60,
  windowHeight: 900,
  scrollable: true,
  expandable: false,
  androidResizable: null,
};

describe("sheetOpenSize", () => {
  it("opens a scrolling iOS sheet at its content's height", () => {
    // grabber 16 + header 60 + content 300 - one inset 34 + gap 8
    expect(sheetOpenSize(base)).toEqual({
      naturalHeight: 350,
      overflows: false,
      resizable: true,
      snapPoints: [350],
    });
  });

  it("takes two insets off before iOS 26, where the system adds one below", () => {
    expect(sheetOpenSize({ ...base, floating: false }).naturalHeight).toBe(316);
  });

  it("counts a bar footer's height instead of the inset", () => {
    const size = sheetOpenSize({
      ...base,
      hasBarFooter: true,
      sizes: { ...base.sizes, footer: 80 },
    });
    expect(size.naturalHeight).toBe(464);
  });

  it("offers full height too when the sheet can expand", () => {
    expect(sheetOpenSize({ ...base, expandable: true }).snapPoints).toEqual([350, "100%"]);
  });

  it("opens full height when the content is taller than the screen", () => {
    const size = sheetOpenSize({ ...base, sizes: { ...base.sizes, content: 2000 } });
    expect(size.overflows).toBe(true);
    expect(size.snapPoints).toEqual(["100%"]);
  });

  it("opens at a share of the screen before the content is measured", () => {
    const size = sheetOpenSize({ ...base, sizes: { header: 0, content: 0, footer: 0 } });
    expect(size.naturalHeight).toBe(0);
    expect(size.snapPoints).toEqual([630]);
  });

  it("sizes a sheet that doesn't scroll to its content, with no detent", () => {
    expect(sheetOpenSize({ ...base, scrollable: false })).toMatchObject({
      resizable: false,
      snapPoints: undefined,
    });
  });

  it("keeps Android sized to its content unless it overflows", () => {
    const android = { ...base, isIos: false, floating: false };
    expect(sheetOpenSize(android)).toMatchObject({ resizable: false, snapPoints: undefined });
    expect(sheetOpenSize({ ...android, sizes: { ...base.sizes, content: 2000 } })).toMatchObject({
      resizable: true,
      snapPoints: ["100%"],
    });
  });

  it("holds Android's first choice while the sheet shows", () => {
    const android = { ...base, isIos: false, floating: false };
    expect(sheetOpenSize({ ...android, androidResizable: true })).toMatchObject({
      resizable: true,
      snapPoints: ["100%"],
    });
    expect(
      sheetOpenSize({
        ...android,
        androidResizable: false,
        sizes: { ...base.sizes, content: 2000 },
      }),
    ).toMatchObject({ resizable: false });
  });
});
