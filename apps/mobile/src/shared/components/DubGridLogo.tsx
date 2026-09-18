import { View } from "react-native";
import { BRAND_ANIMATED_LOGO_SIZE } from "@dubgrid/design-tokens";
import { useMobileColors } from "../providers/ThemeModeProvider";

/** The tint of the mark's recessive diagonal. Mirrors the web mark exactly. */
export const RECESSIVE_CELL_OPACITY = 0.3;

/**
 * The dubgrid mark, native twin of the web `DubGridLogo`: four rounded squares
 * in a pinwheel, one diagonal solid and the other tinted.
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
  const gap = size * 0.045;
  const cell = (size - gap) / 2;
  const radius = cell * 0.2;
  const offset = cell + gap;

  return (
    <View
      accessibilityLabel="DubGrid logo"
      accessibilityRole="image"
      style={{ width: size, height: size }}
      testID="dubgrid-logo"
    >
      {cellPositions(offset).map(({ x, y, opacity }) => (
        <View
          key={`${x}-${y}`}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: cell,
            height: cell,
            borderRadius: radius,
            backgroundColor: resolvedColor,
            opacity,
          }}
        />
      ))}
    </View>
  );
}

/** Solid on the top-right to bottom-left diagonal, tinted on the other. */
export function cellPositions(offset: number) {
  return [
    { x: 0, y: 0, opacity: RECESSIVE_CELL_OPACITY },
    { x: offset, y: 0, opacity: 1 },
    { x: 0, y: offset, opacity: 1 },
    { x: offset, y: offset, opacity: RECESSIVE_CELL_OPACITY },
  ];
}
