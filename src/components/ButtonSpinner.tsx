/** iOS-style activity spinner — 8 fading bars rotating via CSS steps. */
export default function ButtonSpinner({ color = "currentColor", size = 18 }: { color?: string; size?: number }) {
  const bars = 8;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      style={{ animation: "dg-spin 0.8s steps(8, end) infinite", flexShrink: 0 }}
    >
      {Array.from({ length: bars }, (_, i) => (
        <line
          key={i}
          x1="9" y1="2" x2="9" y2="5.5"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity={1 - i * (0.85 / bars)}
          transform={`rotate(${i * (360 / bars)} 9 9)`}
        />
      ))}
      <style>{`@keyframes dg-spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

/**
 * Wraps button children so that loading swaps to a spinner
 * WITHOUT changing the button's dimensions. The label stays in
 * the flow (invisible) to hold width/height, and the spinner
 * is centered on top via absolute positioning.
 */
export function ButtonLoading({
  loading,
  children,
  spinnerColor,
  spinnerSize,
}: {
  loading: boolean;
  children: React.ReactNode;
  spinnerColor?: string;
  spinnerSize?: number;
}) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ visibility: loading ? "hidden" : "visible", display: "inline-flex", alignItems: "center", gap: "inherit" }}>
        {children}
      </span>
      {loading && (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ButtonSpinner color={spinnerColor} size={spinnerSize} />
        </span>
      )}
    </span>
  );
}
