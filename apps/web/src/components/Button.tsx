"use client";

import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";

import { useAsyncAction } from "@/hooks/useAsyncAction";

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">;

/**
 * A `<button>` that cannot run its action twice.
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
 * A synchronous `onClick` is left completely alone, which is what makes this
 * safe to swap in anywhere.
 */
export function Button({
  onClick,
  disabled,
  children,
  ...rest
}: NativeButtonProps & {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
  // React 19 passes `ref` as an ordinary prop, so it rides `...rest` onto the
  // native element and callers that measure or focus a button keep working.
  ref?: Ref<HTMLButtonElement>;
}) {
  const action = useAsyncAction(onClick ?? (() => {}));

  return (
    <button
      {...rest}
      // The caller's own `disabled` still wins; this only adds the in-flight
      // case, for a button whose pending state isn't already wired up.
      disabled={disabled || action.isRunning}
      onClick={action.run}
    >
      {children}
    </button>
  );
}
