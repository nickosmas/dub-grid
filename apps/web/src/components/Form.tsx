"use client";

import type { FormEvent, FormHTMLAttributes, Ref } from "react";

import { useAsyncAction } from "@/hooks/useAsyncAction";

type NativeFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit">;

/**
 * A `<form>` whose submit handler cannot run twice.
 *
 * `<Button>` cannot cover this case: a `type="submit"` button usually has no
 * `onClick` of its own, so the work is started by the form's native submit
 * event, which a second Enter keypress or a fast double-click fires again.
 * Every sign-in, invite and password form here submits asynchronously, so
 * without a latch a double-submit means two requests.
 *
 * Same contract as `<Button>`: a passthrough over the native element, and the
 * latch holds for exactly as long as the promise `onSubmit` returns. A
 * synchronous handler is left alone.
 */
export function Form({
  onSubmit,
  children,
  ...rest
}: NativeFormProps & {
  onSubmit?: (event: FormEvent<HTMLFormElement>) => unknown;
  ref?: Ref<HTMLFormElement>;
}) {
  const action = useAsyncAction(onSubmit ?? (() => {}));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // A handler may validate synchronously before returning its promise. Cancel
    // the browser default first so an Enter keypress can never reload the page
    // and discard the controlled fields while that work starts.
    event.preventDefault();
    action.run(event);
  }

  return (
    <form {...rest} data-dg-client-form="true" onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
