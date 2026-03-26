"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProtectedRoute } from "@/components/RouteGuards";
import { useOrganizationData, useEmployees, usePermissions } from "@/hooks";

interface ChecklistItem {
  label: string;
  description: string;
  done: boolean;
  href: string;
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function SetupContent() {
  const router = useRouter();
  const perms = usePermissions();
  const { setupStatus, loading: orgLoading, org } = useOrganizationData();
  const { employees, loading: empLoading } = useEmployees(perms.orgId ?? org?.id ?? null);
  const redirected = useRef(false);

  const isLoading = orgLoading || empLoading || perms.isLoading;
  const hasEmployees = employees.length > 0;
  const isComplete = setupStatus.isComplete && hasEmployees;

  // Once everything is set up, redirect to dashboard
  useEffect(() => {
    if (isLoading || !isComplete || redirected.current) return;
    redirected.current = true;
    router.replace("/dashboard");
  }, [isLoading, isComplete, router]);

  if (isLoading) return null;
  if (isComplete) return null; // redirect in progress

  const orgName = org?.name ?? "Your Organization";

  const items: ChecklistItem[] = [
    {
      label: "Organization Details",
      description: org ? "Name and timezone configured" : "Create your organization",
      done: !!org,
      href: "/settings",
    },
    {
      label: org?.focusAreaLabel || "Focus Areas",
      description: setupStatus.missing.focusAreas
        ? `No ${(org?.focusAreaLabel || "focus areas").toLowerCase()} yet`
        : `${org?.focusAreaLabel || "Focus areas"} configured`,
      done: !setupStatus.missing.focusAreas,
      href: "/settings",
    },
    {
      label: "Shift Codes",
      description: setupStatus.missing.shiftCodes
        ? "No shift codes yet"
        : "Shift codes configured",
      done: !setupStatus.missing.shiftCodes,
      href: "/settings/shift-codes",
    },
    {
      label: org?.certificationLabel || "Certifications",
      description: setupStatus.missing.certifications
        ? `No ${(org?.certificationLabel || "certifications").toLowerCase()} yet`
        : `${org?.certificationLabel || "Certifications"} configured`,
      done: !setupStatus.missing.certifications,
      href: "/settings/staff-config",
    },
    {
      label: org?.roleLabel || "Roles",
      description: setupStatus.missing.orgRoles
        ? `No ${(org?.roleLabel || "roles").toLowerCase()} yet`
        : `${org?.roleLabel || "Roles"} configured`,
      done: !setupStatus.missing.orgRoles,
      href: "/settings/staff-config",
    },
    {
      label: "Employees",
      description: hasEmployees
        ? `${employees.length} employee${employees.length === 1 ? "" : "s"} added`
        : "No employees yet",
      done: hasEmployees,
      href: "/staff",
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const progress = Math.round((completedCount / items.length) * 100);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        padding: 24,
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 6px",
              letterSpacing: "-0.02em",
            }}
          >
            Set Up {orgName}
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "var(--color-text-muted)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Complete these items to unlock the full app.
          </p>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-text-muted)",
              }}
            >
              {completedCount} of {items.length} complete
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: progress === 100 ? "var(--color-success, #16a34a)" : "var(--color-primary, #0357CA)",
              }}
            >
              {progress}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 3,
              background: "var(--color-border)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: 3,
                background: progress === 100
                  ? "var(--color-success, #16a34a)"
                  : "var(--color-primary, #0357CA)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Checklist */}
        <div
          style={{
            background: "var(--color-bg-card, white)",
            borderRadius: 16,
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 20px",
                borderBottom: i < items.length - 1 ? "1px solid var(--color-border)" : "none",
              }}
            >
              {/* Status indicator */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: item.done
                    ? "var(--color-success, #16a34a)"
                    : "var(--color-bg, #f7f8f5)",
                  color: item.done ? "white" : "var(--color-text-faint)",
                  border: item.done ? "none" : "1.5px solid var(--color-border)",
                }}
              >
                {item.done ? (
                  <CheckIcon />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
                )}
              </div>

              {/* Label + description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: item.done
                      ? "var(--color-text-muted)"
                      : "var(--color-text-primary)",
                    textDecoration: item.done ? "line-through" : "none",
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-faint)",
                    marginTop: 2,
                  }}
                >
                  {item.description}
                </div>
              </div>

              {/* Action link */}
              {!item.done && (
                <Link
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-primary, #0357CA)",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Set up <ArrowIcon />
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-faint)",
            textAlign: "center",
            marginTop: 20,
            lineHeight: 1.5,
          }}
        >
          Each item opens the relevant settings page. Come back here to track your progress.
        </p>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <ProtectedRoute>
      <SetupContent />
    </ProtectedRoute>
  );
}
