"use client";

import { useMemo } from "react";
import type { Employee, AuditLogEntry, Invitation } from "@/types";
import { formatRelativeTime, getEmployeeDisplayName } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ROLE_BADGE_COLORS } from "@/lib/styles";
import { UserCheck, UserPlus, UserX, Mail, Clock, History } from "lucide-react";

interface ActivityTabProps {
  employee: Employee;
  roleHistory: AuditLogEntry[];
  invitations: Invitation[];
}

interface TimelineEvent {
  id: string;
  date: Date;
  type: "role_change" | "invitation_sent" | "invitation_accepted" | "invitation_revoked" | "invitation_expired";
  description: string;
  meta?: string;
  fromRole?: string;
  toRole?: string;
}

export function ActivityTab({
  employee,
  roleHistory,
  invitations,
}: ActivityTabProps) {
  const timeline = useMemo(() => {
    const events: TimelineEvent[] = [];

    for (const entry of roleHistory) {
      events.push({
        id: `role-${entry.id}`,
        date: new Date(entry.createdAt),
        type: "role_change",
        description: "Role changed",
        meta: entry.changedByEmail ?? "System",
        fromRole: entry.fromRole,
        toRole: entry.toRole,
      });
    }

    for (const invitation of invitations) {
      events.push({
        id: `inv-sent-${invitation.id}`,
        date: new Date(invitation.createdAt),
        type: "invitation_sent",
        description: `Invitation sent to ${invitation.email}`,
        meta: `as ${invitation.roleToAssign} · expires ${new Date(invitation.expiresAt).toLocaleDateString()}`,
      });

      if (invitation.acceptedAt) {
        events.push({
          id: `inv-accepted-${invitation.id}`,
          date: new Date(invitation.acceptedAt),
          type: "invitation_accepted",
          description: `Invitation accepted by ${invitation.email}`,
        });
      } else if (invitation.revokedAt) {
        events.push({
          id: `inv-revoked-${invitation.id}`,
          date: new Date(invitation.revokedAt),
          type: "invitation_revoked",
          description: "Invitation revoked",
          meta: invitation.email,
        });
      } else if (new Date(invitation.expiresAt) < new Date()) {
        events.push({
          id: `inv-expired-${invitation.id}`,
          date: new Date(invitation.expiresAt),
          type: "invitation_expired",
          description: "Invitation expired",
          meta: invitation.email,
        });
      }
    }

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [roleHistory, invitations]);

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--color-text-muted)]" />
            History
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 py-0 font-mono text-[10px]">
              {timeline.length}
            </Badge>
          </div>
          <div className="dg-card-subtitle">
            Account and permission timeline for {getEmployeeDisplayName(employee)}.
          </div>
        </div>
      </div>
      <div className="dg-card-body">
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <History className="mb-3 h-7 w-7 text-[var(--color-text-faint)]" />
            <p className="text-[13px] text-[var(--color-text-muted)]">No activity recorded</p>
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-[var(--color-border-light)]" />

            <div className="flex flex-col gap-5">
              {timeline.map((event) => (
                <div key={event.id} className="relative flex gap-3">
                  <div className="absolute -left-6 top-1 flex h-[15px] w-[15px] items-center justify-center">
                    <div className="h-[9px] w-[9px] shrink-0 rounded-full border-2 border-[var(--color-text-faint)] bg-[var(--color-surface)]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <EventIcon type={event.type} />
                      <span className="text-[13px] text-[var(--color-text-primary)]">{event.description}</span>
                      {event.fromRole && event.toRole && (
                        <span className="inline-flex items-center gap-1.5">
                          <RoleBadge role={event.fromRole} />
                          <span className="text-[11px] text-[var(--color-text-muted)]">→</span>
                          <RoleBadge role={event.toRole} />
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {event.date.toLocaleDateString()} · {formatRelativeTime(event.date.toISOString())}
                      </span>
                      {event.meta && (
                        <span className="text-[11px] text-[var(--color-text-faint)]">· {event.meta}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EventIcon({ type }: { type: TimelineEvent["type"] }) {
  const className = "h-3.5 w-3.5 shrink-0";
  switch (type) {
    case "role_change":
      return <UserPlus className={className} style={{ color: "var(--color-success)" }} />;
    case "invitation_sent":
      return <Mail className={className} style={{ color: "var(--color-text-muted)" }} />;
    case "invitation_accepted":
      return <UserCheck className={className} style={{ color: "var(--color-success)" }} />;
    case "invitation_revoked":
      return <UserX className={className} style={{ color: "var(--color-danger)" }} />;
    case "invitation_expired":
      return <Clock className={className} style={{ color: "var(--color-text-faint)" }} />;
  }
}

function RoleBadge({ role }: { role: string }) {
  const colors = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.user;

  return (
    <Badge
      variant="outline"
      className="h-4 px-1.5 py-0 text-[10px] capitalize"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      {role.replace("_", " ")}
    </Badge>
  );
}
