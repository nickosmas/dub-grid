import type { Invitation } from "@/types";

export type PersonAccountState =
  | { kind: "linked" }
  | {
      kind: "pending" | "expired";
      invitationId: string;
      email: string;
      sentAt: string;
      expiresAt: string;
    }
  | { kind: "not-invited" }
  | { kind: "no-email" };

/**
 * Whether a person can sign in, and if not, where their invitation stands.
 * Accepted and revoked invitations are history, not state; of the open ones,
 * the newest decides.
 */
export function getPersonAccountState(
  person: { userId: string | null; email: string },
  invitations: readonly Invitation[],
  nowMs: number,
): PersonAccountState {
  if (person.userId) return { kind: "linked" };

  const newestOpen = invitations
    .filter((invitation) => !invitation.acceptedAt && !invitation.revokedAt)
    .reduce<Invitation | null>(
      (newest, invitation) =>
        !newest || Date.parse(invitation.createdAt) > Date.parse(newest.createdAt)
          ? invitation
          : newest,
      null,
    );

  if (newestOpen) {
    return {
      kind: Date.parse(newestOpen.expiresAt) > nowMs ? "pending" : "expired",
      invitationId: newestOpen.id,
      email: newestOpen.email,
      sentAt: newestOpen.createdAt,
      expiresAt: newestOpen.expiresAt,
    };
  }

  return person.email ? { kind: "not-invited" } : { kind: "no-email" };
}
