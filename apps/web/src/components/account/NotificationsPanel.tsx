"use client";

import { SectionCard } from "@/components/settings/shared";
import { NotificationPreferences } from "@/components/profile/NotificationPreferences";
import { openConsentPreferences } from "@/components/CookieConsent";

interface NotificationsPanelProps {
  /** Gridmasters only see the "system" category. */
  isGridmaster: boolean;
}

export function NotificationsPanel({ isGridmaster }: NotificationsPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionCard>
        <NotificationPreferences
          visibleCategories={isGridmaster ? ["system"] : undefined}
        />
      </SectionCard>

      <SectionCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              Cookie preferences
            </div>
            <p className="mb-0 mt-1 text-[13px] text-[var(--color-text-muted)]">
              Adjust which cookies and analytics DubGrid uses on this device.
            </p>
          </div>
          <button
            type="button"
            onClick={openConsentPreferences}
            className="dg-btn dg-btn-secondary self-start"
          >
            Manage cookie preferences
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
