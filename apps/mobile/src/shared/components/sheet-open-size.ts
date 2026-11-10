import { mobileSpace } from "../theme/tokens";

/** The space `@expo/ui` puts between the grabber and a detent sheet's content. */
const IOS_GRABBER_SPACE = 16;
/** Before the content is measured, a sheet that scrolls opens at this share. */
const UNMEASURED_OPEN_SHARE = 0.7;
/** How far below the status bar the system's full-height sheet starts. */
const FULL_SHEET_TOP_GAP = 10;
export type SheetSizes = { header: number; content: number; footer: number };

export type SheetOpenSizeInput = {
  isIos: boolean;
  /** iOS 26 floats a sheet that isn't full height above the screen's foot. */
  floating: boolean;
  sizes: SheetSizes;
  hasBarFooter: boolean;
  bottomInset: number;
  topInset: number;
  windowHeight: number;
  scrollable: boolean;
  expandable: boolean;
  /**
   * Android's choice of sized or full screen, held while the sheet shows;
   * null before it is made, when the content decides.
   */
  androidResizable: boolean | null;
};

export type SheetOpenSize = {
  naturalHeight: number;
  overflows: boolean;
  resizable: boolean;
  snapPoints: (number | string)[] | undefined;
};

/**
 * How tall a native sheet opens: as tall as its content, and full height only
 * when the content is taller than the screen (owner, 2026-10-31 and
 * 2026-11-02).
 */
export function sheetOpenSize(input: SheetOpenSizeInput): SheetOpenSize {
  const { isIos, floating, sizes, hasBarFooter, bottomInset, topInset, windowHeight } = input;
  // A list with nothing under it pads for the home indicator and runs one
  // inset past the sheet's foot. Before iOS 26 a detent stops at the home
  // indicator and the system adds the inset below it; iOS 26's floating sheet
  // adds nothing, so its detent holds the whole sheet.
  const footerHeight = hasBarFooter ? sizes.footer : -(floating ? 1 : 2) * bottomInset;
  const naturalHeight =
    sizes.content > 0
      ? IOS_GRABBER_SPACE + sizes.header + sizes.content + footerHeight + mobileSpace.sm
      : 0;
  // The tallest a sheet gets: the system's full-height sheet, which stops
  // short of the status bar.
  const fullHeight = windowHeight - topInset - FULL_SHEET_TOP_GAP;
  const overflows = naturalHeight > fullHeight;
  const resizable = input.scrollable && (isIos || (input.androidResizable ?? overflows));
  const snapPoints = !resizable
    ? undefined
    : !isIos || overflows
      ? ["100%"]
      : naturalHeight === 0
        ? [Math.round(windowHeight * UNMEASURED_OPEN_SHARE)]
        : input.expandable
          ? [naturalHeight, "100%"]
          : [naturalHeight];
  return { naturalHeight, overflows, resizable, snapPoints };
}
