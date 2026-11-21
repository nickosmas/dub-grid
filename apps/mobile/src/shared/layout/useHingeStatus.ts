import { useEffect, useState } from "react";
import { hingeModule } from "../../../modules/hinge";

export type HingeStatus = "closed" | "partiallyOpen" | "fullyOpen" | "unknown";

const STATUSES: readonly HingeStatus[] = ["closed", "partiallyOpen", "fullyOpen"];

export function toHingeStatus(value: unknown): HingeStatus {
  return STATUSES.find((status) => status === value) ?? "unknown";
}

/**
 * How long a hinge position must hold before the layout follows it. A hinge
 * swinging through its angles reports flat for a moment on its way to partly
 * folded, and the panes jumped narrow and back.
 */
export const HINGE_SETTLE_MS = 150;

/** The iPhone Duo's hinge; "unknown" on anything without one. */
export function useHingeStatus(): HingeStatus {
  const [status, setStatus] = useState<HingeStatus>(() => toHingeStatus(hingeModule?.getStatus()));
  useEffect(() => {
    if (!hingeModule) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = hingeModule.addListener("onChange", (change) => {
      clearTimeout(timer);
      timer = setTimeout(() => setStatus(toHingeStatus(change.status)), HINGE_SETTLE_MS);
    });
    setStatus(toHingeStatus(hingeModule.getStatus()));
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);
  return status;
}
