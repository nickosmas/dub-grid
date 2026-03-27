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
