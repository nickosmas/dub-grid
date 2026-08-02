import { useRef } from "react";

/**
 * Keeps a ref pointed at the latest `value` without a state-mirroring effect.
 *
 * Assigning during render is the idiomatic way to read the current value from
 * inside a stable callback, timer, or subscription without listing the value in
 * a dependency array (and without the extra render cycle a `useEffect` mirror
 * would add). Read the value only in effects/handlers/callbacks — never during
 * render — so a concurrent render can't observe a torn value.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
