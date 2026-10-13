"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const FADE_IN_MS = 200;

/**
 * Renders `children` only once `afterMs` has passed, then fades them in. A
 * loading indicator wrapped in it never appears for a wait shorter than the
 * delay, and a wait that ends just after it does not pop.
 */
export function DelayedReveal({
  afterMs,
  style,
  children,
}: {
  afterMs: number;
  /** Styles the wrapper the children fade in with, e.g. its width in a flex row. */
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), afterMs);
    return () => window.clearTimeout(timer);
  }, [afterMs]);

  useEffect(() => {
    // jsdom has no Web Animations API.
    if (shown) {
      wrapper.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_IN_MS,
        easing: "ease-out",
      });
    }
  }, [shown]);

  return shown ? (
    <div ref={wrapper} style={style}>
      {children}
    </div>
  ) : null;
}
