"use client";

import { Employee, FocusArea, NamedItem, Invitation } from "@/types";
import { getInitials, getCertAbbr, getRoleAbbrs, getEmployeeDisplayName } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface StaffTableRowProps {
  emp: Employee;
  index: number;
  globalIndex: number;
  isExpanded: boolean;
  isReordering: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  canManageEmployees: boolean;
  isSelected: boolean;
  isMobile: boolean;
  isTablet: boolean;
  gridCols: string;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  pendingInviteByEmployeeId: Map<string, Invitation>;
  revokingId: string | null;
  onToggleSelect: (empId: string) => void;
  onRowClick: (empId: string) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: React.DragEvent, idx: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onRevokeInvitation: (invitationId: string) => void;
}

export function StaffTableRow({
  emp,
  index,
  globalIndex,
  isExpanded,
  isReordering,
  isDragging,
  isDropTarget,
  canManageEmployees,
  isSelected,
  isMobile,
  isTablet,
  gridCols,
  focusAreas,
  certifications,
  roles,
  pendingInviteByEmployeeId,
  revokingId,
  onToggleSelect,
  onRowClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRevokeInvitation,
}: StaffTableRowProps) {
  const { user: currentUser } = useAuth();
  const hue = hashCode(emp.id) % 360;

  return (
    <div key={emp.id}>
      <div
        className={`dg-table-row${isExpanded ? " expanded" : ""}`}
        draggable={isReordering}
        onDragStart={isReordering ? () => onDragStart(globalIndex) : undefined}
        onDragOver={isReordering ? (e) => onDragOver(e, globalIndex) : undefined}
        onDrop={isReordering ? onDrop : undefined}
        onDragEnd={isReordering ? onDragEnd : undefined}
        onClick={!isReordering && canManageEmployees ? () => onRowClick(emp.id) : undefined}
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          padding: isMobile ? "10px 12px" : "14px 24px",
          borderTop: isDropTarget
            ? "2px solid var(--color-info)"
            : index === 0
              ? "none"
              : "1px solid var(--color-border-light)",
          alignItems: "center",
          cursor: isReordering ? "grab" : canManageEmployees ? "pointer" : "default",
          opacity: isDragging ? 0.5 : 1,
          borderLeft: isExpanded ? "3px solid var(--color-info)" : "3px solid transparent",
          paddingLeft: isMobile ? "calc(12px - 3px)" : "calc(24px - 3px)",
          position: "relative",
          zIndex: isExpanded ? 1 : 0,
          boxShadow: isExpanded
            ? "inset 0 1px 0 var(--color-info-border), inset 0 -1px 0 var(--color-info-border)"
            : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-faint)" }}>
          {isReordering && (
            <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" style={{ flexShrink: 0 }}>
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
              style={{ accentColor: "var(--color-today-text)", cursor: "pointer", width: 14, height: 14 }}
            />
          )}
          <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 500 }}>{globalIndex + 1}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: `hsl(${hue}, 70%, 92%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 800,
              color: `hsl(${hue}, 70%, 35%)`,
              flexShrink: 0,
              border: `1px solid hsl(${hue}, 70%, 85%)`,
              boxShadow: "var(--shadow-raised)",
            }}
          >
            {getInitials(getEmployeeDisplayName(emp))}
          </div>
          <div>
            <div
              style={{
                fontWeight: isExpanded ? 700 : 600,
                fontSize: "var(--dg-fs-body-sm)",
                color: isExpanded ? "var(--color-info-text)" : "var(--color-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "color 150ms ease",
              }}
            >
              {getEmployeeDisplayName(emp)}
              {emp.userId && currentUser && emp.userId === currentUser.id && (
                <span
                  style={{
                    fontSize: "var(--dg-fs-badge)",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 10,
                    background: "var(--color-info-bg)",
                    color: "var(--color-link)",
                    whiteSpace: "nowrap",
                  }}
                >
                  You
                </span>
              )}
            </div>
            {(emp.email || emp.phone) && (
              <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-faint)", marginTop: 1 }}>
                {emp.email || emp.phone}
              </div>
            )}
          </div>
        </div>

        {!isMobile && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {emp.focusAreaIds.map((faId) => {
              const fa = focusAreas.find((f) => f.id === faId);
              if (!fa) return null;
              return (
                <span
                  key={faId}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-secondary)",
                    fontSize: "var(--dg-fs-footnote)",
                    fontWeight: 600,
                    borderRadius: 20,
                    padding: "2px 8px",
                    whiteSpace: "nowrap",
                    border: "1px solid var(--color-border-light)",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: fa.colorBg, flexShrink: 0 }} />
                  {fa.name}
                </span>
              );
            })}
          </div>
        )}

        {!isMobile && (
          <div>
            <span
              style={{
                background: "var(--color-border-light)",
                color: "var(--color-text-muted)",
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 600,
                borderRadius: 20,
                padding: "3px 9px",
              }}
            >
              {getCertAbbr(emp.certificationId, certifications)}
            </span>
          </div>
        )}

        {!isMobile && !isTablet && (
          <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)" }}>
            {emp.roleIds.length > 0 ? getRoleAbbrs(emp.roleIds, roles).join(", ") : "\u2014"}
          </div>
        )}

        {/* Account status column */}
        {!isMobile && !isTablet && (
          <div style={{ display: "flex", alignItems: "center" }}>
            {emp.userId ? (
              <span
                style={{
                  fontSize: "var(--dg-fs-badge)",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "var(--color-success-bg)",
                  color: "var(--color-success-text)",
                  whiteSpace: "nowrap",
                }}
              >
                Linked
              </span>
            ) : pendingInviteByEmployeeId.has(emp.id) ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    fontSize: "var(--dg-fs-badge)",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: "var(--color-warning-bg)",
                    color: "var(--color-warning-text)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Invited
                </span>
                {canManageEmployees &&
                  (() => {
                    const inv = pendingInviteByEmployeeId.get(emp.id)!;
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRevokeInvitation(inv.id);
                        }}
                        disabled={revokingId === inv.id}
                        style={{
                          fontSize: "var(--dg-fs-badge)",
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 10,
                          background: "none",
                          color: "var(--color-warning-text)",
                          border: "1px solid var(--color-warning-text)",
                          cursor: revokingId === inv.id ? "not-allowed" : "pointer",
                          opacity: revokingId === inv.id ? 0.5 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {revokingId === inv.id ? "..." : "Revoke"}
                      </button>
                    );
                  })()}
              </span>
            ) : emp.email ? (
              <span
                style={{
                  fontSize: "var(--dg-fs-badge)",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "var(--color-border-light)",
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                Not invited
              </span>
            ) : (
              <span
                style={{
                  fontSize: "var(--dg-fs-badge)",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "var(--color-border-light)",
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                No email
              </span>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: isExpanded ? "var(--color-info)" : "var(--color-text-faint)",
            transition: "color 150ms ease",
            userSelect: "none",
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
      </div>
    </div>
  );
}
