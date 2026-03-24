"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarBadge } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import type { Employee, FocusArea, NamedItem, Organization, Invitation } from "@/types";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import { getInitials, getEmployeeDisplayName, getCertAbbr, getRoleAbbrs } from "@/lib/utils";

interface StaffDetailHeaderProps {
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  org: Organization;
  canManageEmployees: boolean;
  thisWeekHours: EmployeeHours | null;
  pendingInvite: Invitation | null;
}

export function StaffDetailHeader({
  employee,
  focusAreas,
  certifications,
  orgRoles,
  thisWeekHours,
  pendingInvite,
}: StaffDetailHeaderProps) {
  const displayName = getEmployeeDisplayName(employee);
  const certAbbr = getCertAbbr(employee.certificationId, certifications);
  const roleAbbrs = getRoleAbbrs(employee.roleIds, orgRoles);

  const statusConfig = {
    active: { dot: "bg-emerald-500", label: "Active" },
    benched: { dot: "bg-amber-500", label: "Benched" },
    terminated: { dot: "bg-rose-500", label: "Terminated" },
  }[employee.status] ?? { dot: "bg-muted-foreground", label: employee.status };

  // Account indicator color for AvatarBadge
  const accountBadgeColor = employee.userId
    ? "bg-emerald-500"
    : pendingInvite
    ? "bg-amber-500"
    : null;

  return (
    <div className="flex flex-col mb-4">
      {/* Back link */}
      <Link
        href="/staff"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground transition-colors mb-5 w-fit"
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
        Staff
      </Link>

      {/* Hero card */}
      <Card className="shadow-sm">
        <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start gap-4 sm:gap-5">
            {/* Avatar */}
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarFallback className="text-lg font-bold bg-muted text-muted-foreground">
                {getInitials(displayName)}
              </AvatarFallback>
              {accountBadgeColor && (
                <AvatarBadge className={`${accountBadgeColor} size-3.5`} />
              )}
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Name + status */}
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-bold text-xl sm:text-2xl text-foreground tracking-tight m-0 leading-none">
                  {displayName}
                </h1>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} shrink-0`} />
                  {statusConfig.label}
                </span>
              </div>

              {/* Contact */}
              <div className="flex gap-4 mt-2 flex-wrap text-[13px] text-muted-foreground font-medium">
                {employee.email && <span>{employee.email}</span>}
                {employee.phone && <span>{employee.phone}</span>}
                <span>Seniority #{employee.seniority}</span>
              </div>
            </div>

            {/* This week hours */}
            {thisWeekHours && (
              <div className="text-right shrink-0 pt-1">
                <div className={`text-2xl font-bold tracking-tight leading-none ${thisWeekHours.isOvertime ? 'text-destructive' : 'text-foreground'}`}>
                  {thisWeekHours.totalHours}h
                </div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
                  This Week
                </div>
                {thisWeekHours.isOvertime && (
                  <div className="text-[11px] font-bold text-destructive mt-0.5">
                    +{thisWeekHours.overtimeHours}h OT
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      {(employee.focusAreaIds.length > 0 || certAbbr || roleAbbrs.length > 0) && (
        <Card className="shadow-sm mt-3">
          <CardContent className="px-5 py-4">
            <div className="flex gap-1.5 flex-wrap">
              {employee.focusAreaIds.map((faId) => {
                const fa = focusAreas.find((f) => f.id === faId);
                if (!fa) return null;
                return (
                  <Badge
                    key={faId}
                    variant="outline"
                    className="border-transparent px-2"
                    style={{ background: fa.colorBg, color: fa.colorText }}
                  >
                    {fa.name}
                  </Badge>
                );
              })}
              {certAbbr && (
                <Badge variant="secondary" className="px-2 font-semibold text-muted-foreground">
                  {certAbbr}
                </Badge>
              )}
              {roleAbbrs.map((abbr) => (
                <Badge key={abbr} variant="outline" className="px-2 font-semibold text-secondary-foreground">
                  {abbr}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
