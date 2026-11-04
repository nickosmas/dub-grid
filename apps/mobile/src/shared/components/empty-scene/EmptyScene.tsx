import { memo } from "react";
import Svg, { Circle, G, Path, Rect, Text } from "react-native-svg";
import { useMobileColors } from "../../providers/ThemeModeProvider";
import { mobileTypography } from "../../theme/tokens";
import {
  EMPTY_SCENE_HEIGHT,
  EMPTY_SCENE_WIDTH,
  EMPTY_SCENES,
  type EmptySceneKind,
  type EmptySceneShape,
} from "./scenes";
import { daySceneShapes, type EmptySceneDay } from "./day-scene";
import { weekSceneShapes, type EmptySceneWeek } from "./week-scene";

/** Inside a card the scene draws at this share of its page size. */
const CARD_SCALE = 0.6;

/**
 * The drawing above an empty state's title. `page` sits on the grouped page
 * and `card` on a card, which decides the ground colour the details are cut
 * out in. Decorative: the title and body say what it shows.
 */
export const EmptyScene = memo(function EmptyScene({
  kind,
  size = "page",
  week,
  day,
}: {
  kind: EmptySceneKind;
  size?: "page" | "card";
  /** The viewer's week, for the two "this week" scenes. */
  week?: EmptySceneWeek;
  /** The day the screen is on, for the day scene's tile. */
  day?: EmptySceneDay;
}) {
  const mobileColors = useMobileColors();
  const scale = size === "card" ? CARD_SCALE : 1;
  const paint = {
    ink: mobileColors.emptySceneInk,
    ground: size === "card" ? mobileColors.surface : mobileColors.background,
  };
  return (
    <Svg
      accessibilityElementsHidden
      height={Math.round(EMPTY_SCENE_HEIGHT * scale)}
      importantForAccessibility="no-hide-descendants"
      viewBox={`0 0 ${EMPTY_SCENE_WIDTH} ${EMPTY_SCENE_HEIGHT}`}
      width={Math.round(EMPTY_SCENE_WIDTH * scale)}
    >
      <G fill="none" strokeLinecap="round" strokeLinejoin="round">
        {sceneShapes(kind, week, day).map((shape, index) => renderShape(shape, index, paint))}
      </G>
    </Svg>
  );
});

function sceneShapes(
  kind: EmptySceneKind,
  week: EmptySceneWeek | undefined,
  day: EmptySceneDay | undefined,
): readonly EmptySceneShape[] {
  if (week && (kind === "me-week-empty" || kind === "me-week-done")) {
    return weekSceneShapes(kind, week);
  }
  if (day && kind === "team-day-empty") return daySceneShapes(day);
  return EMPTY_SCENES[kind];
}

function renderShape(shape: EmptySceneShape, key: number, paint: { ink: string; ground: string }) {
  const common = {
    fill: shape.fill ? paint[shape.fill] : "none",
    stroke: shape.stroke ? paint[shape.stroke] : undefined,
    strokeWidth: shape.strokeWidth,
    strokeDasharray: shape.dash,
    strokeLinecap: shape.linecap,
    transform: shape.transform,
  };
  switch (shape.shape) {
    case "rect":
      return (
        <Rect
          {...common}
          height={shape.height}
          key={key}
          rx={shape.rx}
          width={shape.width}
          x={shape.x}
          y={shape.y}
        />
      );
    case "circle":
      return <Circle {...common} cx={shape.cx} cy={shape.cy} key={key} r={shape.r} />;
    case "path":
      return <Path {...common} d={shape.d} key={key} />;
    case "text":
      return (
        <Text
          {...common}
          fontFamily={mobileTypography.fontFamily.bold}
          // Scene units, scaled with the drawing; not a text style.
          fontSize={shape.size}
          key={key}
          letterSpacing={shape.letterSpacing}
          textAnchor="middle"
          x={shape.x}
          y={shape.y}
        >
          {shape.text}
        </Text>
      );
  }
}
