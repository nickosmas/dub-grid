import { useCallback, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { getHeroDotInk, getHeroMesh, heroDotTokens } from "@dubgrid/design-tokens";

type Size = { width: number; height: number };

/**
 * The hero card's mesh gradient and dot screen, from the same tokens the web
 * card paints with CSS. Each pool's radius is a fraction of the card's width
 * and height (the gradient's default bounding-box units), as on web.
 *
 * The drawing is sized from the card's own layout in pixels. An absolutely
 * positioned `Svg` with no size of its own keeps the frame it first drew in,
 * so when the card grew (the Working with block or a second shift arriving
 * after the first layout) the new bottom showed the flat fallback colour.
 */
export function HeroCardBackdrop({ isDark }: { isDark: boolean }) {
  const [size, setSize] = useState<Size | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current?.width === width && current.height === height ? current : { width, height },
    );
  }, []);
  const mesh = getHeroMesh(isDark);
  const ink = getHeroDotInk(isDark);
  const { radius, spacing } = heroDotTokens;

  return (
    <View
      onLayout={handleLayout}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="me-hero-backdrop"
    >
      {size ? (
        <Svg height={size.height} width={size.width}>
          <Defs>
            {mesh.pools.map((pool, index) => (
              <RadialGradient
                cx={pool.x}
                cy={pool.y}
                fx={pool.x}
                fy={pool.y}
                id={`heroPool${index}`}
                key={`${pool.x}-${pool.y}`}
                r={pool.radius}
              >
                <Stop offset={0} stopColor={pool.color} stopOpacity={1} />
                <Stop offset={1} stopColor={pool.color} stopOpacity={0} />
              </RadialGradient>
            ))}
            <Pattern height={spacing} id="heroDots" patternUnits="userSpaceOnUse" width={spacing}>
              <Circle
                cx={spacing / 2}
                cy={spacing / 2}
                fill={ink.color}
                fillOpacity={ink.opacity}
                r={radius}
              />
            </Pattern>
          </Defs>
          <Rect fill={mesh.base} height={size.height} width={size.width} />
          {mesh.pools.map((pool, index) => (
            <Rect
              fill={`url(#heroPool${index})`}
              height={size.height}
              key={`${pool.x}-${pool.y}`}
              width={size.width}
            />
          ))}
          <Rect fill="url(#heroDots)" height={size.height} width={size.width} />
        </Svg>
      ) : null}
    </View>
  );
}
