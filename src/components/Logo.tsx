export function DubGridLogo({
  size = 48,
  color = "#005F02",
}: {
  size?: number;
  color?: string;
}) {
  const cell = size / 4;
  const gap = cell * 0.10;
  const r = cell * 0.20;
  const cols = [0, 1, 2, 3];
  const rows = [0, 1, 2, 3];
  // Filled cells forming a simple grid mark (all 16)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      {rows.map((row) =>
        cols.map((col) => (
          <rect
            key={`${row}-${col}`}
            x={col * cell + gap}
            y={row * cell + gap}
            width={cell - gap * 2}
            height={cell - gap * 2}
            rx={r}
            fill={color}
            opacity={
              row === 0 || col === 0 ? "1" : row + col <= 4 ? "0.75" : "0.3"
            }
          />
        )),
      )}
    </svg>
  );
}

/**
 * Animated version of DubGridLogo — every cell independently pulses at
 * a unique duration + delay so the whole grid feels alive and random.
 */
export function AnimatedDubGridLogo({
  size = 48,
  color = "#005F02",
}: {
  size?: number;
  color?: string;
}) {
  const cell = size / 4;
  const gap = cell * 0.10;
  const r = cell * 0.20;

  // [duration, delay] — all 16 cells have unique pairs so every dot animates independently
  const timing: [number, number][] = [
    [1.4, 0.0], [2.1, 0.9], [1.7, 1.7], [2.5, 0.4],
    [1.9, 1.3], [1.3, 0.6], [2.3, 1.9], [1.6, 0.2],
    [2.0, 1.1], [1.5, 1.8], [2.6, 0.3], [1.8, 1.5],
    [2.2, 0.7], [1.2, 1.4], [2.4, 0.1], [1.35, 1.0],
  ];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <style>{`
        @keyframes dg-cell-pulse {
          0%, 100% { opacity: 0.12; }
          50% { opacity: 1; }
        }
      `}</style>
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3].map((col) => {
          const [dur, del] = timing[row * 4 + col];
          return (
            <rect
              key={`${row}-${col}`}
              x={col * cell + gap}
              y={row * cell + gap}
              width={cell - gap * 2}
              height={cell - gap * 2}
              rx={r}
              fill={color}
              style={{
                animation: `dg-cell-pulse ${dur}s ease-in-out ${del}s infinite`,
              }}
            />
          );
        }),
      )}
    </svg>
  );
}

export function DubGridWordmark({
  fontSize = 26,
  color = "#111827",
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
        color,
        letterSpacing: "-0.02em",
      }}
    >
      dubgrid
    </span>
  );
}
