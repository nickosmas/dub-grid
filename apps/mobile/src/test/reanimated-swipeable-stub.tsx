import * as React from "react";
import { View } from "react-native";

/**
 * `react-native-gesture-handler/ReanimatedSwipeable` for vitest: renders the
 * row and its revealed actions side by side, so a test can press a swipe
 * action without a gesture. `close()` is a no-op.
 */
const ReanimatedSwipeable = React.forwardRef<
  { close: () => void; openLeft: () => void; openRight: () => void; reset: () => void },
  {
    children?: React.ReactNode;
    renderLeftActions?: () => React.ReactNode;
    renderRightActions?: () => React.ReactNode;
  }
>(function ReanimatedSwipeable({ children, renderLeftActions, renderRightActions }, ref) {
  React.useImperativeHandle(ref, () => ({
    close: () => undefined,
    openLeft: () => undefined,
    openRight: () => undefined,
    reset: () => undefined,
  }));

  return React.createElement(View, null, renderLeftActions?.(), children, renderRightActions?.());
});

export default ReanimatedSwipeable;
export type SwipeableMethods = {
  close: () => void;
  openLeft: () => void;
  openRight: () => void;
  reset: () => void;
};
