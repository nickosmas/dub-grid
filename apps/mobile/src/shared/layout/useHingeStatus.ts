import { useEffect, useState } from "react";
import { hingeModule } from "../../../modules/hinge";

export type HingeStatus = "closed" | "partiallyOpen" | "fullyOpen" | "unknown";

const STATUSES: readonly HingeStatus[] = ["closed", "partiallyOpen", "fullyOpen"];

export function toHingeStatus(value: unknown): HingeStatus {
  return STATUSES.find((status) => status === value) ?? "unknown";
}

/** The iPhone Duo's hinge; "unknown" on anything without one. */
export function useHingeStatus(): HingeStatus {
  const [status, setStatus] = useState<HingeStatus>(() => toHingeStatus(hingeModule?.getStatus()));
  useEffect(() => {
    if (!hingeModule) return;
    const subscription = hingeModule.addListener("onChange", (change) =>
      setStatus(toHingeStatus(change.status)),
    );
    setStatus(toHingeStatus(hingeModule.getStatus()));
    return () => subscription.remove();
  }, []);
  return status;
}
