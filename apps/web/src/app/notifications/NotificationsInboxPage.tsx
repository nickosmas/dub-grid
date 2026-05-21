"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Building2,
  Calendar,
  CheckCheck,
  CreditCard,
  Inbox,
  Mail,
  MailOpen,
  Search,
  Shield,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { ProtectedRoute } from "@/components/RouteGuards";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import { useAuth } from "@/components/AuthProvider";
import { useNotificationsRealtime } from "@/hooks/useNotificationsRealtime";
import {
  extractNotificationAction,
  formatNotificationMetadata,
} from "@dubgrid/domain";
import {
  archiveNotifications,
  fetchNotificationFacets,
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsUnread,
  searchNotifications,
  unarchiveNotifications,
  type NotificationCursor,
  type NotificationSearchParams,
} from "@/features/notifications/client";
import type {
  Notification,
  NotificationFacets,
  NotificationPriority,
  NotificationType,
} from "@/types";
import { formatClientErrorMessage } from "@/lib/client-facing";

const PAGE_SIZE = 25;

type ReadFilter = "all" | "unread" | "read";
type CategoryFilter =
  | "all"
  | "schedule"
  | "shift_requests"
  | "membership"
  | "account"
  | "billing"
  | "security"
  | "system";

const CATEGORY_LABEL: Record<CategoryFilter, string> = {
  all: "All notifications",
  schedule: "Schedule",
  shift_requests: "Shift requests",
  membership: "Membership",
  account: "Account",
  billing: "Billing",
  security: "Security",
  system: "System",
};

const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

const PRIORITY_COLOR: Record<NotificationPriority, string> = {
  low: "var(--color-text-faint)",
  normal: "var(--color-text-muted)",
  high: "var(--color-warning)",
  critical: "var(--color-danger)",
};

function NotificationIcon({ type }: { type: NotificationType }) {
  // schedule
  if (
    type === "schedule_published" ||
    type === "shift_change" ||
    type === "recurring_shift_updated" ||
    type === "shift_series_updated" ||
    type === "schedule_note_published" ||
    type === "recurring_schedules_applied"
  ) {
    return <Calendar size={16} />;
  }
  // shift requests
  if (
    type === "shift_request_new" ||
    type === "shift_request_approved" ||
    type === "shift_request_rejected"
  ) {
    return <UserCog size={16} />;
  }
  // membership
  if (
    type === "invitation_received" ||
    type === "invitation_accepted" ||
    type === "invitation_revoked" ||
    type === "invitation_resent" ||
    type === "membership_removed" ||
    type === "admin_permissions_changed"
  ) {
    return <Users size={16} />;
  }
  // account / org
  if (
    type === "employee_created" ||
    type === "employee_status_changed" ||
    type === "employee_profile_changed" ||
    type === "org_settings_changed" ||
    type === "org_suspended" ||
    type === "org_unsuspended"
  ) {
    return <Building2 size={16} />;
  }
  // billing
  if (
    type === "billing_subscription_changed" ||
    type === "billing_payment_failed" ||
    type === "billing_payment_succeeded"
  ) {
    return <CreditCard size={16} />;
  }
  // security (including impersonation)
  if (
    type === "impersonation_start" ||
    type === "impersonation_end" ||
    type === "security_email_changed" ||
    type === "security_password_changed" ||
    type === "security_mfa_changed" ||
    type === "security_new_device" ||
    type === "security_session_revoked"
  ) {
    return <Shield size={16} />;
  }
  return <Bell size={16} />;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface FilterState {
  read: ReadFilter;
  category: CategoryFilter;
  priority: NotificationPriority | "all";
  includeArchived: boolean;
  search: string;
  sort: "asc" | "desc";
}

const DEFAULT_FILTERS: FilterState = {
  read: "all",
  category: "all",
  priority: "all",
  includeArchived: false,
  search: "",
  sort: "desc",
};

// The page heading mirrors the active Status filter so the user always sees
// which section ("Inbox", "Unread", "Archived"...) they're looking at.
function activeViewMeta(filters: FilterState): {
  title: string;
  description: string;
} {
  if (filters.includeArchived) {
    return {
      title: "Archived",
      description: "Notifications you've archived. Restore any to send it back to your inbox.",
    };
  }
  if (filters.read === "unread") {
    return {
      title: "Unread",
      description: "Notifications you haven't opened yet.",
    };
  }
  if (filters.read === "read") {
    return {
      title: "Read",
      description: "Notifications you've already opened.",
    };
  }
  return {
    title: "Inbox",
    description: "Search, filter, and review every notification you've received.",
  };
}

function filtersToQuery(filters: FilterState): NotificationSearchParams {
  return {
    limit: PAGE_SIZE,
    read: filters.read === "all" ? null : filters.read,
    category: filters.category === "all" ? null : filters.category,
    priority: filters.priority === "all" ? null : filters.priority,
    includeArchived: filters.includeArchived,
    search: filters.search.trim() || null,
    sort: filters.sort,
  };
}

function NotificationsInboxPage() {
  return (
    <ProtectedRoute>
      <PageContainer maxWidth={1200}>
        <InboxView />
      </PageContainer>
    </ProtectedRoute>
  );
}

function InboxView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [facets, setFacets] = useState<NotificationFacets | null>(null);
  const [cursor, setCursor] = useState<NotificationCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmingMarkAllRead, setConfirmingMarkAllRead] = useState(false);
  const [realtimeTick, setRealtimeTick] = useState(0);
  const requestSeq = useRef(0);
  const notificationsLengthRef = useRef(0);

  // Track current list length so the realtime handler can decide whether
  // a full re-fetch would clobber the user's "Load more" history.
  useEffect(() => {
    notificationsLengthRef.current = notifications.length;
  }, [notifications]);

  const handleRealtimeChange = useCallback(() => {
    // If the user is still on the first page, a full reload is safe and
    // shows the new notification at the top. If they've loaded more pages,
    // a full reload would discard everything past page 1 — instead just
    // refresh facets so the unread count stays accurate.
    if (notificationsLengthRef.current <= PAGE_SIZE) {
      setRealtimeTick((tick) => tick + 1);
    } else {
      fetchNotificationFacets()
        .then((next) => setFacets(next))
        .catch(() => {});
    }
  }, []);

  useNotificationsRealtime({ userId, onChange: handleRealtimeChange });

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(id);
  }, [filters.search]);

  // Build the effective query (uses debouncedSearch instead of live search)
  const query = useMemo<NotificationSearchParams>(
    () => ({ ...filtersToQuery(filters), search: debouncedSearch || null }),
    [filters, debouncedSearch],
  );

  // Reload when filters/search change, or when a realtime event fires
  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeq.current;
    setLoadingPage(true);
    setError(null);

    Promise.all([
      searchNotifications({ ...query, facets: true }),
      // facets come back inside searchNotifications response when facets:true,
      // but we keep facet display separate so it survives "Load more" fetches.
    ])
      .then(([response]) => {
        if (cancelled || seq !== requestSeq.current) return;
        const items = response.notifications ?? [];
        setNotifications(items);
        setCursor(response.nextCursor);
        setHasMore(items.length >= PAGE_SIZE);
        if (response.facets) setFacets(response.facets);
        setSelectedIds(new Set());
      })
      .catch((err) => {
        if (cancelled || seq !== requestSeq.current) return;
        setError(formatClientErrorMessage(err, "Failed to load notifications"));
      })
      .finally(() => {
        if (!cancelled && seq === requestSeq.current) setLoadingPage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, realtimeTick]);

  const refreshFacets = useCallback(() => {
    fetchNotificationFacets()
      .then((next) => setFacets(next))
      .catch(() => {});
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await searchNotifications({ ...query, cursor });
      const incoming = response.notifications ?? [];
      setNotifications((prev) => [...prev, ...incoming]);
      setCursor(response.nextCursor);
      setHasMore(incoming.length >= PAGE_SIZE);
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "Failed to load more"));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, query]);

  const totalSelected = selectedIds.size;
  const allSelectedIds = useMemo(
    () => notifications.map((n) => n.id),
    [notifications],
  );
  const isAllSelected =
    notifications.length > 0 && totalSelected === notifications.length;

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === notifications.length
        ? new Set()
        : new Set(allSelectedIds),
    );
  }, [allSelectedIds, notifications.length]);

  const applyOptimistic = useCallback(
    (
      ids: string[],
      patch:
        | { readAt?: string | null }
        | { archivedAt?: string | null },
    ) => {
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n)),
      );
    },
    [],
  );

  const removeFromList = useCallback((ids: string[]) => {
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
  }, []);

  const handleBulk = useCallback(
    async (
      action: "read" | "unread" | "archive" | "unarchive",
      ids: string[],
    ) => {
      if (!ids.length) return;
      setBusy(true);
      try {
        if (action === "read") {
          await markNotificationsRead(ids);
          applyOptimistic(ids, { readAt: new Date().toISOString() });
        } else if (action === "unread") {
          await markNotificationsUnread(ids);
          applyOptimistic(ids, { readAt: null });
        } else if (action === "archive") {
          await archiveNotifications(ids);
          if (filters.includeArchived) {
            applyOptimistic(ids, { archivedAt: new Date().toISOString() });
          } else {
            removeFromList(ids);
          }
        } else if (action === "unarchive") {
          await unarchiveNotifications(ids);
          applyOptimistic(ids, { archivedAt: null });
        }
        setSelectedIds(new Set());
        refreshFacets();
        const successMessage =
          action === "read"
            ? "Marked as read"
            : action === "unread"
              ? "Marked as unread"
              : action === "archive"
                ? "Archived"
                : "Restored";
        toast.success(successMessage);
      } catch (err) {
        toast.error(formatClientErrorMessage(err, "Action failed"));
      } finally {
        setBusy(false);
      }
    },
    [applyOptimistic, filters.includeArchived, refreshFacets, removeFromList],
  );

  const handleMarkAllRead = useCallback(async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.readAt ? n : { ...n, readAt: now })),
      );
      refreshFacets();
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "Action failed"));
    } finally {
      setBusy(false);
      setConfirmingMarkAllRead(false);
    }
  }, [refreshFacets]);

  const [detailNotification, setDetailNotification] =
    useState<Notification | null>(null);

  const handleRowClick = useCallback(
    async (n: Notification) => {
      setDetailNotification(n);
      if (!n.readAt) {
        try {
          await markNotificationsRead([n.id]);
          applyOptimistic([n.id], { readAt: new Date().toISOString() });
          refreshFacets();
        } catch {
          // best-effort; the detail panel still opens
        }
      }
    },
    [applyOptimistic, refreshFacets],
  );

  const activeView = activeViewMeta(filters);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "var(--dg-fs-footnote)",
              fontWeight: 700,
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Notifications
          </div>
          <h1
            style={{
              margin: "2px 0 0",
              fontSize: "var(--dg-fs-page-title)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            {activeView.title}
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--color-text-muted)",
              fontSize: "var(--dg-fs-label)",
            }}
          >
            {activeView.description}
          </p>
        </div>
        <button
          type="button"
          className="dg-btn dg-btn-secondary"
          onClick={() => setConfirmingMarkAllRead(true)}
          disabled={busy || (facets?.totalUnread ?? 0) === 0}
        >
          <CheckCheck size={14} style={{ marginRight: 6 }} />
          Mark all read
        </button>
      </header>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <FilterSidebar
          filters={filters}
          facets={facets}
          onChange={setFilters}
        />

        <main style={{ flex: 1, minWidth: 0 }}>
          <Toolbar
            search={filters.search}
            sort={filters.sort}
            isAllSelected={isAllSelected}
            hasNotifications={notifications.length > 0}
            totalSelected={totalSelected}
            busy={busy}
            includeArchived={filters.includeArchived}
            onSearchChange={(value) =>
              setFilters((prev) => ({ ...prev, search: value }))
            }
            onClearSearch={() =>
              setFilters((prev) => ({ ...prev, search: "" }))
            }
            onSortToggle={() =>
              setFilters((prev) => ({
                ...prev,
                sort: prev.sort === "desc" ? "asc" : "desc",
              }))
            }
            onToggleSelectAll={handleToggleSelectAll}
            onBulk={handleBulk}
            selectedIds={[...selectedIds]}
          />

          {loadingPage ? (
            <ListPlaceholder />
          ) : error ? (
            <EmptyState
              icon={<Bell size={28} />}
              heading="Couldn't load notifications"
              description={error}
            />
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<Inbox size={28} />}
              heading="No notifications"
              description={
                debouncedSearch ||
                filters.read !== "all" ||
                filters.category !== "all" ||
                filters.priority !== "all" ||
                filters.includeArchived
                  ? "Try clearing or loosening your filters."
                  : "You're all caught up."
              }
            />
          ) : (
            <ul
              role="list"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--dg-radius-lg)",
                overflow: "hidden",
              }}
            >
              {notifications.map((n, idx) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  isFirst={idx === 0}
                  isLast={idx === notifications.length - 1}
                  selected={selectedIds.has(n.id)}
                  onToggleSelect={() => handleToggleSelect(n.id)}
                  onClick={() => handleRowClick(n)}
                  onArchive={() => handleBulk("archive", [n.id])}
                  onMarkUnread={() => handleBulk("unread", [n.id])}
                  onMarkRead={() => handleBulk("read", [n.id])}
                  onUnarchive={() => handleBulk("unarchive", [n.id])}
                />
              ))}
            </ul>
          )}

          {hasMore && notifications.length > 0 && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </main>
      </div>

      {detailNotification && (
        <NotificationDetailModal
          notification={detailNotification}
          onClose={() => setDetailNotification(null)}
        />
      )}

      {confirmingMarkAllRead && (
        <ConfirmDialog
          title="Mark all read?"
          message={
            (facets?.totalUnread ?? 0) === 1
              ? "This marks your one unread notification as read."
              : `This marks all ${facets?.totalUnread ?? 0} unread notifications as read.`
          }
          confirmLabel="Mark all read"
          variant="info"
          onConfirm={handleMarkAllRead}
          onCancel={() => setConfirmingMarkAllRead(false)}
          isLoading={busy}
        />
      )}
    </div>
  );
}

interface NotificationDetailModalProps {
  notification: Notification;
  onClose: () => void;
}

function formatFullTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationDetailModal({
  notification,
  onClose,
}: NotificationDetailModalProps) {
  const entries = useMemo(
    () => formatNotificationMetadata(notification.metadata),
    [notification.metadata],
  );
  const action = useMemo(
    () => extractNotificationAction(notification.metadata),
    [notification.metadata],
  );

  return (
    <Modal title={notification.title} onClose={onClose} headerSafe>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-muted)",
          }}
        >
          {formatFullTimestamp(notification.createdAt)}
          {notification.channel === "email" ? " • Sent via email" : ""}
        </span>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-primary)",
            fontSize: "var(--dg-fs-body)",
            lineHeight: 1.5,
          }}
        >
          {notification.message}
        </p>

        {entries.length > 0 && (
          <div
            style={{
              border: "1px solid var(--color-border-light)",
              borderRadius: "var(--dg-radius-md)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "var(--color-bg-secondary)",
            }}
          >
            <span
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Details
            </span>
            {entries.map((entry) => (
              <div
                key={entry.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
                  gap: 12,
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {entry.label}
                </span>
                <span
                  style={{
                    fontSize: "var(--dg-fs-label)",
                    color: "var(--color-text-primary)",
                    wordBreak: "break-word",
                  }}
                >
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {action && (
          <Link
            href={action.href}
            className="dg-btn dg-btn-primary"
            onClick={onClose}
            style={{ alignSelf: "flex-start" }}
          >
            {action.label}
          </Link>
        )}
      </div>
    </Modal>
  );
}

interface FilterSidebarProps {
  filters: FilterState;
  facets: NotificationFacets | null;
  onChange: (next: FilterState) => void;
}

function FilterSidebar({ filters, facets, onChange }: FilterSidebarProps) {
  // Status chips must set `read` and `includeArchived` in a single update.
  // Calling two setters that each spread the same stale `filters` closure
  // makes the second overwrite the first, silently dropping one field.
  const setStatus = (read: ReadFilter, includeArchived: boolean) =>
    onChange({ ...filters, read, includeArchived });
  const setCategory = (category: CategoryFilter) =>
    onChange({ ...filters, category });
  const setPriority = (priority: NotificationPriority | "all") =>
    onChange({ ...filters, priority });

  const totalUnread = facets?.totalUnread ?? 0;
  const totalArchived = facets?.totalArchived ?? 0;

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        position: "sticky",
        // Park below the sticky app header instead of scrolling under it,
        // which would hide the top status links.
        top: "calc(var(--app-shell-header-h, 0px) + 16px)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <FilterGroup label="Status">
        <FilterChip
          active={filters.read === "all" && !filters.includeArchived}
          onClick={() => setStatus("all", false)}
          icon={<Inbox size={14} />}
          label="Inbox"
        />
        <FilterChip
          active={filters.read === "unread" && !filters.includeArchived}
          onClick={() => setStatus("unread", false)}
          icon={<Mail size={14} />}
          label="Unread"
          count={totalUnread || undefined}
        />
        <FilterChip
          active={filters.read === "read" && !filters.includeArchived}
          onClick={() => setStatus("read", false)}
          icon={<MailOpen size={14} />}
          label="Read"
        />
        <FilterChip
          active={filters.includeArchived}
          onClick={() => setStatus("all", true)}
          icon={<Archive size={14} />}
          label="Archived"
          count={totalArchived || undefined}
        />
      </FilterGroup>

      <FilterGroup label="Category">
        {(Object.keys(CATEGORY_LABEL) as CategoryFilter[]).map((cat) => (
          <FilterChip
            key={cat}
            active={filters.category === cat}
            onClick={() => setCategory(cat)}
            label={CATEGORY_LABEL[cat]}
            count={
              cat === "all"
                ? undefined
                : (facets?.byCategory?.[cat] as number | undefined) || undefined
            }
          />
        ))}
      </FilterGroup>

      <FilterGroup label="Priority">
        <FilterChip
          active={filters.priority === "all"}
          onClick={() => setPriority("all")}
          label="Any priority"
        />
        {(Object.keys(PRIORITY_LABEL) as NotificationPriority[]).map((p) => (
          <FilterChip
            key={p}
            active={filters.priority === p}
            onClick={() => setPriority(p)}
            label={PRIORITY_LABEL[p]}
            badgeColor={PRIORITY_COLOR[p]}
            count={(facets?.byPriority?.[p] as number | undefined) || undefined}
          />
        ))}
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "var(--dg-fs-footnote)",
          fontWeight: 700,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 8,
          paddingLeft: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {children}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
  badgeColor,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  badgeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: active ? "var(--color-info-bg)" : "transparent",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: "var(--dg-fs-label)",
        color: active ? "var(--color-info-text)" : "var(--color-text-primary)",
        fontWeight: active ? 600 : 500,
        fontFamily: "inherit",
        textAlign: "left",
        width: "100%",
      }}
    >
      {badgeColor && (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: badgeColor,
            flexShrink: 0,
          }}
        />
      )}
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface ToolbarProps {
  search: string;
  sort: "asc" | "desc";
  isAllSelected: boolean;
  hasNotifications: boolean;
  totalSelected: number;
  selectedIds: string[];
  busy: boolean;
  includeArchived: boolean;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSortToggle: () => void;
  onToggleSelectAll: () => void;
  onBulk: (
    action: "read" | "unread" | "archive" | "unarchive",
    ids: string[],
  ) => void;
}

function Toolbar({
  search,
  sort,
  isAllSelected,
  hasNotifications,
  totalSelected,
  selectedIds,
  busy,
  includeArchived,
  onSearchChange,
  onClearSearch,
  onSortToggle,
  onToggleSelectAll,
  onBulk,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <label
        htmlFor="notifications-select-all"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "0 6px",
          color: "var(--color-text-muted)",
          fontSize: "var(--dg-fs-label)",
          cursor: hasNotifications ? "pointer" : "default",
        }}
      >
        <input
          id="notifications-select-all"
          type="checkbox"
          checked={isAllSelected}
          onChange={onToggleSelectAll}
          disabled={!hasNotifications}
        />
        {totalSelected > 0
          ? `${totalSelected} selected`
          : "Select"}
      </label>

      <div
        style={{
          position: "relative",
          flex: 1,
          minWidth: 220,
        }}
      >
        <Search
          size={14}
          style={{
            position: "absolute",
            top: "50%",
            left: 10,
            transform: "translateY(-50%)",
            color: "var(--color-text-muted)",
            pointerEvents: "none",
          }}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title or message…"
          aria-label="Search notifications"
          className="dg-input"
          style={{ paddingLeft: 32, paddingRight: search ? 32 : 12 }}
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClearSearch}
            style={{
              position: "absolute",
              top: "50%",
              right: 6,
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              padding: 4,
              display: "inline-flex",
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <button
        type="button"
        className="dg-btn dg-btn-ghost"
        onClick={onSortToggle}
        aria-label={`Sort ${sort === "desc" ? "newest" : "oldest"} first`}
      >
        {sort === "desc" ? "Newest first" : "Oldest first"}
      </button>

      {totalSelected > 0 && (
        <BulkActions
          selectedIds={selectedIds}
          busy={busy}
          includeArchived={includeArchived}
          onBulk={onBulk}
        />
      )}
    </div>
  );
}

function BulkActions({
  selectedIds,
  busy,
  includeArchived,
  onBulk,
}: {
  selectedIds: string[];
  busy: boolean;
  includeArchived: boolean;
  onBulk: (
    action: "read" | "unread" | "archive" | "unarchive",
    ids: string[],
  ) => void;
}) {
  const buttonStyle: CSSProperties = { gap: 4 };
  return (
    <div
      role="group"
      aria-label="Bulk actions"
      style={{
        display: "inline-flex",
        gap: 6,
        padding: "4px 6px",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-btn-radius)",
        background: "var(--color-bg-secondary)",
      }}
    >
      <button
        type="button"
        className="dg-btn dg-btn-ghost"
        onClick={() => onBulk("read", selectedIds)}
        disabled={busy}
        style={buttonStyle}
      >
        <CheckCheck size={14} /> Read
      </button>
      <button
        type="button"
        className="dg-btn dg-btn-ghost"
        onClick={() => onBulk("unread", selectedIds)}
        disabled={busy}
        style={buttonStyle}
      >
        <Mail size={14} /> Unread
      </button>
      {includeArchived ? (
        <button
          type="button"
          className="dg-btn dg-btn-ghost"
          onClick={() => onBulk("unarchive", selectedIds)}
          disabled={busy}
          style={buttonStyle}
        >
          <ArchiveRestore size={14} /> Unarchive
        </button>
      ) : (
        <button
          type="button"
          className="dg-btn dg-btn-ghost"
          onClick={() => onBulk("archive", selectedIds)}
          disabled={busy}
          style={buttonStyle}
        >
          <Archive size={14} /> Archive
        </button>
      )}
    </div>
  );
}

interface NotificationRowProps {
  notification: Notification;
  isFirst: boolean;
  isLast: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}

function NotificationRow({
  notification,
  isLast,
  selected,
  onToggleSelect,
  onClick,
  onArchive,
  onUnarchive,
  onMarkRead,
  onMarkUnread,
}: NotificationRowProps) {
  const isUnread = !notification.readAt;
  const isArchived = !!notification.archivedAt;

  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto auto 1fr auto",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 16px",
    background: selected
      ? "var(--color-info-bg)"
      : isUnread
        ? "var(--color-info-bg)"
        : "var(--color-surface)",
    borderBottom: isLast ? "none" : "1px solid var(--color-border-light)",
    transition: "background 120ms ease",
  };

  return (
    <li style={rowStyle}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select notification: ${notification.title}`}
        style={{ marginTop: 6 }}
      />
      <div
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: isUnread
            ? "var(--color-info-bg)"
            : "var(--color-bg-secondary)",
          color: isUnread ? "var(--color-info)" : "var(--color-text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <NotificationIcon type={notification.type} />
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label={`${notification.title}: ${notification.message}${
          isUnread ? " (unread)" : ""
        }`}
        style={{
          textAlign: "left",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: "inherit",
          color: "inherit",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {notification.priority !== "normal" && notification.priority !== "low" && (
            <span
              aria-label={`Priority ${notification.priority}`}
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 700,
                textTransform: "uppercase",
                color: PRIORITY_COLOR[notification.priority],
                letterSpacing: 0.4,
              }}
            >
              {notification.priority}
            </span>
          )}
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: isUnread ? 700 : 600,
              color: "var(--color-text-primary)",
            }}
          >
            {notification.title}
          </span>
          {(() => {
            const groupCount =
              typeof notification.metadata?.groupCount === "number"
                ? (notification.metadata.groupCount as number)
                : 1;
            if (groupCount <= 1) return null;
            return (
              <span
                title={`Part of ${groupCount} related notifications`}
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  color: "var(--color-text-muted)",
                  background: "var(--color-bg-secondary)",
                  borderRadius: 999,
                  padding: "1px 8px",
                }}
              >
                ×{groupCount}
              </span>
            );
          })()}
          {isUnread && (
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-info)",
                flexShrink: 0,
              }}
            />
          )}
        </div>
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-muted)",
            lineHeight: 1.5,
          }}
        >
          {notification.message}
        </span>
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--color-text-subtle)",
          }}
        >
          {formatRelativeTime(notification.createdAt)}
          {notification.channel === "email" ? " • Sent via email" : ""}
        </span>
      </button>
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {(() => {
          const actionUrl =
            typeof notification.metadata?.actionUrl === "string"
              ? (notification.metadata.actionUrl as string)
              : null;
          const actionLabel =
            typeof notification.metadata?.actionLabel === "string"
              ? (notification.metadata.actionLabel as string)
              : null;
          if (!actionUrl || !actionLabel) return null;
          return (
            <Link
              href={actionUrl}
              className="dg-btn dg-btn-secondary"
              onClick={onClick}
              style={{ whiteSpace: "nowrap" }}
            >
              {actionLabel}
            </Link>
          );
        })()}
        <button
          type="button"
          aria-label={isUnread ? "Mark as read" : "Mark as unread"}
          className="dg-btn dg-btn-ghost"
          onClick={isUnread ? onMarkRead : onMarkUnread}
          title={isUnread ? "Mark as read" : "Mark as unread"}
        >
          {isUnread ? <MailOpen size={14} /> : <Mail size={14} />}
        </button>
        {isArchived ? (
          <button
            type="button"
            aria-label="Restore from archive"
            className="dg-btn dg-btn-ghost"
            onClick={onUnarchive}
            title="Restore from archive"
          >
            <ArchiveRestore size={14} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Archive"
            className="dg-btn dg-btn-ghost"
            onClick={onArchive}
            title="Archive"
          >
            <Archive size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

function ListPlaceholder() {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--dg-radius-lg)",
        padding: 0,
        overflow: "hidden",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 12,
            padding: "16px",
            borderBottom:
              i < 3 ? "1px solid var(--color-border-light)" : "none",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--color-bg-secondary)",
            }}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                width: "40%",
                height: 12,
                background: "var(--color-bg-secondary)",
                borderRadius: 4,
              }}
            />
            <div
              style={{
                width: "70%",
                height: 10,
                background: "var(--color-bg-secondary)",
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default NotificationsInboxPage;
