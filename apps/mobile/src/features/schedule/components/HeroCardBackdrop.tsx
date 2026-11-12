import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { getHeroDotInk, getHeroMesh, heroDotTokens } from "@dubgrid/design-tokens";

/**
 * The hero card's mesh gradient and dot screen, from the same tokens the web
 * card paints with CSS. Each pool's radius is a fraction of the card's width
 * and height (the gradient's default bounding-box units), as on web.
 */
export function HeroCardBackdrop({ isDark }: { isDark: boolean }) {
  const mesh = getHeroMesh(isDark);
  const ink = getHeroDotInk(isDark);
  const { radius, spacing } = heroDotTokens;

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} testID="me-hero-backdrop">
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
      <Rect fill={mesh.base} height="100%" width="100%" />
      {mesh.pools.map((pool, index) => (
        <Rect
          fill={`url(#heroPool${index})`}
          height="100%"
          key={`${pool.x}-${pool.y}`}
          width="100%"
        />
      ))}
      <Rect fill="url(#heroDots)" height="100%" width="100%" />
    </Svg>
  );
}
