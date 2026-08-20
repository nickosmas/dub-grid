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
 * Wraps button children so that loading swaps the label for the same action in
 * progress: a spinner alongside `loadingLabel`. The label is never dropped, so
 * the button keeps saying what it is doing, and `loadingLabel` is required to
 * keep that wording in the progressive form ("Saving", not "Save").
 *
 * `icon` is the button's own leading icon, if it has one: it is the thing the
 * spinner takes the place of, rather than the spinner arriving beside it.
 */
export function ButtonLoading({
  loading,
  loadingLabel,
  children,
  icon,
  spinnerColor,
  spinnerSize,
}: {
  loading: boolean;
  loadingLabel: string;
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
      {loadingLabel}
    </span>
  );
}
