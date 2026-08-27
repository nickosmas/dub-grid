import { LoaderIcon } from "lucide-react";

export default function ButtonSpinner({
  color = "currentColor",
  size = 18,
}: {
  color?: string;
  size?: number;
}) {
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
 * Wraps button children with a spinner while loading. The action label stays
 * unchanged, so the button remains stable while it is busy.
 *
 * `icon` is the button's own leading icon, if it has one: it is the thing the
 * spinner takes the place of, rather than the spinner arriving beside it.
 */
export function ButtonLoading({
  loading,
  children,
  icon,
  spinnerColor,
  spinnerSize,
}: {
  loading: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
  spinnerColor?: string;
  spinnerSize?: number;
}) {
  if (!loading) {
    return (
      <>
        {icon}
        {children}
      </>
    );
  }

  return (
    // Its own gap rather than the button's: not every button holding a spinner
    // is a `dg-btn`, and the two halves have to stay apart in the ones that
    // lay their content out themselves.
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <ButtonSpinner color={spinnerColor} size={spinnerSize} />
      {children}
    </span>
  );
}
