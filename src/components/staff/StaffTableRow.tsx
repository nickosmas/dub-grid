"use client";

import Link from "next/link";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { getInitials, getCertAbbr, getRoleAbbrs, getEmployeeDisplayName } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { TableRow, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface StaffTableRowProps {
  emp: Employee;
  globalIndex: number;
  isExpanded: boolean;
  isReordering: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  canManageEmployees: boolean;
  isSelected: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  pendingInviteByEmployeeId: Map<string, Invitation>;
  onToggleSelect: (empId: string) => void;
  onRowClick: (empId: string) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function StaffTableRow({
  emp,
  globalIndex,
  isExpanded,
  isReordering,
  isDragging,
  isDropTarget,
  canManageEmployees,
  isSelected,
  focusAreas,
  certifications,
  roles,
  pendingInviteByEmployeeId,
  onToggleSelect,
  onRowClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: StaffTableRowProps) {
  const { user: currentUser } = useAuth();
  const hue = hashCode(emp.id) % 360;
  const displayName = getEmployeeDisplayName(emp);
  const initials = getInitials(displayName);
  const isYou = !!(emp.userId && currentUser && emp.userId === currentUser.id);

  return (
    <TableRow
      className={`transition-colors ${isExpanded ? "border-b-0 bg-[var(--color-bg)]" : "hover:bg-[var(--color-bg)]"} ${!isReordering && canManageEmployees ? "cursor-pointer" : ""} ${isReordering ? "cursor-grab" : ""} dg-row-enter`}
      draggable={isReordering}
      onDragStart={isReordering ? () => onDragStart(globalIndex) : undefined}
      onDragOver={isReordering ? (e) => onDragOver(e, globalIndex) : undefined}
      onDrop={isReordering ? onDrop : undefined}
      onDragEnd={isReordering ? onDragEnd : undefined}
      onClick={!isReordering && canManageEmployees ? () => onRowClick(emp.id) : undefined}
      style={{
        opacity: isDragging ? 0.5 : 1,
        borderTop: isDropTarget ? "2px solid var(--color-control-active-border)" : undefined,
        borderLeft: isExpanded ? "3px solid var(--color-control-primary)" : "3px solid transparent",
        boxShadow: isExpanded ? "inset 0 1px 0 var(--color-control-active-border), inset 0 -1px 0 var(--color-control-active-border)" : undefined,
      }}
    >
      {/* Checkbox / Drag handle / Seniority # */}
      <TableCell className="pl-6 py-4 w-[60px]">
        <div className="flex items-center gap-1" style={{ color: "var(--color-text-faint)" }}>
          {isReordering && (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" className="shrink-0">
              <rect x="3" y="2" width="2" height="2" rx="1" />
              <rect x="9" y="2" width="2" height="2" rx="1" />
              <rect x="3" y="6" width="2" height="2" rx="1" />
              <rect x="9" y="6" width="2" height="2" rx="1" />
              <rect x="3" y="10" width="2" height="2" rx="1" />
              <rect x="9" y="10" width="2" height="2" rx="1" />
            </svg>
          )}
          {canManageEmployees && !isReordering && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(emp.id)}
              onClick={(e) => e.stopPropagation()}
              className="accent-[var(--color-today-text)] cursor-pointer w-3.5 h-3.5"
            />
          )}
          <span className="text-[var(--dg-fs-footnote)] font-medium">{emp.seniority}</span>
        </div>
      </TableCell>

      {/* Name */}
      <TableCell className="py-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar>
            <AvatarFallback
              className="text-[11px] font-bold"
              style={{
                background: `hsl(${hue}, 70%, 92%)`,
                color: `hsl(${hue}, 70%, 35%)`,
                border: `1px solid hsl(${hue}, 70%, 85%)`,
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--color-text-primary)] truncate">
              <Link
                href={`/people/${emp.id}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline truncate"
                style={{ color: isExpanded ? "var(--color-control-active-text)" : "inherit" }}
              >
                {displayName}
              </Link>
              {isYou && (
                <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-[var(--color-control-active-bg)] text-[var(--color-control-active-text)] shrink-0">You</span>
              )}
            </div>
            {(emp.email || emp.phone) && (
              <div className="text-[12px] text-[var(--color-text-muted)] truncate mt-0.5">
                {emp.email || emp.phone}
              </div>
            )}
          </div>
        </div>
      </TableCell>

      {/* Focus Areas */}
      <TableCell className="hidden md:table-cell py-4">
        <div className="flex gap-1 flex-wrap">
          {emp.focusAreaIds.map((faId) => {
            const fa = focusAreas.find((f) => f.id === faId);
            if (!fa) return null;
            return (
              <span
                key={faId}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                style={{
                  background: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-light)",
                }}
              >
                {fa.name}
              </span>
            );
          })}
        </div>
      </TableCell>

      {/* Certification */}
      <TableCell className="hidden md:table-cell py-4">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{
            background: "var(--color-border-light)",
            color: "var(--color-text-muted)",
          }}
        >
          {getCertAbbr(emp.certificationId, certifications)}
        </span>
      </TableCell>

      {/* Roles */}
      <TableCell className="hidden lg:table-cell py-4">
        <span className="text-[12px] text-[var(--color-text-muted)]">
          {emp.roleIds.length > 0 ? getRoleAbbrs(emp.roleIds, roles).join(", ") : "\u2014"}
        </span>
      </TableCell>

      {/* Account status */}
      <TableCell className="hidden lg:table-cell py-4">
        {emp.userId ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap bg-[var(--color-success-bg)] text-[var(--color-success-text)]">
            Linked
          </span>
        ) : pendingInviteByEmployeeId.has(emp.id) ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">
            Invited
          </span>
        ) : emp.email ? (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style={{ background: "var(--color-border-light)", color: "var(--color-text-muted)" }}>
            Not invited
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap" style={{ background: "var(--color-border-light)", color: "var(--color-text-muted)" }}>
            No email
          </span>
        )}
      </TableCell>

      {/* Chevron */}
      <TableCell className="pr-6 py-4 w-[40px] text-right">
        <div
          className="flex items-center justify-center"
          style={{
            color: isExpanded ? "var(--color-control-active-text)" : "var(--color-text-faint)",
            visibility: isReordering ? "hidden" : "visible",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </div>
      </TableCell>
    </TableRow>
  );
}
