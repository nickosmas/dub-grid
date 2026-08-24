"use client";

import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";

import ButtonSpinner, { ButtonLoading } from "@/components/ButtonSpinner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">;

/**
 * A `<button>` that cannot run its action twice, and says so while it works.
 *
 * It is a passthrough over the native element -- same `className`, same
 * children, same everything -- so an existing `<button className="dg-btn">`
 * becomes safe by changing only the tag name. What it adds is the latch: an
 * `onClick` returning a promise is held until that promise settles.
 *
 * This has to live in the component rather than at each call site, because the
 * usual guard does not work. A `useState` busy flag only reaches the DOM after
 * React re-renders, and a second click lands inside that window and sails past
 * a `disabled` that has not applied yet. `useAsyncAction`'s latch is a ref,
 * read and set synchronously inside the first click, so the second is already
 * too late.
 *
 * It also always looks busy while it works. A running latch shows a spinner
 * on its own, so no button can sit there dead during a slow request, and
 * `loadingLabel` upgrades that to the proper wording -- the same verb in
 * progress, `[spinner] Confirming` rather than `[spinner] Confirm`. That
 * default matters because most handlers arrive as props typed `=> void`,
 * where nothing at the call site can tell you whether work is async; making
 * the spinner opt-out rather than opt-in is what stops a button being missed.
 * A button already wiring its own `<ButtonLoading>` from a pending flag of
 * its own passes neither prop and is left alone -- two spinners would fight.
 *
 * A synchronous `onClick` is left completely alone, which is what makes this
 * safe to swap in anywhere.
 */
export function Button({
  onClick,
  disabled,
  loading,
  loadingLabel,
  spinner,
  icon,
  spinnerSize,
  children,
  ...rest
}: NativeButtonProps & {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
  /**
   * What the button says while its action runs: the same verb in progress
   * ("Saving", not "Save"), keeping whatever the label names ("Saving Draft").
   * Supplying it is what turns the spinner on.
   */
  loadingLabel?: string;
  /**
   * A pending state that lives outside this button -- a mutation's
   * `isPending`, or a flag set by a confirmation step that finishes the work
   * later. It shows the same spinner and disables the same way; the latch
   * covers only the span of its own `onClick`.
   */
  loading?: boolean;
  /**
   * Set `false` for a button whose children are a whole row of content -- a
   * notification, a listbox option -- where a spinner wedged beside the text
   * reads as breakage. Those rely on their own state changing instead.
   */
  spinner?: false;
  /** The button's own leading icon, which the spinner stands in for. */
  icon?: ReactNode;
  spinnerSize?: number;
  // React 19 passes `ref` as an ordinary prop, so it rides `...rest` onto the
  // native element and callers that measure or focus a button keep working.
  ref?: Ref<HTMLButtonElement>;
}) {
  const action = useAsyncAction(onClick ?? (() => {}));
  const busy = loading || action.isRunning;

  return (
    <button
      {...rest}
      // The caller's own `disabled` still wins; this only adds the in-flight
      // case, for a button whose pending state isn't already wired up.
      disabled={disabled || busy}
      onClick={action.run}
      aria-busy={busy || undefined}
    >
      {loadingLabel ? (
        <ButtonLoading
          loading={busy}
          loadingLabel={loadingLabel}
          icon={icon}
          spinnerSize={spinnerSize}
        >
          {children}
        </ButtonLoading>
      ) : busy && spinner !== false ? (
        // No `loadingLabel`, but the action is running, so the button still
        // has to look busy rather than merely dead. The label is kept as-is
        // instead of being swapped -- worse wording than a proper
        // `loadingLabel`, better than a control that shows nothing at all.
        <>
          <ButtonSpinner size={spinnerSize} />
          {children}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}
