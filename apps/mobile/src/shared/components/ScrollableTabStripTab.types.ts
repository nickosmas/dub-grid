import type { LayoutChangeEvent } from "react-native";

export type ScrollableTabStripTabProps = {
  label: string;
  count?: number;
  isActive: boolean;
  maxWidth: number;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
};
