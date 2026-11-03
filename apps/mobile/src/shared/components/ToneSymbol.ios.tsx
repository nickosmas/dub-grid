import { SymbolView, type SFSymbol } from "expo-symbols";
import type { ToneSymbolProps } from "./ToneSymbol.types";

export type { ToneSymbolProps } from "./ToneSymbol.types";

const TONE_SYMBOL: Record<ToneSymbolProps["tone"], SFSymbol> = {
  success: "checkmark.circle.fill",
  warning: "exclamationmark.triangle.fill",
  info: "info.circle.fill",
  danger: "exclamationmark.octagon.fill",
};

/**
 * A tone's filled SF Symbol, drawn in palette: the mark in `markColor` on the
 * shape in `color`. The offline symbol has no shape, so it is one colour.
 */
export function ToneSymbol({ tone, offline = false, size, color, markColor }: ToneSymbolProps) {
  if (offline) {
    return <SymbolView name="wifi.slash" size={size} tintColor={color} type="monochrome" />;
  }
  return (
    <SymbolView colors={[markColor, color]} name={TONE_SYMBOL[tone]} size={size} type="palette" />
  );
}
