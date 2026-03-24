"use client";

import { useMemo } from "react";
import type { Employee, AuditLogEntry, Invitation } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_BADGE_COLORS } from "@/lib/styles";
import { KeyRound, UserCheck, UserPlus, UserX, Mail, Clock, History } from "lucide-react";

interface ActivityTabProps {
  employee: Employee;
  roleHistory: AuditLogEntry[];
  invitations: Invitation[];
}

// Unified timeline event
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
  const statusDays = employee.statusChangedAt
    ? Math.floor((Date.now() - new Date(employee.statusChangedAt).getTime()) / 86400000)
    : null;

  const pendingInvite = invitations.find(i => !i.acceptedAt && !i.revokedAt && new Date(i.expiresAt) > new Date()) ?? null;

  // Account status
  const accountStatus = employee.userId
    ? { label: "Linked", sublabel: "Active user account", color: "bg-emerald-500", ring: "ring-emerald-500/20" }
    : pendingInvite
    ? { label: "Invitation Pending", sublabel: `Sent to ${pendingInvite.email}`, color: "bg-amber-500", ring: "ring-amber-500/20" }
    : { label: "No Account", sublabel: "Not invited yet", color: "bg-muted-foreground/30", ring: "" };

  // Employment status
  const empStatusConfig = {
    active: { color: "bg-emerald-500", ring: "ring-emerald-500/20" },
    benched: { color: "bg-amber-500", ring: "ring-amber-500/20" },
    terminated: { color: "bg-rose-500", ring: "ring-rose-500/20" },
  }[employee.status] ?? { color: "bg-muted-foreground/30", ring: "" };

  // Build unified timeline
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

    for (const inv of invitations) {
      events.push({
        id: `inv-sent-${inv.id}`,
        date: new Date(inv.createdAt),
        type: "invitation_sent",
        description: `Invitation sent to ${inv.email}`,
        meta: `as ${inv.roleToAssign} · expires ${new Date(inv.expiresAt).toLocaleDateString()}`,
      });

      if (inv.acceptedAt) {
        events.push({
          id: `inv-accepted-${inv.id}`,
          date: new Date(inv.acceptedAt),
          type: "invitation_accepted",
          description: `Invitation accepted by ${inv.email}`,
        });
      } else if (inv.revokedAt) {
        events.push({
          id: `inv-revoked-${inv.id}`,
          date: new Date(inv.revokedAt),
          type: "invitation_revoked",
          description: "Invitation revoked",
          meta: inv.email,
        });
      } else if (new Date(inv.expiresAt) < new Date()) {
        events.push({
          id: `inv-expired-${inv.id}`,
          date: new Date(inv.expiresAt),
          type: "invitation_expired",
          description: "Invitation expired",
          meta: inv.email,
        });
      }
    }

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [roleHistory, invitations]);

  return (
    <div className="flex flex-col gap-4">
      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account Status */}
        <Card className="shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${accountStatus.color} ${accountStatus.ring ? `ring-4 ${accountStatus.ring}` : ''}`} />
              <div>
                <div className="text-[13px] font-bold text-foreground">{accountStatus.label}</div>
                <div className="text-[12px] text-muted-foreground">{accountStatus.sublabel}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employment Status */}
        <Card className="shadow-sm">
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-muted-foreground" />
              Employment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${empStatusConfig.color} ${empStatusConfig.ring ? `ring-4 ${empStatusConfig.ring}` : ''}`} />
              <div>
                <div className="text-[13px] font-bold text-foreground capitalize">{employee.status}</div>
                <div className="text-[12px] text-muted-foreground">
                  {statusDays !== null
                    ? `Since ${new Date(employee.statusChangedAt!).toLocaleDateString()} (${statusDays} day${statusDays !== 1 ? "s" : ""})`
                    : "—"}
                </div>
              </div>
            </div>
            {employee.statusNote && (
              <p className="text-[12px] text-muted-foreground italic mt-3 bg-muted/30 p-2.5 rounded-lg">
                {employee.statusNote}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="shadow-sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            History
            <Badge variant="secondary" className="ml-1 font-mono text-[10px] px-1.5 py-0 h-4">{timeline.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <History className="w-7 h-7 text-muted-foreground/30 mb-3" />
              <p className="text-[13px] text-muted-foreground">No activity recorded</p>
            </div>
          ) : (
            <div className="relative pl-6">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              <div className="flex flex-col gap-5">
                {timeline.map((event) => (
                  <div key={event.id} className="relative flex gap-3">
                    {/* Node */}
                    <div className="absolute -left-6 top-1 flex items-center justify-center w-[15px] h-[15px]">
                      <div className="w-[9px] h-[9px] rounded-full bg-background border-2 border-muted-foreground/40 shrink-0" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <EventIcon type={event.type} />
                        <span className="text-[13px] text-foreground">
                          {event.description}
                        </span>
                        {event.fromRole && event.toRole && (
                          <span className="inline-flex items-center gap-1.5">
                            <RoleBadge role={event.fromRole} />
                            <span className="text-muted-foreground text-[11px]">→</span>
                            <RoleBadge role={event.toRole} />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {event.date.toLocaleDateString()} · {formatRelativeTime(event.date.toISOString())}
                        </span>
                        {event.meta && (
                          <span className="text-[11px] text-muted-foreground/60">
                            · {event.meta}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventIcon({ type }: { type: TimelineEvent["type"] }) {
  const cls = "w-3.5 h-3.5 shrink-0";
  switch (type) {
    case "role_change":
      return <UserPlus className={`${cls} text-blue-600`} />;
    case "invitation_sent":
      return <Mail className={`${cls} text-muted-foreground`} />;
    case "invitation_accepted":
      return <UserCheck className={`${cls} text-emerald-600`} />;
    case "invitation_revoked":
      return <UserX className={`${cls} text-rose-600`} />;
    case "invitation_expired":
      return <Clock className={`${cls} text-muted-foreground/60`} />;
  }
}

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_BADGE_COLORS[role] ?? ROLE_BADGE_COLORS.user;
  return (
    <Badge
      variant="outline"
      style={{
        backgroundColor: c.bg,
        color: c.text,
        borderColor: c.border,
      }}
      className="capitalize text-[10px] px-1.5 py-0 h-4"
    >
      {role.replace("_", " ")}
    </Badge>
  );
}
