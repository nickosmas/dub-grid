"use client";

import { Children, cloneElement, Fragment, isValidElement, type ReactNode as RN } from "react";
import type { ButtonHTMLAttributes, MouseEvent, ReactElement, ReactNode, Ref } from "react";

import ButtonSpinner, { ButtonLoading } from "@/components/ButtonSpinner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

/**
 * Renders a nested loading wrapper as the button's sole spinner source.
 *
 * Most buttons that predate this component wire `<ButtonLoading>` themselves
 * from a local pending flag. That wrapper stays the single spinner source;
 * when this button's latch starts first, it promotes the wrapper into loading.
 */
function renderWithOwnSpinner(
  node: RN,
  busy: boolean,
  depth = 0,
): { hasSpinner: boolean; node: RN } {
  if (depth > 6) return { hasSpinner: false, node };
  let hasSpinner = false;
  const rendered = Children.map(node, (child) => {
    if (!isValidElement(child)) return child;
    if (child.type === ButtonSpinner) {
      hasSpinner = true;
      return child;
    }
    if (child.type === ButtonLoading) {
      hasSpinner = true;
      const loadingChild = child as ReactElement<{ loading: boolean }>;
      return cloneElement(loadingChild, {
        loading: busy || Boolean(loadingChild.props.loading),
      });
    }
    // Only structural wrappers can be safely cloned. Component children may
    // contain render props (Base UI's `render`, for example) that must retain
    // their exact shape, so ButtonLoading stays a direct/structural child.
    if (child.type !== Fragment && typeof child.type !== "string") return child;
    const nested = (child.props as { children?: RN })?.children;
    if (nested == null) return child;
    const renderedNested = renderWithOwnSpinner(nested, busy, depth + 1);
    hasSpinner ||= renderedNested.hasSpinner;
    return renderedNested.node === nested
      ? child
      : cloneElement(child, undefined, renderedNested.node);
  });
  return { hasSpinner, node: rendered };
}

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
 * beside the unchanged action label, so no button can sit there dead during a
 * slow request. That default matters because most handlers arrive as props
 * typed `=> void`, where nothing at the call site can tell you whether work is
 * async; making the spinner opt-out rather than opt-in is what stops a button
 * being missed.
 * A button already wiring its own `<ButtonLoading>` uses that wrapper as the
 * single spinner source, so no call site has to opt out.
 *
 * A synchronous `onClick` is left completely alone, which is what makes this
 * safe to swap in anywhere.
 */
export function Button({
  onClick,
  disabled,
  loading,
  spinner,
  icon,
  spinnerSize,
  children,
  ...rest
}: NativeButtonProps & {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
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
  const spinnerChildren = renderWithOwnSpinner(children, Boolean(busy && spinner !== false));

  return (
    <button
      {...rest}
      // The caller's own `disabled` still wins; this only adds the in-flight
      // case, for a button whose pending state isn't already wired up.
      disabled={disabled || busy}
      onClick={action.run}
      aria-busy={busy || undefined}
    >
      {busy && spinner !== false && !spinnerChildren.hasSpinner ? (
        <>
          <ButtonSpinner size={spinnerSize} />
          {children}
        </>
      ) : (
        <>
          {icon}
          {spinnerChildren.node}
        </>
      )}
    </button>
  );
}
