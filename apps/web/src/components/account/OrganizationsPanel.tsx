"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { SectionCard } from "@/components/settings/shared";
import { EmptyState } from "@/components/EmptyState";
import { extractErrorMessage } from "@/lib/error-handling";
import {
  fetchAccessibleOrganizations,
  switchBrowserOrganization,
  type AccessibleOrganization,
} from "@/features/account/client";

export function OrganizationsPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["account", "accessible-organizations"],
    queryFn: () => fetchAccessibleOrganizations(),
    staleTime: 60_000,
  });

  const organizations: AccessibleOrganization[] = data?.organizations ?? [];

  async function handleSwitch(target: AccessibleOrganization) {
    if (target.is_active || switching) return;
    setSwitching(target.org_id);
    try {
      await switchBrowserOrganization(target.org_id);
      toast.success(`Switched to ${target.org_name}.`);
      // Force a hard reload: server-rendered org-scoped data + JWT claims
      // depend on the new active org.
      await queryClient.invalidateQueries();
      router.refresh();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to switch organization."));
    } finally {
      setSwitching(null);
    }
  }

  if (isPending) {
    return (
      <SectionCard>
        <span aria-hidden className="dg-skeleton" style={{ display: "block", height: 80 }} />
      </SectionCard>
    );
  }

  if (isError) {
    return (
      <SectionCard>
        <EmptyState
          size="compact"
          title="Couldn't load your organizations"
          description="Please try again."
          action={
            <button type="button" onClick={() => refetch()} className="dg-btn dg-btn-secondary">
              Retry
            </button>
          }
        />
      </SectionCard>
    );
  }

  if (organizations.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          size="compact"
          title="No organizations"
          description="You don't belong to any organizations yet."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
            Your organizations
          </div>
          <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
            Switch the active organization for this browser session.
          </p>
        </div>
        <ul style={{ display: "flex", flexDirection: "column", gap: 8, padding: 0, margin: 0, listStyle: "none" }}>
          {organizations.map((org) => {
            const isActive = org.is_active;
            const isSwitchingThis = switching === org.org_id;
            return (
              <li
                key={org.org_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--dg-radius-md)",
                  border: "1px solid var(--color-border)",
                  background: isActive ? "var(--color-brand-bg)" : "var(--color-surface)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "var(--dg-fs-body-sm)",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {org.org_name}
                  </span>
                  {org.org_slug && (
                    <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                      {org.org_slug}
                    </span>
                  )}
                </div>
                {isActive ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 600,
                      color: "var(--color-brand)",
                    }}
                  >
                    <Check size={14} />
                    Active
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSwitch(org)}
                    disabled={switching !== null}
                    className="dg-btn dg-btn-secondary dg-btn-sm"
                  >
                    {isSwitchingThis ? "Switching..." : "Switch"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}
