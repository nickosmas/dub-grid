/**
 * Base sizes, in CSS px, for the printed schedule. Every printed line is sized
 * in em from this base, so each step reads as a clearly different size on
 * paper; the old 7/9/11 printed Large at the size body text needs as Small.
 */
export const PRINT_FONT_SIZES = [
  { key: "small", label: "Small", value: 9 },
  { key: "medium", label: "Medium", value: 11 },
  { key: "large", label: "Large", value: 14 },
] as const;

export type PrintFontSizeKey = (typeof PRINT_FONT_SIZES)[number]["key"];

export function printFontSizeLabel(fontSize: number): string {
  const nearest = PRINT_FONT_SIZES.reduce((best, size) =>
    Math.abs(size.value - fontSize) < Math.abs(best.value - fontSize) ? size : best,
  );
  return nearest.label;
}
