import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { MobileBootstrapResponse } from "@dubgrid/contracts";
import { getOwnOrgRoleChangedMessage, type OwnOrgRoleReading } from "@dubgrid/domain";
import {
  getOrgIdFromAccessToken,
  getOrgRoleFromAccessToken,
} from "../../../shared/lib/access-token";
import { getSupabaseClient } from "../../../shared/lib/supabase";
import { useToast } from "../../../shared/providers/ToastProvider";
import { decideOwnRoleChange, readOwnOrgRole } from "../lib/own-role-change";
import { BOOTSTRAP_QUERY_KEY_PREFIX } from "./useBootstrap";

/**
 * Tells the signed-in person, once, when their own role changes, and brings
 * the app along without signing them out: the bootstrap already carries the
 * new role (the server reads the membership row), so this refreshes the token
 * for the new claim and refetches everything else that depends on the role.
 * Realtime and the foreground refetch deliver the new bootstrap.
 */
export function useOwnRoleChangeNotice({
  accessToken,
  userId,
  bootstrap,
  queryClient,
}: {
  accessToken: string | null;
  userId: string | null;
  bootstrap: MobileBootstrapResponse | undefined;
  queryClient: QueryClient;
}) {
  const { pushToast } = useToast();
  const shownRef = useRef<{ userId: string; reading: OwnOrgRoleReading } | null>(null);

  useEffect(() => {
    if (!bootstrap || !userId || !accessToken) return;
    const current = readOwnOrgRole(bootstrap);
    const shown = shownRef.current?.userId === userId ? shownRef.current.reading : null;
    if (!current) {
      shownRef.current = null;
      return;
    }
    shownRef.current = { userId, reading: current };

    const decision = decideOwnRoleChange(current, shown, {
      orgId: getOrgIdFromAccessToken(accessToken),
      role: getOrgRoleFromAccessToken(accessToken),
    });

    if (decision.refreshToken) {
      // Best effort: nothing on the phone trusts the claim for access, and the
      // next automatic refresh issues it anyway.
      void getSupabaseClient()
        ?.auth.refreshSession()
        .catch(() => {});
    }
    if (!decision.announce) return;

    pushToast({
      tone: "info",
      message: getOwnOrgRoleChangedMessage(decision.announce),
      dedupeKey: `own-role:${current.orgId}:${decision.announce}`,
    });
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] !== BOOTSTRAP_QUERY_KEY_PREFIX[0] ||
        query.queryKey[1] !== BOOTSTRAP_QUERY_KEY_PREFIX[1],
    });
  }, [accessToken, bootstrap, pushToast, queryClient, userId]);
}
