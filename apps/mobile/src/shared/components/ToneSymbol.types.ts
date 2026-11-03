import type { StatusIconTone } from "@dubgrid/design-tokens";

export type ToneSymbolProps = {
  tone: StatusIconTone;
  /** The offline notice's own symbol in place of the tone's shape. */
  offline?: boolean;
  size: number;
  /** The filled shape. */
  color: string;
  /** The mark on the shape; Android's glyphs cut it out to whatever is behind. */
  markColor: string;
};
