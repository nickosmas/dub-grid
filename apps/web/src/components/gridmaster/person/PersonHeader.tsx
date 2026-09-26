"use client";

import type { ReactNode } from "react";
import { StatusPill } from "@/components/ui/status-pill";
import { MaybeHint } from "@/components/ui/hint";
import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";
import { PersonActions } from "./PersonField";
import { formatActor, formatDay, formatMoment, getPersonName } from "./person-format";

/** Who the person is and every state that changes how support should treat them. */
export function PersonHeader({
  record,
  actions,
}: {
  record: GridmasterPersonRecord;
  actions?: ReactNode;
}) {
  const { account, profile, loginLock, liveImpersonation } = record;
  const name = getPersonName(record);
  const email = account?.email ?? null;

  return (
    <header className="dg-card">
      <div className="dg-card-body flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="dg-type-page-title truncate">{name}</h2>
          {email && email !== name ? (
            <span className="truncate text-[13px] text-[var(--dg-color-text-muted)]">{email}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Account state">
          {account ? (
            <StatusPill tone="neutral">
              {profile?.platformRole && profile.platformRole !== "none"
                ? `Platform role: ${profile.platformRole}`
                : "No platform role"}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral">No account</StatusPill>
          )}
          {profile?.terminatedAt ? (
            <MaybeHint content={profile.terminatedReason ?? undefined}>
              <span>
                <StatusPill tone="danger" dot>
                  Terminated {formatDay(profile.terminatedAt)}
                </StatusPill>
              </span>
            </MaybeHint>
          ) : null}
          {profile?.deactivatedAt ? (
            <StatusPill tone="warning" dot>
              Deactivated {formatDay(profile.deactivatedAt)}
            </StatusPill>
          ) : null}
          {profile?.scheduledDeletionAt ? (
            <StatusPill tone="warning" dot>
              Deletion scheduled {formatDay(profile.scheduledDeletionAt)}
            </StatusPill>
          ) : null}
          {loginLock?.locked ? (
            // The sliding window can hold the lock past its reported reset.
            <MaybeHint
              content={
                loginLock.resetsAt
                  ? `Too many sign-in attempts. Clears no earlier than ${formatMoment(loginLock.resetsAt)}.`
                  : "Too many sign-in attempts."
              }
            >
              <span>
                <StatusPill tone="danger" dot>
                  Sign-in locked
                </StatusPill>
              </span>
            </MaybeHint>
          ) : null}
          {liveImpersonation ? (
            <MaybeHint
              content={`By ${formatActor(record, liveImpersonation.gridmasterId)}, until ${formatMoment(liveImpersonation.expiresAt)}`}
            >
              <span>
                <StatusPill tone="info" dot>
                  Being impersonated
                </StatusPill>
              </span>
            </MaybeHint>
          ) : null}
        </div>
      </div>
      {actions ? <PersonActions>{actions}</PersonActions> : null}
    </header>
  );
}
