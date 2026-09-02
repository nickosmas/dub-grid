"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { toast } from "sonner";
import { Bell, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { EditorActionRow } from "@/components/ui/editor-action-row";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from "@/features/account/client";

interface CategoryPrefs {
  in_app: boolean;
  email: boolean;
}

interface AllPrefs {
  [category: string]: CategoryPrefs;
}

const DEFAULT_PREFS: AllPrefs = {
  schedule: { in_app: true, email: false },
  shift_requests: { in_app: true, email: false },
  membership: { in_app: true, email: false },
  account: { in_app: true, email: false },
  billing: { in_app: true, email: true },
  security: { in_app: true, email: true },
  system: { in_app: true, email: false },
};

const CATEGORY_LABELS: Record<string, string> = {
  schedule: "Schedule Changes",
  shift_requests: "Shift Requests",
  membership: "Membership & Invitations",
  account: "Account & Organization",
  billing: "Billing & Payments",
  security: "Security Alerts",
  system: "System Notifications",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  schedule: "Shift changes, published schedules, recurring updates",
  shift_requests: "New, approved, or rejected shift requests",
  membership: "Invitations, role changes, and removal from organizations",
  account: "Employee record updates and organization settings",
  billing: "Subscription changes, payment failures, receipts",
  security: "Password, email, MFA, new-device, and account-access alerts",
  system: "Role changes and system updates",
};

/**
 * Which preference categories a user can actually receive notifications for.
 * Billing events fan out to super_admins only (see
 * features/notifications/server/events.ts), so the billing row is hidden for
 * everyone else. Gridmasters only receive platform/system notifications.
 */
export function notificationCategoriesForRole({
  isGridmaster,
  isSuperAdmin,
}: {
  isGridmaster: boolean;
  isSuperAdmin: boolean;
}): string[] {
  if (isGridmaster) return ["system"];
  const categories = Object.keys(CATEGORY_LABELS);
  return isSuperAdmin ? categories : categories.filter((category) => category !== "billing");
}

const preferenceGridTemplate = "minmax(0, 1fr) 76px 76px";

const centeredChannelCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 20,
};

function NotificationPreferencesSkeleton({ rowCount }: { rowCount: number }) {
  return (
    <div
      aria-label="Loading notification preferences"
      role="status"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="dg-skeleton dg-skeleton--text" style={{ width: "46%" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="dg-skeleton" style={{ height: 40, borderRadius: 4 }} />
        {Array.from({ length: rowCount }, (_, index) => (
          <div
            key={index}
            style={{
              display: "grid",
              gridTemplateColumns: preferenceGridTemplate,
              gap: 8,
              alignItems: "center",
              minHeight: 56,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "42%" }} />
              <div className="dg-skeleton dg-skeleton--text" style={{ width: "78%" }} />
            </div>
            <div className="dg-skeleton" style={{ width: 34, height: 20, borderRadius: 999 }} />
            <div className="dg-skeleton" style={{ width: 34, height: 20, borderRadius: 999 }} />
          </div>
        ))}
      </div>
      <div className="dg-skeleton" style={{ width: 132, height: 36, borderRadius: 4 }} />
    </div>
  );
}

function normalizePrefs(nextPrefs: AllPrefs): AllPrefs {
  const merged = { ...DEFAULT_PREFS, ...nextPrefs };
  return Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((category) => [
        category,
        {
          in_app: merged[category]?.in_app ?? DEFAULT_PREFS[category]?.in_app ?? true,
          email: merged[category]?.email ?? DEFAULT_PREFS[category]?.email ?? false,
        },
      ]),
  ) as AllPrefs;
}

export function NotificationPreferences({
  visibleCategories,
}: { visibleCategories?: string[] } = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<AllPrefs>(normalizePrefs(DEFAULT_PREFS));
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const normalizedPrefs = normalizePrefs(prefs);
  const hasChanges = JSON.stringify(normalizedPrefs) !== JSON.stringify(savedPrefs);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (authLoading) return;
      if (!user || cancelled) {
        if (!cancelled) {
          setLoaded(true);
        }
        return;
      }

      try {
        const data = await fetchNotificationPreferences();

        if (!cancelled) {
          const initialPrefs = normalizePrefs(
            (data.prefs as AllPrefs | undefined) ?? DEFAULT_PREFS,
          );
          setPrefs(initialPrefs);
          setSavedPrefs(initialPrefs);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setLoaded(true);
        }
        toast.error("We couldn't load your notification settings. Refresh and try again.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  async function save() {
    setSaving(true);
    try {
      if (!user) throw new Error("Not authenticated");
      await saveNotificationPreferences(normalizedPrefs);
      setPrefs(normalizedPrefs);
      setSavedPrefs(normalizedPrefs);
      toast.success("Notification preferences saved.");
    } catch {
      toast.error("We couldn't save your notification settings. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(category: string, channel: "in_app" | "email") {
    setPrefs((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category]?.[channel],
      },
    }));
  }

  function discard() {
    setPrefs(savedPrefs);
  }

  if (!loaded) {
    return (
      <NotificationPreferencesSkeleton
        rowCount={visibleCategories?.length ?? Object.keys(CATEGORY_LABELS).length}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p
        style={{ margin: 0, fontSize: "var(--dg-fs-body-sm)", color: "var(--dg-color-text-muted)" }}
      >
        Choose how you want to be notified for each category.
      </p>

      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: preferenceGridTemplate,
          gap: 8,
          alignItems: "center",
          paddingBottom: 8,
          borderBottom: "1px solid var(--dg-color-border-light)",
        }}
      >
        <span
          style={{
            fontSize: "var(--dg-type-table-heading-size)",
            fontWeight: "var(--dg-type-table-heading-weight)",
            color: "var(--dg-type-table-heading-color)",
            letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
            lineHeight: "var(--dg-type-table-heading-line-height)",
          }}
        >
          Category
        </span>
        <span style={{ ...centeredChannelCellStyle, flexDirection: "column", gap: 3 }}>
          <Bell size={13} style={{ color: "var(--dg-color-text-muted)" }} />
          <span
            style={{
              fontSize: "var(--dg-type-table-heading-size)",
              fontWeight: "var(--dg-type-table-heading-weight)",
              color: "var(--dg-type-table-heading-color)",
              letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
              lineHeight: "var(--dg-type-table-heading-line-height)",
            }}
          >
            In-App
          </span>
        </span>
        <span style={{ ...centeredChannelCellStyle, flexDirection: "column", gap: 3 }}>
          <Mail size={13} style={{ color: "var(--dg-color-text-muted)" }} />
          <span
            style={{
              fontSize: "var(--dg-type-table-heading-size)",
              fontWeight: "var(--dg-type-table-heading-weight)",
              color: "var(--dg-type-table-heading-color)",
              letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
              lineHeight: "var(--dg-type-table-heading-line-height)",
            }}
          >
            Email
          </span>
        </span>
      </div>

      {/* Category rows */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {Object.entries(CATEGORY_LABELS)
          .filter(([category]) => !visibleCategories || visibleCategories.includes(category))
          .map(([category, label], index, filtered) => (
            <div
              key={category}
              style={{
                display: "grid",
                gridTemplateColumns: preferenceGridTemplate,
                gap: 8,
                alignItems: "center",
                padding: "12px 0",
                borderBottom:
                  index < filtered.length - 1 ? "1px solid var(--dg-color-border-light)" : "none",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "var(--dg-fs-body-sm)",
                    fontWeight: 500,
                    color: "var(--dg-color-text-primary)",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--dg-color-text-muted)",
                    marginTop: 2,
                  }}
                >
                  {CATEGORY_DESCRIPTIONS[category]}
                </span>
              </div>
              <div style={centeredChannelCellStyle}>
                <Switch
                  checked={prefs[category]?.in_app ?? true}
                  onChange={() => toggle(category, "in_app")}
                  ariaLabel={`${label} in-app notifications`}
                />
              </div>
              <div style={centeredChannelCellStyle}>
                <Switch
                  checked={prefs[category]?.email ?? false}
                  onChange={() => toggle(category, "email")}
                  ariaLabel={`${label} email notifications`}
                />
              </div>
            </div>
          ))}
      </div>

      <EditorActionRow
        secondaryAction={
          hasChanges ? (
            <Button onClick={discard} disabled={saving} className="dg-btn dg-btn-secondary">
              {EDITOR_ACTION_LABELS.discard}
            </Button>
          ) : null
        }
        primaryAction={
          <Button onClick={save} disabled={!hasChanges || saving} className="dg-btn dg-btn-primary">
            <ButtonLoading
              loading={saving}
              spinnerColor="var(--dg-color-text-inverse)"
              spinnerSize={14}
            >
              Save Preferences
            </ButtonLoading>
          </Button>
        }
      />
    </div>
  );
}
