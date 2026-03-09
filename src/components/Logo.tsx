export function DubGridLogo({
  size = 48,
  color = "#1B3A2D",
}: {
  size?: number;
  color?: string;
}) {
  const cell = size / 4;
  const gap = cell * 0.18;
  const r = cell * 0.22;
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

export function OrgLogo({
  logoUrl,
  size = 48,
  appName,
}: {
  logoUrl?: string | null;
  size?: number;
  appName?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={appName ?? "Logo"}
        width={size}
        height={size}
        style={{ objectFit: "contain" }}
      />
    );
  }
  return <DubGridLogo size={size} />;
}

export function DubGridWordmark({
  fontSize = 26,
  color = "#111827",
  className,
  text,
}: {
  fontSize?: number;
  color?: string;
  className?: string;
  text?: string;
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
      {text ?? "dubgrid"}
    </span>
  );
}
