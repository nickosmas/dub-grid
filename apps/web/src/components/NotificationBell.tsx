"use client";
import { User } from "lucide-react";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/Button";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { NumericBadge } from "@/components/ui/numeric-badge";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/features/notifications/client";
import { useAuth } from "@/components/AuthProvider";
import { usePermissions } from "@/hooks";
import { useNotificationsRealtime } from "@/hooks/useNotificationsRealtime";
import { useAccountRealtimeInvalidation } from "@/hooks/useAccountRealtimeInvalidation";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/utils";
import type { Notification } from "@/types";

function CalendarIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function UserIcon() {
  return <User size={16} />;
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="9" y1="22" x2="9" y2="18" />
      <line x1="15" y1="22" x2="15" y2="18" />
      <line x1="8" y1="6" x2="10" y2="6" />
      <line x1="14" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="10" y2="14" />
      <line x1="14" y1="14" x2="16" y2="14" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function NotificationIcon({ type }: { type: string }) {
  if (
    type === "shift_change" ||
    type === "schedule_published" ||
    type === "recurring_shift_updated" ||
    type === "shift_series_updated" ||
    type === "schedule_note_published" ||
    type === "recurring_schedules_applied"
  ) {
    return <CalendarIcon />;
  }
  if (
    type === "shift_request_new" ||
    type === "shift_request_approved" ||
    type === "shift_request_rejected" ||
    type === "invitation_received" ||
    type === "invitation_accepted" ||
    type === "invitation_revoked" ||
    type === "invitation_resent" ||
    type === "membership_removed" ||
    type === "admin_permissions_changed"
  ) {
    return <UserIcon />;
  }
  if (
    type === "billing_subscription_changed" ||
    type === "billing_payment_failed" ||
    type === "billing_payment_succeeded" ||
    type === "org_subscription_converted" ||
    type === "org_subscription_canceled" ||
    type === "org_payment_failed"
  ) {
    return <CreditCardIcon />;
  }
  if (
    type === "employee_created" ||
    type === "employee_status_changed" ||
    type === "employee_profile_changed" ||
    type === "org_settings_changed" ||
    type === "org_suspended" ||
    type === "org_unsuspended" ||
    type === "org_created" ||
    type === "org_trial_started" ||
    type === "org_archived" ||
    type === "org_restored"
  ) {
    return <BuildingIcon />;
  }
  if (
    type === "impersonation_start" ||
    type === "impersonation_end" ||
    type === "security_email_changed" ||
    type === "security_password_changed" ||
    type === "security_mfa_changed" ||
    type === "security_new_device" ||
    type === "security_session_revoked"
  ) {
    return <ShieldIcon />;
  }
  return <BellIcon />;
}

/**
 * @param onViewAll Optional override for the "View all" footer. When provided,
 *   it replaces the default `/alerts` link, e.g. so the gridmaster portal
 *   can route to its own in-portal feed view instead of ejecting to the app.
 */
export default function NotificationBell({
  onViewAll,
}: {
  onViewAll?: () => void;
} = {}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Alerts are org-filtered server-side, so the org is part of this cache's
  // identity, not just of the request.
  const { orgId } = usePermissions();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmingMarkAllRead, setConfirmingMarkAllRead] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: userId
      ? queryKeys.notifications.unreadCount(userId, orgId)
      : ["notifications", "anon", "unreadCount"],
    queryFn: fetchUnreadNotificationCount,
    enabled: !!userId,
    // No refetchInterval. useNotificationsRealtime (mounted just below)
    // invalidates the ["notifications", userId] prefix on every CDC event for
    // this user, which covers this key, and re-invalidates after a channel
    // error resolves — so a 60s poll on every route was re-asking a question
    // realtime had already answered.
    //
    // Focus refetch stays as the backstop realtime cannot give: a socket that
    // died quietly across a laptop sleep never raises CHANNEL_ERROR.
    refetchOnWindowFocus: true,
  });

  const { data: notifications = [], isFetching: loading } = useQuery<Notification[]>({
    queryKey: userId
      ? queryKeys.notifications.recent(userId, orgId)
      : ["notifications", "anon", "recent"],
    queryFn: () => fetchNotifications({ limit: 20 }),
    enabled: open && !!userId,
  });

  useNotificationsRealtime({ userId });
  useAccountRealtimeInvalidation({ userId, queryClient });

  // Close on outside click or Escape key
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        const btn = ref.current?.querySelector("button");
        btn?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleToggle() {
    setOpen((prev) => !prev);
  }

  const [optimisticallyRead, setOptimisticallyRead] = useState<Set<string>>(new Set());

  const invalidateAll = useCallback(() => {
    if (!userId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.notifications.all(userId),
    });
  }, [queryClient, userId]);

  // A row is a whole block of content, so it opts out of the button spinner.
  // That left the unread tint as the only signal, and it waited on both the
  // mutation and the refetch behind it. Clearing it here answers the click now
  // and rolls back if the write fails.
  async function handleMarkRead(id: string) {
    setOptimisticallyRead((prev) => new Set(prev).add(id));
    try {
      await markNotificationRead(id);
      invalidateAll();
    } catch (err) {
      setOptimisticallyRead((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error(formatClientErrorMessage(err, "Couldn't update notification"));
    }
  }

  async function handleConfirmMarkAllRead() {
    setMarkingAllRead(true);
    try {
      await markAllNotificationsRead();
      invalidateAll();
      toast.success("All alerts marked as read");
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "Couldn't mark all read"));
    } finally {
      setMarkingAllRead(false);
      setConfirmingMarkAllRead(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <Button
        onClick={handleToggle}
        aria-label={`Alerts${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          background: open ? "var(--dg-color-bg-secondary)" : "transparent",
          border: "1px solid " + (open ? "var(--dg-color-border)" : "transparent"),
          borderRadius: "var(--dg-btn-radius)",
          cursor: "pointer",
          position: "relative",
          color: "var(--dg-color-text-muted)",
          transition: "background 150ms ease, border-color 150ms ease",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = "var(--dg-color-bg-secondary)";
            e.currentTarget.style.borderColor = "var(--dg-color-border)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <NumericBadge
          label={`${unreadCount} unread alerts`}
          size="sm"
          tone="danger"
          count={unreadCount}
          max={9}
          style={{ position: "absolute", top: -1, right: 1, zIndex: 1 }}
        />
      </Button>

      {open && (
        <div
          role="region"
          aria-label="Alerts"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 360,
            maxHeight: 440,
            background: "var(--dg-color-surface)",
            border: "1px solid var(--dg-color-border)",
            borderRadius: "var(--dg-radius-lg)",
            boxShadow: "var(--shadow-menu)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid var(--dg-color-border-light)",
            }}
          >
            <span
              style={{
                fontSize: "var(--dg-fs-label)",
                fontWeight: 700,
                color: "var(--dg-color-text-primary)",
              }}
            >
              Alerts
            </span>
            {unreadCount > 0 && (
              <Button
                onClick={() => setConfirmingMarkAllRead(true)}
                aria-label="Mark all alerts as read"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 600,
                  color: "var(--dg-color-link)",
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                Mark all read
              </Button>
            )}
          </div>

          {/* List */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {loading ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--dg-color-text-muted)",
                  fontSize: "var(--dg-fs-label)",
                }}
              >
                Loading
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: "var(--dg-color-text-muted)",
                  fontSize: "var(--dg-fs-label)",
                }}
              >
                No alerts
              </div>
            ) : (
              notifications.map((n) => {
                const isUnread = !n.readAt && !optimisticallyRead.has(n.id);
                return (
                  <Button
                    key={n.id}
                    onClick={() => {
                      if (isUnread) return handleMarkRead(n.id);
                    }}
                    spinner={false}
                    aria-label={`${n.title}: ${n.message}${isUnread ? " (unread, click to mark as read)" : ""}`}
                    style={{
                      display: "flex",
                      gap: 12,
                      width: "100%",
                      padding: "12px 16px",
                      background: isUnread ? "var(--dg-color-info-bg)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--dg-color-border-light)",
                      cursor: isUnread ? "pointer" : "default",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "background 150ms ease",
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--dg-color-bg-secondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isUnread ? "var(--dg-color-info)" : "var(--dg-color-text-muted)",
                      }}
                    >
                      <NotificationIcon type={n.type} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            fontSize: "var(--dg-fs-caption)",
                            fontWeight: isUnread ? 700 : 600,
                            color: "var(--dg-color-text-primary)",
                          }}
                        >
                          {n.title}
                        </span>
                        {isUnread && (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "var(--dg-color-info)",
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-text-muted)",
                          marginTop: 2,
                          lineHeight: 1.4,
                        }}
                      >
                        {n.message}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-text-subtle)",
                          marginTop: 4,
                        }}
                      >
                        {formatRelativeTime(n.createdAt)}
                      </div>
                    </div>
                  </Button>
                );
              })
            )}
          </div>

          {/* Footer: view all */}
          {onViewAll ? (
            <Button
              type="button"
              onClick={() => {
                setOpen(false);
                onViewAll();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "10px 16px",
                border: "none",
                borderTop: "1px solid var(--dg-color-border-light)",
                background: "var(--dg-color-surface)",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                color: "var(--dg-color-link)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              View all alerts
            </Button>
          ) : (
            <Link
              href="/alerts"
              onClick={() => setOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px 16px",
                borderTop: "1px solid var(--dg-color-border-light)",
                background: "var(--dg-color-surface)",
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                color: "var(--dg-color-link)",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              View all alerts
            </Link>
          )}
          <ScrollOverflowCue />
        </div>
      )}
      {confirmingMarkAllRead && (
        <ConfirmDialog
          title="Mark all read?"
          message={
            unreadCount === 1
              ? "This marks your one unread alert as read."
              : `This marks all ${unreadCount} unread alerts as read.`
          }
          confirmLabel="Mark all read"
          variant="info"
          onConfirm={handleConfirmMarkAllRead}
          onCancel={() => setConfirmingMarkAllRead(false)}
          isLoading={markingAllRead}
        />
      )}
    </div>
  );
}
