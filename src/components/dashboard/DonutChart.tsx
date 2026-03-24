interface Segment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}

export default function DonutChart({
  segments,
  size = 110,
  strokeWidth = 18,
  centerLabel,
  centerSubLabel,
}: DonutChartProps) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg, i) => {
      const pct = total > 0 ? seg.value / total : 0;
      const dash = pct * circumference;
      const arc = {
        key: `${seg.label}_${i}`,
        color: seg.color,
        dashArray: `${dash} ${circumference}`,
        dashOffset: -offset,
      };
      offset += dash;
      return arc;
    });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Donut chart: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
      style={{ flexShrink: 0 }}
    >
      {/* Background ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="var(--color-border, #E9ECEF)"
        strokeWidth={strokeWidth}
      />

      {/* Segments */}
      {arcs.map((arc) => (
        <circle
          key={arc.key}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeDasharray={arc.dashArray}
          strokeDashoffset={arc.dashOffset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}

      {/* Center text */}
      {centerLabel && (
        <text
          x={cx}
          y={centerSubLabel ? cy - 4 : cy + 4}
          textAnchor="middle"
          fontSize={18}
          fontWeight={700}
          fill="var(--color-text-primary, #212529)"
        >
          {centerLabel}
        </text>
      )}
      {centerSubLabel && (
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fontSize={9}
          fill="var(--color-text-subtle, #ADB5BD)"
        >
          {centerSubLabel}
        </text>
      )}
    </svg>
  );
}
