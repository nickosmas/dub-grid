"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { NumericBadge } from "@/components/ui/numeric-badge";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Building2,
  Calendar,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Inbox,
  Mail,
  MailOpen,
  Search,
  Shield,
  UserCog,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/RouteGuards";
import { Button } from "@/components/Button";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import CustomSelect from "@/components/CustomSelect";
import { CloseButton } from "@/components/ui/CloseButton";
import { useAuth } from "@/components/AuthProvider";
import { usePermissions, type Permissions } from "@/hooks";
import { useNotificationsRealtime } from "@/hooks/useNotificationsRealtime";
import { queryKeys } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/utils";
import {
  audienceForViewer,
  formatNotificationMetadata,
  resolveAlertDestination,
  type Audience,
} from "@dubgrid/domain";
import {
  archiveNotifications,
  fetchNotificationById,
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
import { ButtonLoading } from "@/components/ButtonSpinner";

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
  | "system"
  | "platform";

const CATEGORY_LABEL: Record<CategoryFilter, string> = {
  all: "All categories",
  schedule: "Schedule",
  shift_requests: "Shift requests",
  membership: "Membership",
  account: "Account",
  billing: "Billing",
  security: "Security",
  system: "System",
  platform: "Platform",
};

// Categories that should only appear in the sidebar for users with the matching
// access tier. Billing is super_admin-and-above (regular members never see org
// billing events); platform is gridmaster-only (org-lifecycle notifications
// fired by the notify_gridmasters_of_org_event trigger).
const CATEGORY_VISIBLE: Partial<Record<CategoryFilter, (perms: Permissions) => boolean>> = {
  billing: (perms) => perms.isSuperAdmin || perms.isGridmaster,
  platform: (perms) => perms.isGridmaster,
};

const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

const PRIORITY_COLOR: Record<NotificationPriority, string> = {
  low: "var(--dg-color-text-faint)",
  normal: "var(--dg-color-text-muted)",
  high: "var(--dg-color-warning)",
  critical: "var(--dg-color-danger)",
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
  // account / org (+ platform org lifecycle)
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
    return <Building2 size={16} />;
  }
  // billing (+ platform subscription lifecycle)
  if (
    type === "billing_subscription_changed" ||
    type === "billing_payment_failed" ||
    type === "billing_payment_succeeded" ||
    type === "org_subscription_converted" ||
    type === "org_subscription_canceled" ||
    type === "org_payment_failed"
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

function AlertsInboxPage() {
  const router = useRouter();
  const pathname = usePathname();
  const openNotificationId = useSearchParams().get("open");
  // Clearing the param once the alert is open means closing the modal does
  // not leave a stale deep link, and re-opening the same alert from the bell
  // is a fresh change of the prop.
  const clearOpenParam = useCallback(
    () => router.replace(pathname, { scroll: false }),
    [router, pathname],
  );
  return (
    <ProtectedRoute>
      <PageContainer maxWidth={1200}>
        <InboxView
          openNotificationId={openNotificationId}
          onOpenHandled={clearOpenParam}
          navigate={(href) => router.push(href)}
          prefetch={(href) => router.prefetch(href)}
        />
      </PageContainer>
    </ProtectedRoute>
  );
}

interface InboxViewProps {
  /** An alert to open on arrival, e.g. from the header bell. */
  openNotificationId?: string | null;
  /** Called once the requested alert is open (or reported missing). */
  onOpenHandled?: () => void;
  /** Goes to an alert's subject; the page and the portal supply the router. */
  navigate?: (href: string) => void;
  /**
   * Warms an alert's subject before the click. Rows are buttons, not links,
   * so nothing about the destination route loads until they call this on
   * hover or focus; without it every click paid for the route's code and
   * data after the fact, which read as lag.
   */
  prefetch?: (href: string) => void;
}

export function InboxView({
  openNotificationId = null,
  onOpenHandled,
  navigate,
  prefetch,
}: InboxViewProps = {}) {
  const { user } = useAuth();
  const perms = usePermissions();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const visibleCategories = useMemo<CategoryFilter[]>(
    () =>
      (Object.keys(CATEGORY_LABEL) as CategoryFilter[]).filter((cat) => {
        const gate = CATEGORY_VISIBLE[cat];
        return gate ? gate(perms) : true;
      }),
    [perms],
  );

  // If the user is parked on a category they no longer have access to (e.g.
  // a realtime role change demoted them), fall back to "All notifications".
  useEffect(() => {
    if (!visibleCategories.includes(filters.category)) {
      setFilters((prev) => ({ ...prev, category: "all" }));
    }
  }, [visibleCategories, filters.category]);
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [facets, setFacets] = useState<NotificationFacets | null>(null);
  const [cursor, setCursor] = useState<NotificationCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingPage, setLoadingPage] = useState(true);
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
        setError(formatClientErrorMessage(err, "Failed to load alerts"));
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

  // Realtime postgres_changes events are subject to delivery latency and the
  // occasional dropped connection. Sidebar bell mark-read also doesn't fire a
  // realtime event for THIS tab if the same session triggered the write.
  // Subscribe to the React Query cache so any notifications-key invalidation
  // (bell mark-read, realtime fan-in, mobile cross-device push) refreshes the
  // chip counts here too.
  useEffect(() => {
    if (!userId) return;
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      const action = (event as { action?: { type?: string } }).action;
      if (action?.type !== "invalidate") return;
      const key = event.query.queryKey;
      if (!Array.isArray(key) || key[0] !== "notifications" || key[1] !== userId) {
        return;
      }
      refreshFacets();
    });
    return unsubscribe;
  }, [queryClient, userId, refreshFacets]);

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
  const allSelectedIds = useMemo(() => notifications.map((n) => n.id), [notifications]);
  const isAllSelected = notifications.length > 0 && totalSelected === notifications.length;

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
      prev.size === notifications.length ? new Set() : new Set(allSelectedIds),
    );
  }, [allSelectedIds, notifications.length]);

  const applyOptimistic = useCallback(
    (ids: string[], patch: { readAt?: string | null } | { archivedAt?: string | null }) => {
      setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n)));
    },
    [],
  );

  const removeFromList = useCallback((ids: string[]) => {
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
  }, []);

  const handleBulk = useCallback(
    async (action: "read" | "unread" | "archive" | "unarchive", ids: string[]) => {
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
      setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      refreshFacets();
      toast.success("All alerts marked as read");
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "Action failed"));
    } finally {
      setBusy(false);
      setConfirmingMarkAllRead(false);
    }
  }, [refreshFacets]);

  const audience = audienceForViewer(perms);
  // A platform row (a gridmaster's) has nowhere to go; its details unfold in place.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const markReadInPlace = useCallback(
    async (n: Notification) => {
      if (n.readAt) return;
      applyOptimistic([n.id], { readAt: new Date().toISOString() });
      try {
        await markNotificationsRead([n.id]);
        refreshFacets();
        // The header bell caches its own list and count; realtime would
        // catch up, but the badge should drop as soon as the alert is read.
        if (userId) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(userId) });
        }
      } catch {
        applyOptimistic([n.id], { readAt: null });
      }
    },
    [applyOptimistic, refreshFacets, queryClient, userId],
  );

  const handleRowIntent = useCallback(
    (n: Notification) => {
      if (!prefetch) return;
      const destination = resolveAlertDestination(n);
      if (destination) prefetch(destination.href);
    },
    [prefetch],
  );

  const handleRowClick = useCallback(
    (n: Notification) => {
      void markReadInPlace(n);
      const destination = resolveAlertDestination(n);
      if (destination && navigate) {
        navigate(destination.href);
        return;
      }
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(n.id)) next.delete(n.id);
        else next.add(n.id);
        return next;
      });
    },
    [markReadInPlace, navigate],
  );

  // Open the alert a deep link or the bell asked for. The first page may not
  // hold it (filters, pagination, archived), so fall back to a lookup by id.
  // The collaborators live in a ref so a re-render mid-lookup (a realtime
  // reload, the portal passing a fresh callback) cannot cancel or repeat it.
  const openCollaboratorsRef = useRef({ notifications, handleRowClick, onOpenHandled });
  useEffect(() => {
    openCollaboratorsRef.current = { notifications, handleRowClick, onOpenHandled };
  });
  const handledOpenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openNotificationId) {
      handledOpenIdRef.current = null;
      return;
    }
    if (loadingPage || handledOpenIdRef.current === openNotificationId) return;
    handledOpenIdRef.current = openNotificationId;
    const {
      notifications: loaded,
      handleRowClick: open,
      onOpenHandled: done,
    } = openCollaboratorsRef.current;
    const found = loaded.find((n) => n.id === openNotificationId);
    (found ? Promise.resolve(found) : fetchNotificationById(openNotificationId))
      .then((n) => {
        if (n) open(n);
        else toast.error("That alert is no longer available");
      })
      .catch(() => toast.error("That alert is no longer available"))
      .finally(() => done?.());
  }, [openNotificationId, loadingPage]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: "var(--dg-type-page-title-size)",
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
          }}
        >
          Alerts
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-label)",
          }}
        >
          Everything that needs your attention, newest first. Open one to go to what it is about.
        </p>
      </header>

      <main style={{ minWidth: 0 }}>
        <Toolbar
          search={filters.search}
          sort={filters.sort}
          read={filters.read}
          isAllSelected={isAllSelected}
          hasNotifications={notifications.length > 0}
          totalSelected={totalSelected}
          busy={busy}
          includeArchived={filters.includeArchived}
          category={filters.category}
          priority={filters.priority}
          categories={visibleCategories}
          facets={facets}
          // Switching sections never carries a read filter over from the last one.
          onSectionChange={(includeArchived) =>
            setFilters((prev) => ({ ...prev, read: "all", includeArchived }))
          }
          onReadChange={(value) => setFilters((prev) => ({ ...prev, read: value }))}
          canMarkAllRead={!busy && (facets?.totalUnread ?? 0) > 0}
          onMarkAllRead={() => setConfirmingMarkAllRead(true)}
          onSearchChange={(value) => setFilters((prev) => ({ ...prev, search: value }))}
          onClearSearch={() => setFilters((prev) => ({ ...prev, search: "" }))}
          onSortToggle={() =>
            setFilters((prev) => ({
              ...prev,
              sort: prev.sort === "desc" ? "asc" : "desc",
            }))
          }
          onCategoryChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
          onPriorityChange={(value) => setFilters((prev) => ({ ...prev, priority: value }))}
          onToggleSelectAll={handleToggleSelectAll}
          onBulk={handleBulk}
          selectedIds={[...selectedIds]}
        />

        {loadingPage ? (
          <ListPlaceholder />
        ) : error ? (
          <EmptyState
            icon={<Bell size={28} />}
            heading="Couldn't load alerts"
            description={error}
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Inbox size={28} />}
            heading="No alerts"
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
              background: "var(--dg-color-surface)",
              border: "1px solid var(--dg-color-border)",
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
                audience={audience}
                expanded={expandedIds.has(n.id)}
                onToggleSelect={() => handleToggleSelect(n.id)}
                onClick={() => handleRowClick(n)}
                onIntent={() => handleRowIntent(n)}
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
            <Button
              type="button"
              className="dg-btn dg-btn-secondary"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              <ButtonLoading loading={loadingMore}>Load more</ButtonLoading>
            </Button>
          </div>
        )}
      </main>

      {confirmingMarkAllRead && (
        <ConfirmDialog
          title="Mark all read?"
          message={
            (facets?.totalUnread ?? 0) === 1
              ? "This marks your one unread alert as read."
              : `This marks all ${facets?.totalUnread ?? 0} unread alerts as read.`
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

interface Segment<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

/** A row of exclusive choices in the toolbar, in the shared tab-shell look. */
function Segments<T extends string>({
  label,
  value,
  segments,
  onChange,
}: {
  label: string;
  value: T;
  segments: Segment<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="dg-span-tabs dg-span-tabs--light"
      // `.dg-span-tabs` is unlayered and sets `display: flex`, so this has to
      // be inline to shrink-wrap the control. Same override as PrintOptionsModal.
      style={{ display: "inline-flex", flexShrink: 0 }}
    >
      {segments.map((segment, index) => {
        const active = value === segment.value;
        const prevActive = index > 0 && value === segments[index - 1].value;
        const showDivider = index > 0 && !active && !prevActive;
        return (
          <Fragment key={segment.value}>
            {index > 0 && (
              <div
                style={{
                  width: 1,
                  height: 16,
                  background: showDivider ? "var(--dg-color-border)" : "transparent",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              />
            )}
            <Button
              type="button"
              aria-pressed={active}
              onClick={() => onChange(segment.value)}
              className={`dg-span-tab${active ? " active" : ""}`}
            >
              {segment.icon && (
                <span style={{ display: "inline-flex", marginRight: 6 }}>{segment.icon}</span>
              )}
              {segment.label}
              <NumericBadge
                count={segment.count ?? 0}
                tone={active ? "onAccent" : "neutral"}
                style={{ marginLeft: 6 }}
              />
            </Button>
          </Fragment>
        );
      })}
    </div>
  );
}

interface ToolbarProps {
  search: string;
  sort: "asc" | "desc";
  read: ReadFilter;
  isAllSelected: boolean;
  hasNotifications: boolean;
  totalSelected: number;
  selectedIds: string[];
  busy: boolean;
  includeArchived: boolean;
  category: CategoryFilter;
  priority: NotificationPriority | "all";
  categories: CategoryFilter[];
  facets: NotificationFacets | null;
  onSectionChange: (includeArchived: boolean) => void;
  onReadChange: (value: ReadFilter) => void;
  canMarkAllRead: boolean;
  onMarkAllRead: () => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSortToggle: () => void;
  onCategoryChange: (value: CategoryFilter) => void;
  onPriorityChange: (value: NotificationPriority | "all") => void;
  onToggleSelectAll: () => void;
  onBulk: (action: "read" | "unread" | "archive" | "unarchive", ids: string[]) => void;
}

function Toolbar({
  search,
  sort,
  read,
  isAllSelected,
  hasNotifications,
  totalSelected,
  selectedIds,
  busy,
  includeArchived,
  category,
  priority,
  categories,
  facets,
  onSectionChange,
  onReadChange,
  canMarkAllRead,
  onMarkAllRead,
  onSearchChange,
  onClearSearch,
  onSortToggle,
  onCategoryChange,
  onPriorityChange,
  onToggleSelectAll,
  onBulk,
}: ToolbarProps) {
  const categoryOptions = useMemo(
    () =>
      categories.map((cat) => {
        const count =
          cat === "all"
            ? undefined
            : (facets?.byCategory?.[cat] as number | undefined) || undefined;
        return {
          value: cat,
          label: count ? `${CATEGORY_LABEL[cat]} (${count})` : CATEGORY_LABEL[cat],
        };
      }),
    [categories, facets],
  );

  const priorityOptions = useMemo(
    () => [
      { value: "all" as const, label: "Any priority" },
      ...(Object.keys(PRIORITY_LABEL) as NotificationPriority[]).map((p) => {
        const count = (facets?.byPriority?.[p] as number | undefined) || undefined;
        return {
          value: p,
          label: count ? `${PRIORITY_LABEL[p]} (${count})` : PRIORITY_LABEL[p],
        };
      }),
    ],
    [facets],
  );

  const totalArchived = facets?.totalArchived ?? 0;
  const totalUnread = facets?.totalUnread ?? 0;

  return (
    <div
      role="toolbar"
      aria-label="Alerts"
      className="dg-toolbar-type"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <Segments
        label="Section"
        value={includeArchived ? "archived" : "inbox"}
        onChange={(value) => onSectionChange(value === "archived")}
        segments={[
          { value: "inbox", label: "Inbox", icon: <Inbox size={14} /> },
          {
            value: "archived",
            label: "Archived",
            icon: <Archive size={14} />,
            count: totalArchived || undefined,
          },
        ]}
      />

      {/* Read state describes the inbox. An archived alert is done, so the
          filter and the unread count would only offer choices that change
          nothing there. */}
      {includeArchived ? null : (
        <Segments
          label="Read state"
          value={read}
          onChange={onReadChange}
          segments={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: totalUnread || undefined },
            { value: "read", label: "Read" },
          ]}
        />
      )}

      <div
        style={{
          position: "relative",
          flex: "1 1 220px",
          minWidth: 0,
        }}
      >
        <Search
          size={14}
          style={{
            position: "absolute",
            top: "50%",
            left: 10,
            transform: "translateY(-50%)",
            color: "var(--dg-color-text-muted)",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title or message…"
          aria-label="Search alerts"
          className="dg-input"
          style={{ paddingLeft: 32, paddingRight: search ? 32 : 12 }}
        />
        {search && (
          <CloseButton
            size="sm"
            onClick={onClearSearch}
            aria-label="Clear search"
            style={{ position: "absolute", top: "50%", right: 6, transform: "translateY(-50%)" }}
          />
        )}
      </div>

      <CustomSelect
        ariaLabel="Filter by category"
        value={category}
        options={categoryOptions}
        onChange={onCategoryChange}
        style={{ flex: "1 1 auto" }}
        fontSize="var(--dg-fs-navigation-item)"
        fontWeight="var(--dg-type-control-weight)"
        activeFontWeight="var(--dg-type-control-weight)"
        letterSpacing="normal"
      />

      <CustomSelect
        ariaLabel="Filter by priority"
        value={priority}
        options={priorityOptions}
        onChange={onPriorityChange}
        style={{ flex: "1 1 auto" }}
        fontSize="var(--dg-fs-navigation-item)"
        fontWeight="var(--dg-type-control-weight)"
        activeFontWeight="var(--dg-type-control-weight)"
        letterSpacing="normal"
      />

      <Button
        type="button"
        className="dg-btn dg-btn-ghost"
        onClick={onSortToggle}
        aria-label={`Sort ${sort === "desc" ? "newest" : "oldest"} first`}
      >
        {sort === "desc" ? "Newest first" : "Oldest first"}
      </Button>

      <label
        htmlFor="alerts-select-all"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "0 6px",
          color: "var(--dg-color-text-muted)",
          cursor: hasNotifications ? "pointer" : "default",
        }}
      >
        <input
          id="alerts-select-all"
          type="checkbox"
          checked={isAllSelected}
          onChange={onToggleSelectAll}
          disabled={!hasNotifications}
        />
        {totalSelected > 0 ? `${totalSelected} selected` : "Select"}
      </label>

      {totalSelected > 0 && (
        <BulkActions
          selectedIds={selectedIds}
          busy={busy}
          includeArchived={includeArchived}
          onBulk={onBulk}
        />
      )}

      {includeArchived ? null : (
        <Button
          type="button"
          className="dg-btn dg-btn-secondary"
          onClick={onMarkAllRead}
          disabled={!canMarkAllRead}
          aria-label="Mark all alerts as read"
          style={{ marginLeft: "auto" }}
        >
          <CheckCheck size={14} style={{ marginRight: 6 }} />
          Mark all read
        </Button>
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
  onBulk: (action: "read" | "unread" | "archive" | "unarchive", ids: string[]) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Bulk actions"
      style={{
        display: "inline-flex",
        gap: 6,
        padding: "4px 6px",
        border: "1px solid var(--dg-color-border)",
        borderRadius: "var(--dg-btn-radius)",
        background: "var(--dg-color-bg-secondary)",
      }}
    >
      <Button
        type="button"
        className="dg-btn dg-btn-ghost"
        onClick={() => onBulk("read", selectedIds)}
        disabled={busy}
      >
        <CheckCheck size={14} /> Read
      </Button>
      <Button
        type="button"
        className="dg-btn dg-btn-ghost"
        onClick={() => onBulk("unread", selectedIds)}
        disabled={busy}
      >
        <Mail size={14} /> Unread
      </Button>
      {includeArchived ? (
        <Button
          type="button"
          className="dg-btn dg-btn-ghost"
          onClick={() => onBulk("unarchive", selectedIds)}
          disabled={busy}
        >
          <ArchiveRestore size={14} /> Unarchive
        </Button>
      ) : (
        <Button
          type="button"
          className="dg-btn dg-btn-ghost"
          onClick={() => onBulk("archive", selectedIds)}
          disabled={busy}
        >
          <Archive size={14} /> Archive
        </Button>
      )}
    </div>
  );
}

interface NotificationRowProps {
  notification: Notification;
  isFirst: boolean;
  isLast: boolean;
  selected: boolean;
  audience: Audience;
  expanded: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  /** Hover or keyboard focus on the row: a click is likely next. */
  onIntent?: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}

function NotificationRow({
  notification,
  isLast,
  selected,
  audience,
  expanded,
  onToggleSelect,
  onClick,
  onIntent,
  onArchive,
  onUnarchive,
  onMarkRead,
  onMarkUnread,
}: NotificationRowProps) {
  const isUnread = !notification.readAt;
  const isArchived = !!notification.archivedAt;
  const destination = resolveAlertDestination(notification);
  const details = formatNotificationMetadata(notification.metadata, { audience });
  // An organization's own notes read inline; platform rows unfold on demand.
  const inlineDetails = audience === "org" ? details : [];
  const disclosure = audience === "platform" && !destination ? details : [];

  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "auto auto 1fr auto",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 16px",
    background: selected
      ? "var(--dg-color-info-bg)"
      : isUnread
        ? "var(--dg-color-info-bg)"
        : "var(--dg-color-surface)",
    borderBottom: isLast ? "none" : "1px solid var(--dg-color-border-light)",
    transition: "background 120ms ease",
  };

  return (
    <li style={rowStyle}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select alert: ${notification.title}`}
        style={{ marginTop: 6 }}
      />
      <div
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: isUnread ? "var(--dg-color-info-bg)" : "var(--dg-color-bg-secondary)",
          color: isUnread ? "var(--dg-color-info)" : "var(--dg-color-text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <NotificationIcon type={notification.type} />
      </div>
      <Button
        type="button"
        onClick={onClick}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        aria-label={`${notification.title}: ${notification.message}${isUnread ? " (unread)" : ""}. ${
          destination ? destination.label : expanded ? "Hide details" : "Show details"
        }`}
        aria-expanded={destination ? undefined : expanded}
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
          gap: 4,
          minWidth: 0,
          whiteSpace: "normal",
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
              fontSize: "var(--dg-fs-body-sm)",
              fontWeight: isUnread ? 700 : 600,
              lineHeight: 1.35,
              color: "var(--dg-color-text-primary)",
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
              <Hint content={hint(`Part of ${groupCount} related alerts`)}>
                <span
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--dg-color-text-muted)",
                    background: "var(--dg-color-bg-secondary)",
                    borderRadius: 999,
                    padding: "1px 8px",
                  }}
                >
                  ×{groupCount}
                </span>
              </Hint>
            );
          })()}
          {isUnread && (
            <span
              aria-hidden
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
        <span
          style={{
            fontSize: "var(--dg-fs-label)",
            color: "var(--dg-color-text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {notification.message}
        </span>
        {inlineDetails.map((entry) => (
          <span
            key={entry.label}
            style={{
              fontSize: "var(--dg-fs-label)",
              color: "var(--dg-color-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: "var(--dg-color-text-muted)" }}>{entry.label}: </span>
            {entry.value}
          </span>
        ))}
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-subtle)",
          }}
        >
          {formatRelativeTime(notification.createdAt)}
          {notification.channel === "email" ? " • Sent via email" : ""}
          {disclosure.length > 0 && (
            <>
              <span aria-hidden> • </span>
              {expanded ? (
                <ChevronDown size={12} aria-hidden />
              ) : (
                <ChevronRight size={12} aria-hidden />
              )}
              Details
            </>
          )}
        </span>
        {expanded && disclosure.length > 0 && (
          <span
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)",
              gap: "4px 12px",
              marginTop: 4,
              padding: 10,
              border: "1px solid var(--dg-color-border-light)",
              borderRadius: "var(--dg-radius-md)",
              background: "var(--dg-color-bg-secondary)",
              fontSize: "var(--dg-fs-label)",
            }}
          >
            <span className="dg-type-content-group-heading" style={{ gridColumn: "1 / -1" }}>
              Details
            </span>
            {disclosure.map((entry) => (
              <Fragment key={entry.label}>
                <span style={{ color: "var(--dg-color-text-muted)" }}>{entry.label}</span>
                <span style={{ color: "var(--dg-color-text-primary)", wordBreak: "break-word" }}>
                  {entry.value}
                </span>
              </Fragment>
            ))}
          </span>
        )}
      </Button>
      <div
        style={{
          display: "flex",
          gap: 4,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <Button
          type="button"
          aria-label={isUnread ? "Mark as read" : "Mark as unread"}
          className="dg-btn dg-btn-ghost"
          onClick={isUnread ? onMarkRead : onMarkUnread}
          title={isUnread ? "Mark as read" : "Mark as unread"}
        >
          {isUnread ? <MailOpen size={14} /> : <Mail size={14} />}
        </Button>
        {isArchived ? (
          <Button
            type="button"
            aria-label="Restore from archive"
            className="dg-btn dg-btn-ghost"
            onClick={onUnarchive}
            title="Restore from archive"
          >
            <ArchiveRestore size={14} />
          </Button>
        ) : (
          <Button
            type="button"
            aria-label="Archive"
            className="dg-btn dg-btn-ghost"
            onClick={onArchive}
            title="Archive"
          >
            <Archive size={14} />
          </Button>
        )}
      </div>
    </li>
  );
}

function ListPlaceholder() {
  return (
    <div
      style={{
        background: "var(--dg-color-surface)",
        border: "1px solid var(--dg-color-border)",
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
            borderBottom: i < 3 ? "1px solid var(--dg-color-border-light)" : "none",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "var(--dg-color-bg-secondary)",
            }}
          />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                width: "40%",
                height: 12,
                background: "var(--dg-color-bg-secondary)",
                borderRadius: "var(--dg-radius-xs)",
              }}
            />
            <div
              style={{
                width: "70%",
                height: 10,
                background: "var(--dg-color-bg-secondary)",
                borderRadius: "var(--dg-radius-xs)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default AlertsInboxPage;
