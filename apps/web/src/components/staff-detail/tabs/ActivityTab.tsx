"use client";

import { useMemo } from "react";
import type { Employee, AuditLogEntry, Invitation } from "@/types";
import { formatRelativeTime, getEmployeeDisplayName } from "@/lib/utils";
import { formatOrganizationRoleLabel } from "@/lib/client-facing";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  type:
    | "role_change"
    | "invitation_sent"
    | "invitation_accepted"
    | "invitation_revoked"
    | "invitation_expired";
  category: string;
  description: string;
  meta?: string;
  fromRole?: string;
  toRole?: string;
}

export function ActivityTab({ employee, roleHistory, invitations }: ActivityTabProps) {
  const timeline = useMemo(() => {
    const events: TimelineEvent[] = [];

    for (const entry of roleHistory) {
      events.push({
        id: `role-${entry.id}`,
        date: new Date(entry.createdAt),
        type: "role_change",
        category: "Role",
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
        category: "Invitation",
        description: `Invitation sent to ${invitation.email}`,
        meta: `as ${formatOrganizationRoleLabel(invitation.roleToAssign)} · expires ${new Date(invitation.expiresAt).toLocaleDateString()}`,
      });

      if (invitation.acceptedAt) {
        events.push({
          id: `inv-accepted-${invitation.id}`,
          date: new Date(invitation.acceptedAt),
          type: "invitation_accepted",
          category: "Invitation",
          description: `Invitation accepted by ${invitation.email}`,
        });
      } else if (invitation.revokedAt) {
        events.push({
          id: `inv-revoked-${invitation.id}`,
          date: new Date(invitation.revokedAt),
          type: "invitation_revoked",
          category: "Invitation",
          description: "Invitation revoked",
          meta: invitation.email,
        });
      } else if (new Date(invitation.expiresAt) < new Date()) {
        events.push({
          id: `inv-expired-${invitation.id}`,
          date: new Date(invitation.expiresAt),
          type: "invitation_expired",
          category: "Invitation",
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
      <div className={timeline.length === 0 ? "dg-card-body" : "p-0"}>
        {timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <History className="mb-3 h-7 w-7 text-[var(--color-text-faint)]" />
            <p className="text-[13px] text-[var(--color-text-muted)]">No activity recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeline.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex min-w-[120px] flex-col gap-0.5">
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {formatRelativeTime(event.date.toISOString())}
                        </span>
                        <span className="text-[12px] text-[var(--color-text-muted)]">
                          {event.date.toLocaleDateString()}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <EventBadge event={event} />
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[220px] items-center gap-2">
                        <EventIcon type={event.type} />
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {event.description}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[240px] flex-wrap items-center gap-1.5 text-[13px] text-[var(--color-text-muted)]">
                        {event.fromRole && event.toRole ? (
                          <>
                            <RoleBadge role={event.fromRole} />
                            <span className="text-[11px] text-[var(--color-text-muted)]">→</span>
                            <RoleBadge role={event.toRole} />
                          </>
                        ) : null}
                        {event.meta ? (
                          <span className="text-[12px] text-[var(--color-text-muted)]">
                            {event.meta}
                          </span>
                        ) : null}
                        {!event.fromRole && !event.toRole && !event.meta ? (
                          <span className="text-[12px] text-[var(--color-text-faint)]">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function EventBadge({ event }: { event: TimelineEvent }) {
  const tone =
    event.type === "invitation_revoked" || event.type === "invitation_expired"
      ? {
          bg: "var(--color-danger-bg)",
          color: "var(--color-danger)",
          border: "var(--color-danger-bg)",
        }
      : event.type === "role_change"
        ? {
            bg: "var(--color-warning-bg)",
            color: "var(--color-warning)",
            border: "var(--color-warning-bg)",
          }
        : {
            bg: "var(--color-success-bg)",
            color: "var(--color-success)",
            border: "var(--color-success-bg)",
          };

  return (
    <Badge
      variant="outline"
      className="h-5 px-2 py-0 text-[11px] font-semibold"
      style={{
        backgroundColor: tone.bg,
        borderColor: tone.border,
        color: tone.color,
      }}
    >
      {event.category}
    </Badge>
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
      {formatOrganizationRoleLabel(role)}
    </Badge>
  );
}
