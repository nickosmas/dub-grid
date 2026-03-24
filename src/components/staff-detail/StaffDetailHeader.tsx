"use client";

import Link from "next/link";
import type { Employee, FocusArea, NamedItem, Organization, Invitation } from "@/types";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import { getInitials, getEmployeeDisplayName, getCertAbbr, getRoleAbbrs } from "@/lib/utils";

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

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
  org,
  canManageEmployees,
  thisWeekHours,
  pendingInvite,
}: StaffDetailHeaderProps) {
  const hue = hashCode(employee.id) % 360;
  const displayName = getEmployeeDisplayName(employee);
  const certAbbr = getCertAbbr(employee.certificationId, certifications);
  const roleAbbrs = getRoleAbbrs(employee.roleIds, orgRoles);

  const statusConfig = {
    active: { bg: "var(--color-success-bg)", text: "var(--color-success-text)", dot: "var(--color-success)", label: "Active" },
    benched: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", dot: "var(--color-warning)", label: "Benched" },
    terminated: { bg: "var(--color-danger-bg)", text: "var(--color-danger-text)", dot: "var(--color-danger)", label: "Terminated" },
  }[employee.status];

  // Account link indicator
  const accountIndicator = employee.userId
    ? { color: "var(--color-success)", title: "Linked to user account" }
    : pendingInvite
    ? { color: "var(--color-warning)", title: `Invitation pending — sent to ${pendingInvite.email}` }
    : null;

  return (
    <div>
      {/* Back link */}
      <Link
        href="/staff"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: "var(--dg-fs-body-sm)",
          fontWeight: 600,
          color: "var(--color-text-muted)",
          textDecoration: "none",
          marginBottom: 20,
          transition: "color 150ms ease",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Staff
      </Link>

      {/* Hero card */}
      <div className="staff-hero">
        {/* Colored gradient accent */}
        <div
          className="staff-hero-gradient"
          style={{ background: `linear-gradient(180deg, hsl(${hue}, 60%, 96%) 0%, var(--color-surface) 100%)` }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: `hsl(${hue}, 65%, 94%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 800,
              color: `hsl(${hue}, 60%, 38%)`,
              flexShrink: 0,
              border: `2px solid hsl(${hue}, 55%, 86%)`,
              boxShadow: `0 0 0 4px hsl(${hue}, 50%, 96%)`,
            }}
          >
            {getInitials(displayName)}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            {/* Name row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1
                style={{
                  fontWeight: 700,
                  fontSize: "var(--dg-fs-section-title)",
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                {displayName}
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: statusConfig.bg,
                  color: statusConfig.text,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusConfig.dot }} />
                {statusConfig.label}
              </span>
              {accountIndicator && (
                <span
                  title={accountIndicator.title}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: accountIndicator.color,
                    boxShadow: `0 0 0 2px ${accountIndicator.color}33`,
                    flexShrink: 0,
                    cursor: "help",
                  }}
                />
              )}
            </div>

            {/* Contact info row */}
            <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap", fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
              {employee.email && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22,7 12,13 2,7" /></svg>
                  {employee.email}
                </span>
              )}
              {employee.phone && (
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
                  {employee.phone}
                </span>
              )}
              <span>Seniority #{employee.seniority}</span>
            </div>

            {/* Badges row */}
            <div style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}>
              {employee.focusAreaIds.map((faId) => {
                const fa = focusAreas.find((f) => f.id === faId);
                if (!fa) return null;
                return (
                  <span
                    key={faId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      background: fa.colorBg,
                      color: fa.colorText,
                      fontSize: "var(--dg-fs-badge)",
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "2px 10px",
                    }}
                  >
                    {fa.name}
                  </span>
                );
              })}
              {certAbbr && (
                <span
                  style={{
                    background: "var(--color-border-light)",
                    color: "var(--color-text-muted)",
                    fontSize: "var(--dg-fs-badge)",
                    fontWeight: 600,
                    borderRadius: 20,
                    padding: "2px 10px",
                  }}
                >
                  {certAbbr}
                </span>
              )}
              {roleAbbrs.map((abbr) => (
                <span
                  key={abbr}
                  style={{
                    background: "var(--color-bg-secondary)",
                    color: "var(--color-text-secondary)",
                    fontSize: "var(--dg-fs-badge)",
                    fontWeight: 600,
                    borderRadius: 20,
                    padding: "2px 10px",
                    border: "1px solid var(--color-border-light)",
                  }}
                >
                  {abbr}
                </span>
              ))}
            </div>
          </div>

          {/* This week stat (right side) */}
          {thisWeekHours && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "12px 20px",
                borderRadius: 10,
                background: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border-light)",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: "var(--dg-fs-badge)",
                  fontWeight: 600,
                  color: "var(--color-text-subtle)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                This Week
              </span>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: thisWeekHours.isOvertime ? "var(--color-danger)" : "var(--color-text-primary)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  marginTop: 2,
                }}
              >
                {thisWeekHours.totalHours}h
              </span>
              {thisWeekHours.isOvertime && (
                <span style={{ fontSize: "var(--dg-fs-badge)", color: "var(--color-danger)", fontWeight: 600, marginTop: 2 }}>
                  +{thisWeekHours.overtimeHours}h OT
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
