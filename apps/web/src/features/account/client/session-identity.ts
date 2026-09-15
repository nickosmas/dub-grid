"use client";

import { decodeJwt } from "jose";
import type { Session } from "@supabase/supabase-js";

export type WebAuthIdentity =
  | { kind: "anonymous"; userId: null; orgId: null }
  | { kind: "unreadable"; userId: null; orgId: null }
  | { kind: "authenticated"; userId: string; orgId: string | null };

export function getWebAuthIdentity(session: Session | null): WebAuthIdentity {
  if (!session) return { kind: "anonymous", userId: null, orgId: null };

  try {
    const claims = decodeJwt(session.access_token);
    const userId = typeof claims.sub === "string" && claims.sub ? claims.sub : null;
    if (!userId || userId !== session.user.id) {
      return { kind: "unreadable", userId: null, orgId: null };
    }

    return {
      kind: "authenticated",
      userId,
      orgId: typeof claims.org_id === "string" && claims.org_id ? claims.org_id : null,
    };
  } catch {
    return { kind: "unreadable", userId: null, orgId: null };
  }
}

export function isSameWebAuthIdentity(left: WebAuthIdentity, right: WebAuthIdentity): boolean {
  return left.kind === right.kind && left.userId === right.userId && left.orgId === right.orgId;
}

export function crossesWebAuthDataBoundary(
  previous: WebAuthIdentity,
  next: WebAuthIdentity,
): boolean {
  if (isSameWebAuthIdentity(previous, next)) return false;
  if (previous.kind === "anonymous" && next.kind === "authenticated") return false;
  return previous.kind !== "anonymous";
}

export function changesWebAuthOrganization(
  previous: WebAuthIdentity,
  next: WebAuthIdentity,
): boolean {
  return (
    previous.kind === "authenticated" &&
    next.kind === "authenticated" &&
    previous.userId === next.userId &&
    previous.orgId !== next.orgId
  );
}
