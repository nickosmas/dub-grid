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

const INVITE_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** The invite card under someone's status: where their invitation stands, in a title and a line. */
export function describeInvitationCard(state: Exclude<PersonAccountState, { kind: "linked" }>): {
  title: string;
  detail: string | null;
} {
  switch (state.kind) {
    case "not-invited":
      return {
        title: "Not invited yet",
        detail: "Invite them to see their schedule and requests in the app.",
      };
    case "no-email":
      return { title: "Not invited yet", detail: "Add an email to invite them." };
    case "pending":
      return {
        title: `Invited ${INVITE_DAY.format(new Date(state.sentAt))}, hasn't joined`,
        detail: `The invite expires ${INVITE_DAY.format(new Date(state.expiresAt))}.`,
      };
    case "expired":
      return {
        title: `Invite expired ${INVITE_DAY.format(new Date(state.expiresAt))}`,
        detail: null,
      };
  }
}
