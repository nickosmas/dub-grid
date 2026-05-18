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
  Calendar,
  CheckCheck,
  Inbox,
  Mail,
  MailOpen,
  Search,
  Shield,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { ProtectedRoute } from "@/components/RouteGuards";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  archiveNotifications,
  deleteNotifications,
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
type CategoryFilter = "all" | "schedule" | "shift_requests" | "system";

const CATEGORY_LABEL: Record<CategoryFilter, string> = {
  all: "All notifications",
  schedule: "Schedule",
  shift_requests: "Shift requests",
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
  if (type === "schedule_published" || type === "shift_change") {
    return <Calendar size={16} />;
  }
  if (type === "shift_request_new" || type === "shift_request_approved" || type === "shift_request_rejected") {
    return <UserCog size={16} />;
  }
  if (type === "impersonation_start" || type === "impersonation_end") {
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestSeq = useRef(0);

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

  // Reload when filters/search change
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
  }, [query]);

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
      } catch (err) {
        toast.error(formatClientErrorMessage(err, "Action failed"));
      } finally {
        setBusy(false);
      }
    },
    [applyOptimistic, filters.includeArchived, refreshFacets, removeFromList],
  );

  const handleConfirmDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBusy(true);
    try {
      await deleteNotifications(ids);
      removeFromList(ids);
      setSelectedIds(new Set());
      refreshFacets();
      toast.success(
        ids.length === 1
          ? "Notification deleted"
          : `${ids.length} notifications deleted`,
      );
    } catch (err) {
      toast.error(formatClientErrorMessage(err, "Delete failed"));
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }, [refreshFacets, removeFromList, selectedIds]);

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
    }
  }, [refreshFacets]);

  const handleRowClick = useCallback(
    async (n: Notification) => {
      if (!n.readAt) {
        try {
          await markNotificationsRead([n.id]);
          applyOptimistic([n.id], { readAt: new Date().toISOString() });
          refreshFacets();
        } catch {
          // best-effort; continue to navigate
        }
      }
    },
    [applyOptimistic, refreshFacets],
  );

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
          <h1
            style={{
              margin: 0,
              fontSize: "var(--dg-fs-page-title)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Notifications
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--color-text-muted)",
              fontSize: "var(--dg-fs-label)",
            }}
          >
            Search, filter, and review every notification you've received.
          </p>
        </div>
        <button
          type="button"
          className="dg-btn dg-btn-secondary"
          onClick={handleMarkAllRead}
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
            onDelete={() => setConfirmingDelete(true)}
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

      {confirmingDelete && (
        <ConfirmDialog
          title={
            selectedIds.size === 1
              ? "Delete notification?"
              : `Delete ${selectedIds.size} notifications?`
          }
          message="Deleted notifications can't be recovered. To hide without losing them, archive instead."
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmingDelete(false)}
          isLoading={busy}
          variant="danger"
        />
      )}
    </div>
  );
}

interface FilterSidebarProps {
  filters: FilterState;
  facets: NotificationFacets | null;
  onChange: (next: FilterState) => void;
}

function FilterSidebar({ filters, facets, onChange }: FilterSidebarProps) {
  const setRead = (read: ReadFilter) => onChange({ ...filters, read });
  const setCategory = (category: CategoryFilter) =>
    onChange({ ...filters, category });
  const setPriority = (priority: NotificationPriority | "all") =>
    onChange({ ...filters, priority });
  const setIncludeArchived = (includeArchived: boolean) =>
    onChange({ ...filters, includeArchived });

  const totalUnread = facets?.totalUnread ?? 0;
  const totalArchived = facets?.totalArchived ?? 0;

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        position: "sticky",
        top: 16,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <FilterGroup label="Status">
        <FilterChip
          active={filters.read === "all" && !filters.includeArchived}
          onClick={() => {
            setIncludeArchived(false);
            setRead("all");
          }}
          icon={<Inbox size={14} />}
          label="Inbox"
        />
        <FilterChip
          active={filters.read === "unread" && !filters.includeArchived}
          onClick={() => {
            setIncludeArchived(false);
            setRead("unread");
          }}
          icon={<Mail size={14} />}
          label="Unread"
          count={totalUnread || undefined}
        />
        <FilterChip
          active={filters.read === "read" && !filters.includeArchived}
          onClick={() => {
            setIncludeArchived(false);
            setRead("read");
          }}
          icon={<MailOpen size={14} />}
          label="Read"
        />
        <FilterChip
          active={filters.includeArchived}
          onClick={() => {
            setIncludeArchived(true);
            setRead("all");
          }}
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
  onDelete: () => void;
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
  onDelete,
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
          onDelete={onDelete}
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
  onDelete,
}: {
  selectedIds: string[];
  busy: boolean;
  includeArchived: boolean;
  onBulk: (
    action: "read" | "unread" | "archive" | "unarchive",
    ids: string[],
  ) => void;
  onDelete: () => void;
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
      <button
        type="button"
        className="dg-btn dg-btn-danger"
        onClick={onDelete}
        disabled={busy}
        style={buttonStyle}
      >
        <Trash2 size={14} /> Delete
      </button>
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
          {notification.groupCount > 1 && (
            <span
              title={`Part of ${notification.groupCount} related notifications`}
              style={{
                fontSize: "var(--dg-fs-footnote)",
                color: "var(--color-text-muted)",
                background: "var(--color-bg-secondary)",
                borderRadius: 999,
                padding: "1px 8px",
              }}
            >
              ×{notification.groupCount}
            </span>
          )}
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
        {notification.actionUrl && notification.actionLabel && (
          <Link
            href={notification.actionUrl}
            className="dg-btn dg-btn-secondary"
            onClick={onClick}
            style={{ whiteSpace: "nowrap" }}
          >
            {notification.actionLabel}
          </Link>
        )}
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
