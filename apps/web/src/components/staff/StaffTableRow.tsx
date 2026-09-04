"use client";

import { useCallback, useId, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Employee, FocusArea, NamedItem, Invitation, OrganizationRole } from "@/types";
import { getEmployeeProfileHref } from "@/lib/profile-links";
import {
  getInitials,
  getCertAbbr,
  getCertName,
  getRoleAbbrs,
  getEmployeeDisplayName,
} from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { TableRow, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { InlineRoleSelect } from "./InlineRoleSelect";
import { getAvatarTone, resolveAvatarSeed } from "@dubgrid/design-tokens";

function statusTone(status: Employee["status"]): StatusPillTone {
  if (status === "inactive") return "warning";
  if (status === "removed") return "danger";
  return "success";
}

function AccountStatusIcon({ icon }: { icon: "linked" | "invited" | "not-linked" }) {
  const reactId = useId();
  const maskId = `account-status-${icon}-${reactId.replaceAll(":", "")}`;

  return (
    <svg
      aria-hidden="true"
      data-account-status-icon={icon}
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 fill-current"
    >
      <defs>
        <mask id={maskId}>
          <circle cx="8" cy="8" r="7" fill="white" />
          {icon === "linked" ? (
            <path
              d="m4.5 8.1 2.2 2.2 4.9-5"
              fill="none"
              stroke="black"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          ) : icon === "invited" ? (
            <path
              d="M8 4.25v4l2.65 1.55"
              fill="none"
              stroke="black"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          ) : (
            <>
              <path d="M7.25 3.75h1.5v5h-1.5z" fill="black" />
              <circle cx="8" cy="11.25" r="0.85" fill="black" />
            </>
          )}
        </mask>
      </defs>
      <circle cx="8" cy="8" r="7" mask={`url(#${maskId})`} />
    </svg>
  );
}

interface StaffRowSharedProps {
  emp: Employee;
  globalIndex: number;
  isExpanded: boolean;
  isReordering: boolean;
  isDragging: boolean;
  canManageEmployees: boolean;
  /** Whether the viewer can see HR/admin detail columns (ID, employment,
   *  status, account state, access role, date joined). Regular users
   *  (canViewStaff only) get a coworker-style roster: NAME / focus areas /
   *  certifications / roles only. */
  canViewEmployeeDetails: boolean;
  /** Status is useful only when the list includes more than one employee status. */
  showStatusColumn: boolean;
  /** Whether the name links to the full /people/[id] details page. Regular
   *  users get the inline read-only panel instead, so the link is suppressed. */
  canNavigateToDetailsPage: boolean;
  isSelected: boolean;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  useCompactRoleCertificationLabels?: boolean;
  /** Access role (org_role) of the linked user, if any. Null for staff with no login. */
  orgRole?: OrganizationRole | null;
  /** Inline role-change handler. Omitted when the viewer can't manage access. */
  onRoleChange?: (newRole: OrganizationRole) => Promise<void>;
  /** Whether the pending-invitation lookup has settled for this organization. */
  invitationStateReady?: boolean;
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
  canViewEmployeeDetails,
  showStatusColumn,
  canNavigateToDetailsPage,
  isSelected,
  focusAreas,
  certifications,
  roles,
  useCompactRoleCertificationLabels = false,
  orgRole,
  onRoleChange,
  invitationStateReady = true,
  pendingInviteByEmployeeId,
  onToggleSelect,
  onRowClick,
  variant,
}: StaffRowCellsProps) {
  const { user: currentUser } = useAuth();
  const { resolvedTheme } = useTheme();
  const avatarTone = getAvatarTone(resolveAvatarSeed(emp), resolvedTheme === "dark");
  const displayName = getEmployeeDisplayName(emp);
  const initials = getInitials(displayName);
  const isYou = !!(emp.userId && currentUser && emp.userId === currentUser.id);
  const profileHref = getEmployeeProfileHref(emp.id, emp.userId, currentUser?.id ?? null);
  const rankNumber = isReordering ? globalIndex + 1 : emp.employeeNumber;
  const employmentAbbr = emp.employmentType === "part_time" ? "PT" : "FT";
  const employmentLabel = emp.employmentType === "part_time" ? "Part-time" : "Full-time";
  const statusLabel =
    emp.status === "inactive" ? "Inactive" : emp.status === "removed" ? "Removed" : "Active";
  const joinedLabel = emp.createdAt
    ? new Date(emp.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <>
      {/* Checkbox / Drag handle / Employee ID */}
      {canViewEmployeeDetails && (
        <StaffCell
          variant={variant}
          tableClassName="pl-6 py-4 w-[100px] border-r border-[var(--dg-color-border-light)]"
          gridClassName="dg-staff-directory-cell dg-staff-directory-cell--rank flex py-4"
        >
          <div
            className="flex items-center gap-1"
            style={{ color: "var(--dg-color-text-primary)" }}
          >
            {isReordering && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 14 14"
                fill="currentColor"
                className="shrink-0"
              >
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
                className="accent-[var(--dg-color-today-text)] cursor-pointer w-3.5 h-3.5"
              />
            )}
            <span className="text-[var(--dg-fs-footnote)] font-medium tabular-nums">
              {isReordering ? rankNumber : `#${rankNumber}`}
            </span>
          </div>
        </StaffCell>
      )}

      {/* Name */}
      <StaffCell
        variant={variant}
        tableClassName="py-4 border-r border-[var(--dg-color-border-light)]"
        gridClassName="dg-staff-directory-cell dg-staff-directory-cell--name flex py-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar>
            <AvatarFallback
              className="text-[length:var(--dg-type-badge-size)] font-semibold"
              style={{
                background: avatarTone.backgroundColor,
                color: avatarTone.textColor,
                border: `1px solid ${avatarTone.borderColor}`,
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--dg-color-text-primary)] truncate">
              {canNavigateToDetailsPage ? (
                <Link
                  href={profileHref}
                  draggable={false}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline truncate"
                  style={{ color: isExpanded ? "var(--dg-color-control-active-text)" : "inherit" }}
                >
                  {displayName}
                </Link>
              ) : (
                <span
                  className="truncate"
                  style={{ color: isExpanded ? "var(--dg-color-control-active-text)" : "inherit" }}
                >
                  {displayName}
                </span>
              )}
              {isYou && (
                <span className="shrink-0 rounded-full bg-[var(--dg-color-control-active-bg)] px-1.5 py-px text-[length:var(--dg-type-badge-size)] font-medium text-[var(--dg-color-control-active-text)]">
                  You
                </span>
              )}
            </div>
            {(emp.email || emp.phone) && (
              <div className="mt-0.5 truncate text-[12px] text-[var(--dg-color-text-primary)]">
                {emp.email || emp.phone}
              </div>
            )}
          </div>
        </div>
      </StaffCell>

      {/* Employment */}
      {canViewEmployeeDetails && (
        <StaffCell
          variant={variant}
          tableClassName="py-4 w-[110px] border-r border-[var(--dg-color-border-light)]"
          gridClassName="dg-staff-directory-cell dg-staff-directory-cell--employment flex py-4"
        >
          <span
            aria-label={employmentLabel}
            className="text-[12px] whitespace-nowrap text-[var(--dg-color-text-primary)]"
          >
            {employmentLabel}
          </span>
        </StaffCell>
      )}

      {/* Status is needed only when this list combines employment statuses. */}
      {canViewEmployeeDetails && showStatusColumn && (
        <StaffCell
          variant={variant}
          tableClassName="py-4 w-[110px] border-[var(--dg-color-border-light)] md:border-r"
          gridClassName="dg-staff-directory-cell dg-staff-directory-cell--status flex py-4"
        >
          <StatusPill
            tone={statusTone(emp.status)}
            variant="category"
            aria-label={`Status: ${statusLabel}`}
          >
            {statusLabel}
          </StatusPill>
        </StaffCell>
      )}

      {/* Focus Areas — neutral StatusPills, cap at 2 visible + "+N more" overflow chip. */}
      <StaffCell
        variant={variant}
        tableClassName="table-cell py-4 border-r border-[var(--dg-color-border-light)]"
        gridClassName="dg-staff-directory-cell flex py-4"
      >
        <div className="flex gap-1">
          {(() => {
            const resolved = emp.focusAreaIds
              .map((faId) => focusAreas.find((f) => f.id === faId))
              .filter((fa): fa is FocusArea => !!fa);
            const visible = resolved.slice(0, 2);
            const overflow = resolved.slice(2);
            return (
              <>
                {visible.map((fa) => (
                  <StatusPill key={fa.id} tone="neutral" variant="category">
                    {fa.name}
                  </StatusPill>
                ))}
                {overflow.length > 0 && (
                  <StatusPill
                    tone="neutral"
                    variant="category"
                    title={overflow.map((fa) => fa.name).join(", ")}
                  >
                    +{overflow.length} more
                  </StatusPill>
                )}
              </>
            );
          })()}
        </div>
      </StaffCell>

      {/* Certification */}
      <StaffCell
        variant={variant}
        tableClassName="table-cell py-4 border-r border-[var(--dg-color-border-light)]"
        gridClassName="dg-staff-directory-cell flex py-4"
      >
        {(() => {
          const certAbbr = getCertAbbr(
            emp.certificationId,
            certifications,
            useCompactRoleCertificationLabels,
          );
          const certName = getCertName(emp.certificationId, certifications);
          return (
            <span
              className="text-[12px] whitespace-nowrap text-[var(--dg-color-text-primary)]"
              title={certName || undefined}
            >
              {certAbbr || "None"}
            </span>
          );
        })()}
      </StaffCell>

      {/* Roles */}
      <StaffCell
        variant={variant}
        tableClassName="table-cell py-4 border-r border-[var(--dg-color-border-light)]"
        gridClassName="dg-staff-directory-cell flex py-4"
      >
        <span className="text-[12px] text-[var(--dg-color-text-primary)]">
          {emp.roleIds.length > 0
            ? getRoleAbbrs(emp.roleIds, roles, useCompactRoleCertificationLabels).join(", ")
            : "\u2014"}
        </span>
      </StaffCell>

      {/* Account status — admin/HR detail (invitation linkage). */}
      {canViewEmployeeDetails && (
        <StaffCell
          variant={variant}
          tableClassName="table-cell py-4 border-r border-[var(--dg-color-border-light)]"
          gridClassName="dg-staff-directory-cell flex py-4"
        >
          {(() => {
            if (!invitationStateReady && !emp.userId && emp.email) return null;

            const account: {
              label: string;
              tone: StatusPillTone;
              icon: "linked" | "invited" | "not-linked";
            } = emp.userId
              ? { label: "Linked", tone: "success", icon: "linked" }
              : pendingInviteByEmployeeId.has(emp.id)
                ? { label: "Invited", tone: "warning", icon: "invited" }
                : emp.email
                  ? { label: "Not invited", tone: "neutral", icon: "not-linked" }
                  : { label: "No email", tone: "danger", icon: "not-linked" };
            return (
              <StatusPill
                tone={account.tone}
                variant="category"
                bordered={false}
                className="gap-1 rounded-full pr-2 pl-1"
                aria-label={`Account: ${account.label}`}
              >
                <AccountStatusIcon icon={account.icon} />
                {account.label}
              </StatusPill>
            );
          })()}
        </StaffCell>
      )}

      {/* Access role (org_role) — admin/HR detail. */}
      {canViewEmployeeDetails && (
        <StaffCell
          variant={variant}
          tableClassName="table-cell py-4 border-r border-[var(--dg-color-border-light)]"
          gridClassName="dg-staff-directory-cell flex py-4"
        >
          {!invitationStateReady && !emp.userId ? null : (
            <InlineRoleSelect
              orgRole={orgRole}
              onChange={onRoleChange}
              isSelf={isYou}
              pendingInvitationEmail={pendingInviteByEmployeeId.get(emp.id)?.email}
            />
          )}
        </StaffCell>
      )}

      {/* Date Joined — admin/HR detail; rightmost data column at lg+. */}
      {canViewEmployeeDetails && (
        <StaffCell
          variant={variant}
          tableClassName="table-cell py-4 w-[140px]"
          gridClassName="dg-staff-directory-cell dg-staff-directory-cell--date-joined flex py-4"
        >
          <span
            className="text-[12px] tabular-nums whitespace-nowrap text-[var(--dg-color-text-primary)]"
            title={emp.createdAt ?? undefined}
          >
            {joinedLabel}
          </span>
        </StaffCell>
      )}

      {/* Chevron */}
      <StaffCell
        variant={variant}
        tableClassName="pr-6 py-4 w-[40px] text-right"
        gridClassName="dg-staff-directory-cell dg-staff-directory-cell--chevron flex py-4"
      >
        <div
          className="flex items-center justify-center"
          style={{
            color: isExpanded
              ? "var(--dg-color-control-active-text)"
              : "var(--dg-color-text-faint)",
            visibility: isReordering ? "hidden" : "visible",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </div>
      </StaffCell>
    </>
  );
}

export function StaffTableRow(props: StaffTableRowProps) {
  const { emp, isExpanded, isReordering, isDragging, onRowClick } = props;

  return (
    <TableRow
      className={`${isExpanded ? "border-b-0 bg-[var(--dg-color-bg)]" : "hover:bg-[var(--dg-color-bg)]"} ${!isReordering ? "cursor-pointer" : ""}`}
      data-dragging={isDragging ? "true" : undefined}
      draggable={false}
      onClick={!isReordering ? () => onRowClick(emp.id) : undefined}
      style={{
        borderLeft: isExpanded
          ? "3px solid var(--dg-color-control-primary)"
          : "3px solid transparent",
        boxShadow: isExpanded
          ? "inset 0 1px 0 var(--dg-color-control-active-border), inset 0 -1px 0 var(--dg-color-control-active-border)"
          : undefined,
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
      onPointerDown={
        onReorderPointerDown ? (event) => onReorderPointerDown(event, globalIndex) : undefined
      }
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
