/** The tint of the mark's recessive diagonal. */
export const RECESSIVE_CELL_OPACITY = 0.3;

/**
 * The dubgrid mark: four rounded squares in a pinwheel, one diagonal solid and
 * the other at the same 0.3 tint the brand has always used for its recessive
 * cells. Deriving the light pair from `color` rather than a fixed hex is what
 * lets the mark sit on any surface and follow the theme.
 */
export function DubGridLogo({ size = 48, color = "#2563EB" }: { size?: number; color?: string }) {
  const gap = size * 0.045;
  const cell = (size - gap) / 2;
  const radius = cell * 0.2;
  const cells = [
    { x: 0, y: 0, opacity: RECESSIVE_CELL_OPACITY },
    { x: cell + gap, y: 0, opacity: 1 },
    { x: 0, y: cell + gap, opacity: 1 },
    { x: cell + gap, y: cell + gap, opacity: RECESSIVE_CELL_OPACITY },
  ];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      {cells.map((rect) => (
        <rect
          key={`${rect.x}-${rect.y}`}
          x={rect.x}
          y={rect.y}
          width={cell}
          height={cell}
          rx={radius}
          fill={color}
          opacity={rect.opacity}
        />
      ))}
    </svg>
  );
}

export function DubGridWordmark({
  fontSize = 26,
  color = "var(--color-text-primary)",
  className,
}: {
  fontSize?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontSize: `${fontSize}px`,
        fontWeight: 700,
        fontFamily: "'DM Sans', sans-serif",
        color,
        letterSpacing: "-0.02em",
      }}
    >
      dubgrid
    </span>
  );
}
