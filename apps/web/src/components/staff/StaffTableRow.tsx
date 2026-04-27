"use client";

import { useCallback, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { getEmployeeProfileHref } from "@/lib/profile-links";
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

interface StaffRowSharedProps {
  emp: Employee;
  globalIndex: number;
  isExpanded: boolean;
  isReordering: boolean;
  isDragging: boolean;
  canManageEmployees: boolean;
  isSelected: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  pendingInviteByEmployeeId: Map<string, Invitation>;
  onToggleSelect: (empId: string) => void;
  onRowClick: (empId: string) => void;
}

interface StaffTableRowProps extends StaffRowSharedProps {}

interface StaffReorderListRowProps extends StaffRowSharedProps {
  onRowRef?: (employeeId: string, node: HTMLDivElement | null) => void;
  dragOffsetY?: number;
  dragPhase?: "dragging" | "settling";
  onReorderPointerDown?: (event: React.PointerEvent<HTMLDivElement>, idx: number) => void;
  onReorderPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onReorderPointerEnd?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onReorderPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
}

interface StaffRowCellsProps extends StaffRowSharedProps {
  variant: "table" | "grid";
}

function StaffCell({
  variant,
  tableClassName,
  gridClassName,
  children,
}: {
  variant: "table" | "grid";
  tableClassName: string;
  gridClassName: string;
  children: ReactNode;
}) {
  if (variant === "table") {
    return <TableCell className={tableClassName}>{children}</TableCell>;
  }

  return <div className={gridClassName}>{children}</div>;
}

function StaffRowCells({
  emp,
  globalIndex,
  isExpanded,
  isReordering,
  canManageEmployees,
  isSelected,
  focusAreas,
  certifications,
  roles,
  pendingInviteByEmployeeId,
  onToggleSelect,
  onRowClick,
  variant,
}: StaffRowCellsProps) {
  const { user: currentUser } = useAuth();
  const hue = hashCode(emp.id) % 360;
  const displayName = getEmployeeDisplayName(emp);
  const initials = getInitials(displayName);
  const isYou = !!(emp.userId && currentUser && emp.userId === currentUser.id);
  const profileHref = getEmployeeProfileHref(emp.id, emp.userId, currentUser?.id ?? null);
  const rankNumber = isReordering ? globalIndex + 1 : emp.seniority;

  return (
    <>
      {/* Checkbox / Drag handle / Seniority # */}
      <StaffCell
        variant={variant}
        tableClassName="pl-6 py-4 w-[60px]"
        gridClassName="dg-staff-directory-cell dg-staff-directory-cell--rank flex pl-6 py-4"
      >
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
          <span className="text-[var(--dg-fs-footnote)] font-medium">{rankNumber}</span>
        </div>
      </StaffCell>

      {/* Name */}
      <StaffCell
        variant={variant}
        tableClassName="py-4"
        gridClassName="dg-staff-directory-cell dg-staff-directory-cell--name flex py-4"
      >
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
                href={profileHref}
                draggable={false}
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
      </StaffCell>

      {/* Focus Areas */}
      <StaffCell
        variant={variant}
        tableClassName="hidden md:table-cell py-4"
        gridClassName="dg-staff-directory-cell hidden py-4 md:flex"
      >
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
      </StaffCell>

      {/* Certification */}
      <StaffCell
        variant={variant}
        tableClassName="hidden md:table-cell py-4"
        gridClassName="dg-staff-directory-cell hidden py-4 md:flex"
      >
        <span
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          style={{
            background: "var(--color-border-light)",
            color: "var(--color-text-muted)",
          }}
        >
          {getCertAbbr(emp.certificationId, certifications)}
        </span>
      </StaffCell>

      {/* Roles */}
      <StaffCell
        variant={variant}
        tableClassName="hidden lg:table-cell py-4"
        gridClassName="dg-staff-directory-cell hidden py-4 lg:flex"
      >
        <span className="text-[12px] text-[var(--color-text-muted)]">
          {emp.roleIds.length > 0 ? getRoleAbbrs(emp.roleIds, roles).join(", ") : "\u2014"}
        </span>
      </StaffCell>

      {/* Account status */}
      <StaffCell
        variant={variant}
        tableClassName="hidden lg:table-cell py-4"
        gridClassName="dg-staff-directory-cell hidden py-4 lg:flex"
      >
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
      </StaffCell>

      {/* Chevron */}
      <StaffCell
        variant={variant}
        tableClassName="pr-6 py-4 w-[40px] text-right"
        gridClassName="dg-staff-directory-cell dg-staff-directory-cell--chevron flex pr-6 py-4"
      >
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
      </StaffCell>
    </>
  );
}

export function StaffTableRow(props: StaffTableRowProps) {
  const {
    emp,
    isExpanded,
    isReordering,
    isDragging,
    canManageEmployees,
    onRowClick,
  } = props;

  return (
    <TableRow
      className={`${isExpanded ? "border-b-0 bg-[var(--color-bg)]" : "hover:bg-[var(--color-bg)]"} ${!isReordering && canManageEmployees ? "cursor-pointer" : ""}`}
      data-dragging={isDragging ? "true" : undefined}
      draggable={false}
      onClick={!isReordering && canManageEmployees ? () => onRowClick(emp.id) : undefined}
      style={{
        borderLeft: isExpanded ? "3px solid var(--color-control-primary)" : "3px solid transparent",
        boxShadow: isExpanded ? "inset 0 1px 0 var(--color-control-active-border), inset 0 -1px 0 var(--color-control-active-border)" : undefined,
      }}
    >
      <StaffRowCells {...props} variant="table" />
    </TableRow>
  );
}

export function StaffReorderListRow({
  emp,
  globalIndex,
  isDragging,
  isExpanded,
  isReordering,
  canManageEmployees,
  onRowRef,
  dragOffsetY = 0,
  dragPhase,
  onReorderPointerDown,
  onReorderPointerMove,
  onReorderPointerEnd,
  onReorderPointerCancel,
  ...props
}: StaffReorderListRowProps) {
  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      onRowRef?.(emp.id, node);
    },
    [emp.id, onRowRef],
  );
  const rowStyle = {
    transform: `translate3d(0, ${dragOffsetY}px, 0)`,
  } as CSSProperties;

  return (
    <div
      ref={setRowRef}
      className="dg-staff-directory-row"
      data-dragging={isDragging ? "true" : undefined}
      data-drag-phase={isDragging ? dragPhase : undefined}
      data-moving={!isDragging && dragOffsetY !== 0 ? "true" : undefined}
      draggable={false}
      onPointerDown={onReorderPointerDown ? (event) => onReorderPointerDown(event, globalIndex) : undefined}
      onPointerMove={onReorderPointerMove}
      onPointerUp={onReorderPointerEnd}
      onPointerCancel={onReorderPointerCancel}
      style={rowStyle}
    >
      <StaffRowCells
        {...props}
        emp={emp}
        globalIndex={globalIndex}
        isExpanded={isExpanded}
        isReordering={isReordering}
        isDragging={isDragging}
        canManageEmployees={canManageEmployees}
        variant="grid"
      />
    </div>
  );
}
