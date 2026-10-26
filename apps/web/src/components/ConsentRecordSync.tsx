"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { ensureConsentRecorded } from "@/components/CookieConsent";

/**
 * Records the browser's cookie choice against the signed-in person when the
 * server's record of it is anonymous or someone else's, as after a choice made
 * before signing in.
 */
export default function ConsentRecordSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (userId) void ensureConsentRecorded(userId);
  }, [userId]);

  return null;
}
