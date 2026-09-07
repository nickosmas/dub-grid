"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useTheme } from "next-themes";
import { createPortal } from "react-dom";
import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  Layers,
  Mail,
  Phone,
  Tag,
  UserCircle,
} from "lucide-react";
import type { Employee, FocusArea, NamedItem, OrganizationRole } from "@/types";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { getInitials, getEmployeeDisplayName } from "@/lib/utils";
import { AccessInsignia } from "./AccessInsignia";
import { getAvatarTypography, getAvatarTone, resolveAvatarSeed } from "@dubgrid/design-tokens";

interface StaffReadOnlyDetailPanelProps {
  employee: Employee;
  /** Drives the avatar insignia. This panel shows no Access row of its own. */
  orgRole?: OrganizationRole | null;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  roleLabel: string;
  focusAreaLabel: string;
  certificationLabel: string;
  departments?: NamedItem[];
  departmentLabel?: string;
  onClose: () => void;
}

function formatList(ids: number[], map: Map<number, string>): string {
  const names = ids.map((id) => map.get(id)).filter((v): v is string => Boolean(v));
  return names.length > 0 ? names.join(", ") : "—";
}

function deriveScheduledDepartmentIds(focusAreaIds: number[], focusAreas: FocusArea[]): number[] {
  const selected = new Set(focusAreaIds);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const fa of focusAreas) {
    if (!selected.has(fa.id) || fa.departmentId == null) continue;
    if (seen.has(fa.departmentId)) continue;
    seen.add(fa.departmentId);
    out.push(fa.departmentId);
  }
  return out;
}

export function StaffReadOnlyDetailPanel({
  employee,
  orgRole,
  focusAreas,
  certifications,
  roles,
  roleLabel,
  focusAreaLabel,
  certificationLabel,
  departments,
  departmentLabel,
  onClose,
}: StaffReadOnlyDetailPanelProps) {
  const { resolvedTheme } = useTheme();
  const avatarTone = getAvatarTone(resolveAvatarSeed(employee), resolvedTheme === "dark");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useLatestRef(onClose);

  const closePanel = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onCloseRef.current();
    }, 200);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closePanel]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [employee.id]);

  const focusAreaMap = new Map(focusAreas.map((fa) => [fa.id, fa.name]));
  const roleMap = new Map(roles.map((role) => [role.id, role.name]));
  const certMap = new Map(
    certifications.map((certification) => [certification.id, certification.name]),
  );
  const deptMap = new Map((departments ?? []).map((d) => [d.id, d.name]));

  const focusAreaNames = formatList(employee.focusAreaIds, focusAreaMap);
  const roleNames = formatList(employee.roleIds, roleMap);
  const departmentIds = deriveScheduledDepartmentIds(employee.focusAreaIds, focusAreas);
  const departmentNames = formatList(departmentIds, deptMap);
  const certificationName =
    employee.certificationId != null ? (certMap.get(employee.certificationId) ?? "Unknown") : "—";
  const employmentLabel = employee.employmentType === "part_time" ? "Part-time" : "Full-time";
  const displayName = getEmployeeDisplayName(employee);
  const initials = getInitials(displayName);

  return createPortal(
    <>
      <div className={`staff-detail-overlay${closing ? " closing" : ""}`} onClick={closePanel} />
      <div className={`staff-detail-pane${closing ? " closing" : ""}`}>
        {/* Header */}
        <div
          className="staff-detail-header"
          style={{
            background: `linear-gradient(180deg, ${avatarTone.backgroundColor} 0%, var(--dg-color-surface) 100%)`,
            borderBottom: "1px solid var(--dg-color-border)",
          }}
        >
          <CloseButton
            size="md"
            className="self-end"
            onClick={closePanel}
            aria-label="Close detail panel"
          />

          <div
            style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", paddingTop: 8 }}
          >
            <div
              style={{
                ...getAvatarTypography(56),
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: avatarTone.backgroundColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: avatarTone.textColor,
                flexShrink: 0,
                border: `1px solid ${avatarTone.borderColor}`,
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 18,
                    color: "var(--dg-color-text-primary)",
                    letterSpacing: "-0.01em",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    lineHeight: 1.2,
                    minWidth: 0,
                  }}
                >
                  {displayName}
                </span>
                <AccessInsignia orgRole={orgRole} size="md" />
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: "var(--dg-fs-footnote)",
                    fontWeight: 600,
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: "var(--dg-color-bg-secondary)",
                    color: "var(--dg-color-text-muted)",
                    border: "1px solid var(--dg-color-border)",
                    flexShrink: 0,
                  }}
                >
                  {employmentLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px 32px" }}
        >
          {/* Quick action */}
          {employee.email && (
            <a
              href={`mailto:${employee.email}`}
              className="dg-btn dg-btn-secondary"
              style={{
                display: "flex",
                width: "100%",
                textDecoration: "none",
                marginBottom: 22,
              }}
            >
              <Mail size={15} strokeWidth={2.2} />
              Email
            </a>
          )}

          <ReadOnlySection title="Staff Profile">
            <ReadOnlyRow
              icon={<UserCircle size={15} strokeWidth={1.8} />}
              label="Name"
              value={displayName}
            />
            <ReadOnlyRow
              icon={<Briefcase size={15} strokeWidth={1.8} />}
              label="Employment"
              value={employmentLabel}
            />
            <ReadOnlyRow
              icon={<Tag size={15} strokeWidth={1.8} />}
              label={roleLabel}
              value={roleNames}
            />
            <ReadOnlyRow
              icon={<Award size={15} strokeWidth={1.8} />}
              label={certificationLabel}
              value={certificationName}
            />
            <ReadOnlyRow
              icon={<Layers size={15} strokeWidth={1.8} />}
              label={focusAreaLabel}
              value={focusAreaNames}
              isLast
            />
          </ReadOnlySection>

          <ReadOnlySection title="Contact">
            <ReadOnlyRow
              icon={<Mail size={15} strokeWidth={1.8} />}
              label="Email"
              value={
                employee.email ? (
                  <a
                    href={`mailto:${employee.email}`}
                    style={{
                      color: "var(--dg-color-link)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    {employee.email}
                  </a>
                ) : (
                  <span style={{ color: "var(--dg-color-text-faint)" }}>—</span>
                )
              }
            />
            <ReadOnlyRow
              icon={<Phone size={15} strokeWidth={1.8} />}
              label="Phone"
              value={
                employee.phone ? (
                  <a
                    href={`tel:${employee.phone}`}
                    style={{
                      color: "var(--dg-color-link)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    {employee.phone}
                  </a>
                ) : (
                  <span style={{ color: "var(--dg-color-text-faint)" }}>—</span>
                )
              }
              isLast
            />
          </ReadOnlySection>

          {departments && departments.length > 0 && departmentIds.length > 0 && (
            <ReadOnlySection title={departmentLabel ?? "Departments"}>
              <ReadOnlyRow
                icon={<Building2 size={15} strokeWidth={1.8} />}
                label={departmentLabel ?? "Departments"}
                value={departmentNames}
                isLast
              />
            </ReadOnlySection>
          )}

          {employee.statusChangedAt && (
            <div
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--dg-color-text-faint)",
              }}
            >
              <Calendar size={12} strokeWidth={2} />
              <span>
                On staff since{" "}
                {new Date(employee.statusChangedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
        </div>
        <ScrollOverflowCue />
      </div>
    </>,
    document.body,
  );
}

function ReadOnlySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h3
        className="dg-type-content-group-heading"
        style={{
          margin: "0 0 10px 2px",
        }}
      >
        {title}
      </h3>
      <div
        style={{
          background: "var(--dg-color-surface)",
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-lg)",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function ReadOnlyRow({
  icon,
  label,
  value,
  isLast = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 14px",
        borderBottom: isLast ? "none" : "1px solid var(--dg-color-border)",
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: "var(--dg-radius-md)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--dg-color-bg-secondary)",
          color: "var(--dg-color-text-muted)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: "var(--dg-fs-caption)",
          color: "var(--dg-color-text-muted)",
          fontWeight: 500,
          flexShrink: 0,
          width: 110,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--dg-fs-body)",
          color: "var(--dg-color-text-primary)",
          fontWeight: 500,
          flex: 1,
          minWidth: 0,
          textAlign: "right",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
    </div>
  );
}
