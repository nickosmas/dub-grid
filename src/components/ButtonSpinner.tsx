import { LoaderIcon } from "lucide-react";

export default function ButtonSpinner({ color = "currentColor", size = 18 }: { color?: string; size?: number }) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      width={size}
      height={size}
      className="animate-spin shrink-0"
      style={{ color }}
    />
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
