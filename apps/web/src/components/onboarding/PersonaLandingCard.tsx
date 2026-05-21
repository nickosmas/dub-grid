"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { usePermissions } from "@/hooks";
import {
  fetchOnboardingStatus,
  dismissLandingCard,
} from "@/features/onboarding/client";
import { capturePersonaLandingDismissed } from "@/lib/onboarding-telemetry";
import * as Sentry from "@/lib/sentry";

interface PersonaItem {
  label: string;
  description: string;
  href: string;
}

/**
 * Completion signals for the organization. When provided, the card filters out
 * recommendations that are already done — so a super_admin who has added staff
 * no longer sees "Add staff". Undefined fields mean "unknown" → the item is
 * shown (we never hide a recommendation we can't confirm is complete).
 */
export interface PersonaLandingSignals {
  hasEmployees?: boolean;
  hasCoverageRequirements?: boolean;
  hasPublishedSchedule?: boolean;
  profileComplete?: boolean;
}

interface PersonaLandingCardProps {
  signals?: PersonaLandingSignals;
}

/**
 * Post-onboarding "Next steps" card surfaced once per user on Dashboard.
 * Dismissable; persists across reloads via the
 * organization_memberships.landing_card_dismissed_at column.
 *
 * Recommendations are completion-aware: items the organization has already
 * accomplished are filtered out, and once nothing is left to recommend the
 * card stops rendering entirely.
 */
export default function PersonaLandingCard({ signals }: PersonaLandingCardProps) {
  const { user } = useAuth();
  const perms = usePermissions();
  const queryClient = useQueryClient();

  const userId = user?.id ?? "";
  const orgId = perms.orgId ?? "";
  const enabled = !!userId && !!orgId && !perms.isGridmaster && !perms.isImpersonating;

  const { data: status } = useQuery({
    queryKey: ["onboarding-status", userId, orgId],
    queryFn: () => fetchOnboardingStatus(orgId),
    enabled,
    staleTime: 30_000,
  });

  const [optimisticDismissed, setOptimisticDismissed] = useState(false);

  if (!enabled || !status) return null;
  if (status.landingCardDismissedAt || optimisticDismissed) return null;
  // Only show after onboarding is complete — the wizard is the focus before that.
  if (!status.completed) return null;

  const role = perms.role;
  const content = buildContentForRole(role, perms, signals);
  // Nothing left to recommend — don't render an empty card.
  if (!content || content.entries.length === 0) return null;

  async function handleDismiss() {
    setOptimisticDismissed(true);
    capturePersonaLandingDismissed({ role, orgId });
    try {
      await dismissLandingCard(orgId);
      queryClient.setQueryData(
        ["onboarding-status", userId, orgId],
        {
          ...status,
          landingCardDismissedAt: new Date().toISOString(),
        },
      );
    } catch (err) {
      Sentry.captureException(err);
      setOptimisticDismissed(false);
    }
  }

  return (
    <div
      style={{
        position: "relative",
        background: "var(--color-bg-card, white)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-xl)",
        padding: "20px 24px",
        marginBottom: 24,
        boxShadow: "var(--shadow-raised)",
      }}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "none",
          border: "none",
          color: "var(--color-text-faint)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 6,
          display: "flex",
        }}
      >
        <X size={16} />
      </button>

      <div style={{ marginBottom: 14, maxWidth: 540 }}>
        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: "0 0 4px",
            letterSpacing: "-0.01em",
          }}
        >
          {content.heading}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {content.subheading}
        </p>
      </div>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        {content.entries.map((entry) => (
          <li key={entry.label}>
            <Link
              href={entry.href}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--color-border)",
                textDecoration: "none",
                background: "var(--color-bg)",
                transition: "border-color 150ms ease",
              }}
            >
              <span>
                <span
                  style={{
                    display: "block",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {entry.label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    marginTop: 2,
                  }}
                >
                  {entry.description}
                </span>
              </span>
              <ArrowRight
                size={16}
                color="var(--color-text-faint)"
                style={{ flexShrink: 0 }}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Permissions {
  role: string;
  isSuperAdmin: boolean;
  canEditShifts?: boolean;
  canPublishSchedule?: boolean;
  canManageEmployees?: boolean;
  canViewDashboardAnalytics?: boolean;
  canManageCoverageRequirements?: boolean;
  canManageShiftCodes?: boolean;
  canViewSchedule?: boolean;
  canApproveShiftRequests?: boolean;
}

interface PersonaContent {
  heading: string;
  subheading: string;
  entries: PersonaItem[];
}

function buildContentForRole(
  role: string,
  perms: Permissions,
  signals: PersonaLandingSignals | undefined,
): PersonaContent | null {
  if (role === "super_admin") {
    // Each item is paired with the signal that marks it done. `true` filters
    // it out; `undefined` (unknown) keeps it visible.
    const candidates: Array<PersonaItem & { done?: boolean }> = [
      {
        label: "Add staff",
        description: "Invite teammates and import staff from CSV.",
        href: "/people",
        done: signals?.hasEmployees,
      },
      {
        label: "Define coverage",
        description: "Set how many people each shift needs.",
        href: "/settings?section=schedule-coverage",
        done: signals?.hasCoverageRequirements,
      },
      {
        label: "Publish a schedule",
        description: "Build your first week and share it with your team.",
        href: "/schedule",
        done: signals?.hasPublishedSchedule,
      },
    ];
    const entries = candidates
      .filter((c) => c.done !== true)
      .map(({ done: _done, ...item }) => item);
    if (entries.length === 0) return null;
    const hasPublished = signals?.hasPublishedSchedule === true;
    return {
      heading: hasPublished
        ? "Finish setting up your organization"
        : "Build your first schedule",
      subheading: hasPublished
        ? "A few more steps to round out your setup."
        : "A few next steps to get your team scheduled and running.",
      entries,
    };
  }

  if (role === "admin") {
    // Admin shortcuts surface granted capabilities (not one-time milestones),
    // so they're permission-gated rather than completion-gated.
    const entries: PersonaItem[] = [];
    if (perms.canEditShifts || perms.canPublishSchedule) {
      entries.push({
        label: "Edit the schedule",
        description: "Move shifts, fill open jobs, and publish updates.",
        href: "/schedule",
      });
    }
    if (perms.canManageEmployees) {
      entries.push({
        label: "Manage staff",
        description: "Add, edit, and assign your team.",
        href: "/people",
      });
    }
    if (perms.canApproveShiftRequests) {
      entries.push({
        label: "Review requests",
        description: "Approve or deny shift swaps and callouts.",
        href: "/requests",
      });
    }
    if (perms.canViewDashboardAnalytics) {
      entries.push({
        label: "Track coverage",
        description: "Real-time staffing and coverage analytics.",
        href: "/dashboard",
      });
    }
    if (entries.length === 0) return null;
    return {
      heading: "Here's what you can do",
      subheading:
        "These shortcuts cover the permissions you've been granted.",
      entries,
    };
  }

  if (role === "user") {
    // The user nudge is fundamentally "complete your profile" — once that's
    // done there's nothing left to recommend, so the card stops rendering.
    if (signals?.profileComplete) return null;
    return {
      heading: "Complete your profile",
      subheading:
        "Add your contact info and availability so your team can reach you.",
      entries: [
        {
          label: "Update profile",
          description: "Phone, emergency contact, and details.",
          href: "/profile",
        },
        {
          label: "View your schedule",
          description: "Upcoming shifts and quick swap requests.",
          href: "/schedule",
        },
      ],
    };
  }

  return null;
}
