import { View } from "react-native";
import { BRAND_ANIMATED_LOGO_SIZE } from "@dubgrid/design-tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";

const ROWS = [0, 1, 2, 3] as const;
const COLS = [0, 1, 2, 3] as const;

/**
 * The approved dubgrid mark, native twin of the web `DubGridLogo`.
 *
 * Cells are plain <View>s rather than SVG rects: visually identical at this
 * size, and `react-native-svg` is deliberately absent from this app.
 *
 * Static by contract. Startup surfaces show it while the app initializes, and
 * the liveness a loading screen needs belongs to `StartupProgress` beside it,
 * not to the brand mark.
 */
export function DubGridLogo({
  size = BRAND_ANIMATED_LOGO_SIZE,
  color,
}: {
  size?: number;
  color?: string;
}) {
  const mobileColors = useMobileColors();
  const resolvedColor = color ?? mobileColors.brand;
  const cell = size / 4;
  const gap = cell * 0.1;
  const inner = cell - gap * 2;
  const radius = cell * 0.2;

  return (
    <View
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      style={{ width: size, height: size }}
      testID="dubgrid-logo"
    >
      {ROWS.map((row) =>
        COLS.map((col) => (
          <View
            key={`${row}-${col}`}
            style={{
              position: "absolute",
              left: col * cell + gap,
              top: row * cell + gap,
              width: inner,
              height: inner,
              borderRadius: radius,
              backgroundColor: resolvedColor,
              opacity: staticOpacity(row, col),
            }}
          />
        )),
      )}
    </View>
  );
}

/** The mark's fixed depth ramp: solid top row and left column, fading inward. */
export function staticOpacity(row: number, col: number): number {
  if (row === 0 || col === 0) return 1;
  if (row + col <= 4) return 0.75;
  return 0.3;
}
