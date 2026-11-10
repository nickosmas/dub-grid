import type { StatusIconTone } from "@dubgrid/design-tokens";

export type ToneSymbolProps = {
  tone: StatusIconTone;
  /** The offline notice's own symbol in place of the tone's shape. */
  offline?: boolean;
  size: number;
  /** The filled shape; its mark is cut out to whatever is behind. */
  color: string;
};
