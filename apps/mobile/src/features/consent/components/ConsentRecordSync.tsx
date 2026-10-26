import { useEffect } from "react";
import { useSessionState } from "../../../shared/providers/AuthSessionProvider";
import { ensureConsentRecorded } from "../lib/consent";

/**
 * Re-sends the stored cookie choice whenever the session changes and the
 * server's record of it is missing, anonymous, or someone else's: after a
 * failed save, or after a choice made before signing in.
 */
export function ConsentRecordSync() {
  const { session } = useSessionState();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    void ensureConsentRecorded(userId);
  }, [userId]);

  return null;
}
