"use client";
import { ArrowUpDown, ChevronLeft, Clock } from "lucide-react";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import type { ShiftRequest, ShiftRequestStatus, ShiftRequestType, AbsenceType } from "@/types";
import { Button } from "@/components/Button";
import { useMediaQuery, MOBILE } from "@/hooks";
import { useSlideoverClose } from "@/hooks/useSlideoverClose";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { EmptyState } from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProgressBar from "@/components/ProgressBar";
import ScrollableTabs from "@/components/ScrollableTabs";
import { joinShiftJobSegmentNames } from "@/lib/shift-job-segments";
import { joinAssignmentNames } from "@/lib/assignable-shifts";
import { resolveShiftPillColors } from "@/lib/colors";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { NumericBadge } from "@/components/ui/numeric-badge";
import CustomSelect from "@/components/CustomSelect";
import StaffMultiSelect, { type StaffOption } from "@/components/StaffMultiSelect";
import DateRangePicker from "@/components/ui/date-range-picker";
import { fetchShiftRequests } from "@/features/schedule/client/api";
import { queryKeys } from "@/lib/query-keys";
import {
  describeAwaitingRecipient,
  describeCancelAwaitingRecipientCaution,
  describeShiftRequest,
  describeShiftRequestNoteRecipients,
  describeShiftRequestPill,
  groupManagerQueue,
  isAwaitingRecipient,
} from "@dubgrid/domain";
import { formatScheduleTimeRange } from "@dubgrid/schedule-core";
import { resolveJobChipTone } from "@dubgrid/design-tokens";

// ── Types ────────────────────────────────────────────────────────────────────

interface ShiftRequestBoardProps {
  /** The tab to open on; a deep link from an alert names it. */
  initialTab?: Tab;
  /** Needed for the history lookup, which fetches on its own terms. */
  orgId: string | null;
  /** Everyone the history lookup can filter by; defaults to nobody. */
  staffOptions?: StaffOption[];
  /** Focus area names by id, for the shift panels. */
  focusAreaNameMap?: Map<number, string>;
  openPickups: ShiftRequest[];
  myRequests: ShiftRequest[];
  pendingApproval: ShiftRequest[];
  approvalQueue?: ShiftRequest[];
  canViewAllRequests?: boolean;
  loading: boolean;
  currentEmpId: string | null;
  canApprove: boolean;
  onClaim: (requestId: string) => void | Promise<unknown>;
  onRespond: (requestId: string, accept: boolean) => void | Promise<unknown>;
  onResolve: (requestId: string, approved: boolean, note?: string) => void | Promise<unknown>;
  /**
   * `requesterEmpId` is whose request it is: the RPC checks it, whoever
   * cancels. `note` is a manager's word to both people when withdrawing a
   * request its recipient has not answered.
   */
  onCancel: (requestId: string, requesterEmpId: string, note?: string) => void | Promise<unknown>;
  onClose: () => void;
  absenceTypeMap?: Map<number, AbsenceType>;
  assignmentNameMap: Map<number, string>;
}

type Tab = "available" | "mine" | "approval" | "history";

const HISTORY_STATUSES: ShiftRequestStatus[] = ["approved", "rejected", "cancelled", "expired"];
const HISTORY_DEFAULT_DAYS = 30;

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatResolvedAt(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
type PendingConfirmation = {
  confirmLabel: string;
  key: string;
  message: ReactNode;
  onConfirm: () => void | Promise<unknown>;
  title: string;
  variant?: "danger" | "warning" | "info";
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatShiftDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function hoursRemaining(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3600000));
}

function timeRemainingLabel(expiresAt: string): string {
  const hours = hoursRemaining(expiresAt);
  if (hours <= 0) return "Expired";
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

// One pill per card: the kind while open, kind and status once it is waiting
// or decided (`describeShiftRequestPill`). No red: a rejection is history.
const PILL_TONES: Record<ReturnType<typeof describeShiftRequestPill>["tone"], StatusPillTone> = {
  kind: "info",
  pending: "warning",
  approved: "success",
  closed: "neutral",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ShiftRequestBoard({
  initialTab,
  orgId,
  staffOptions = [],
  focusAreaNameMap,
  openPickups,
  myRequests,
  pendingApproval,
  approvalQueue,
  canViewAllRequests = false,
  loading,
  currentEmpId,
  canApprove,
  onClaim,
  onRespond,
  onResolve,
  onCancel,
  onClose,
  absenceTypeMap,
  assignmentNameMap,
}: ShiftRequestBoardProps) {
  const isMobile = useMediaQuery(MOBILE);
  const { closing, close } = useSlideoverClose(onClose);
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  // A deep link may name the approval tab for someone who cannot see it;
  // their own requests are the nearest tab that exists for them.
  const canReviewOrg = canApprove || canViewAllRequests;
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (!initialTab) return "available";
    if ((initialTab === "approval" || initialTab === "history") && !canReviewOrg) return "mine";
    return initialTab;
  });

  // History is a lookup rather than a live list: it fetches the decided
  // requests for a shift-date window on demand, and the staff and outcome
  // filters narrow that result in place, so a manager can answer "what did
  // Laura ask for in March" without paging through everything since launch.
  const [historyFrom, setHistoryFrom] = useState(() => isoDateDaysAgo(HISTORY_DEFAULT_DAYS));
  const [historyTo, setHistoryTo] = useState("");
  const [historyType, setHistoryType] = useState<ShiftRequestType | "all">("all");
  const [historyStatus, setHistoryStatus] = useState<ShiftRequestStatus | "all">("all");
  const [historyStaff, setHistoryStaff] = useState<string[]>([]);
  const historyQuery = useQuery({
    queryKey: [
      ...queryKeys.shiftRequests.all(orgId ?? "none"),
      "history",
      historyFrom,
      historyTo,
      historyType,
    ],
    queryFn: () =>
      fetchShiftRequests(orgId!, assignmentNameMap, {
        status: HISTORY_STATUSES,
        ...(historyType === "all" ? {} : { type: historyType }),
        ...(historyFrom ? { startDate: historyFrom } : {}),
        ...(historyTo ? { endDate: historyTo } : {}),
      }),
    enabled: Boolean(orgId) && canReviewOrg && activeTab === "history",
    staleTime: 60_000,
  });
  const historyRequests = useMemo(() => {
    const people = new Set(historyStaff);
    return (historyQuery.data ?? [])
      .filter((r) => historyStatus === "all" || r.status === historyStatus)
      .filter(
        (r) =>
          people.size === 0 ||
          people.has(r.requesterEmpId) ||
          (r.targetEmpId != null && people.has(r.targetEmpId)),
      )
      .sort(
        (left, right) =>
          new Date(right.resolvedAt ?? right.createdAt).getTime() -
          new Date(left.resolvedAt ?? left.createdAt).getTime(),
      );
  }, [historyQuery.data, historyStaff, historyStatus]);
  // One optional note per pending card, sent with whichever decision is made.
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [runningConfirmationKey, setRunningConfirmationKey] = useState<string | null>(null);
  const managerQueue = [...(approvalQueue ?? pendingApproval)].sort((left, right) => {
    const statusPriority = (status: ShiftRequestStatus) =>
      status === "pending_approval" ? 0 : status === "open" ? 1 : 2;
    const byStatus = statusPriority(left.status) - statusPriority(right.status);
    if (byStatus !== 0) {
      return byStatus;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
  const hasRunningAction = runningConfirmationKey != null;

  async function confirmPendingAction() {
    if (!pendingConfirmation || runningConfirmationKey) return;

    setRunningConfirmationKey(pendingConfirmation.key);
    try {
      // The hooks resolve `false` on a failure they have already toasted; the
      // dialog then stays up with the note intact instead of closing over it.
      const result = await pendingConfirmation.onConfirm();
      if (result !== false) setPendingConfirmation(null);
    } finally {
      setRunningConfirmationKey(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number; visible: boolean }[] = [
    { key: "available", label: "Available Shifts", count: openPickups.length, visible: true },
    { key: "mine", label: "My Requests", count: myRequests.length, visible: true },
    {
      key: "approval",
      label: canApprove ? "Approval Queue" : "All Requests",
      count: managerQueue.length,
      visible: canReviewOrg,
    },
    { key: "history", label: "History", count: historyRequests.length, visible: canReviewOrg },
  ];

  function getTabData(): ShiftRequest[] {
    switch (activeTab) {
      case "available":
        return openPickups;
      case "mine":
        return myRequests;
      case "approval":
        return managerQueue;
      case "history":
        return historyRequests;
    }
  }

  function getEmptyMessage(): string {
    switch (activeTab) {
      case "available":
        return "No available shifts";
      case "mine":
        return "No requests yet";
      case "approval":
        return canApprove ? "No active requests" : "No organization requests";
      case "history":
        return historyQuery.isPending ? "Loading history" : "No decided requests match";
    }
  }

  // ── Status badge ─────────────────────────────────────────────────────────

  function renderRequestPill(req: ShiftRequest) {
    const pill = describeShiftRequestPill(req.type, req.status);
    return (
      <StatusPill dot={false} tone={PILL_TONES[pill.tone]}>
        {pill.label}
      </StatusPill>
    );
  }

  // ── Shift panel ──────────────────────────────────────────────────────────

  type ShiftParty = {
    name: string;
    shiftLabel: string;
    /** Named jobs on the shift; the default shift job stays unnamed. */
    jobs: Array<{ label: string; isMentored: boolean }>;
    focusAreaName: string | null;
    date: string;
    timeRange: string | null;
  };

  // One side of a request as the panel shows it: the shift by name, every
  // job on it (shown even when the grid hides the job), the focus area, and
  // the day with the resolved or custom time.
  function describeParty(
    req: ShiftRequest,
    side: "requester" | "target",
    name: string,
    fallbackLabel: string,
  ): ShiftParty | null {
    const isRequester = side === "requester";
    const date = isRequester ? req.requesterShiftDate : req.targetShiftDate;
    if (!date) return null;
    const segments = (isRequester ? req.requesterSegments : req.targetSegments) ?? [];
    const presentation = isRequester ? req.requesterPresentation : req.targetPresentation;
    const shiftNames = segments.map((segment) => segment.shiftName?.trim()).filter(Boolean);
    const jobs = segments.flatMap((segment) => {
      // The default shift job is the shift itself, not a job worth naming.
      const jobName = segment.isShiftOnly ? null : segment.jobName?.trim();
      return jobName ? [{ label: jobName, isMentored: segment.isMentored === true }] : [];
    });
    const focusAreaId =
      (isRequester ? req.requesterFocusAreaId : req.targetFocusAreaId) ??
      presentation?.focusAreaId ??
      null;
    const timeRange =
      formatScheduleTimeRange(presentation?.startTime ?? null, presentation?.endTime ?? null) ??
      formatScheduleTimeRange(
        isRequester ? req.requesterCustomStartTime : req.targetCustomStartTime,
        isRequester ? req.requesterCustomEndTime : req.targetCustomEndTime,
      );

    return {
      name,
      shiftLabel: shiftNames.length > 0 ? shiftNames.join(" / ") : fallbackLabel,
      jobs,
      focusAreaName: focusAreaId != null ? (focusAreaNameMap?.get(focusAreaId) ?? null) : null,
      date,
      timeRange,
    };
  }

  // The same tone rule the grid and mobile use, on the page's own tokens.
  const jobChipContext = {
    surfaceSecondary: "var(--dg-color-surface-alt)",
    border: "var(--dg-color-border)",
    textMuted: "var(--dg-color-text-muted)",
    warningSoft: "var(--dg-color-warning-bg)",
    warningBorder: "var(--dg-color-warning-border)",
    warningText: "var(--dg-color-warning-text)",
  };

  function renderJobPill(job: ShiftParty["jobs"][number], key: number) {
    const tone = resolveJobChipTone(job.label, isDarkTheme, jobChipContext);
    return (
      <span
        key={key}
        aria-label={`Job ${job.label}${job.isMentored ? ", mentored assignment" : ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: "var(--dg-radius-sm)",
          border: `1px solid ${tone.borderColor}`,
          background: tone.backgroundColor,
          color: tone.textColor,
          fontSize: "var(--dg-type-badge-size)",
          fontWeight: 600,
          lineHeight: 1.4,
          whiteSpace: "nowrap",
        }}
      >
        {job.label}
        {job.isMentored ? <span style={{ fontWeight: 500 }}>Mentored</span> : null}
      </span>
    );
  }

  function renderShiftPanel(party: ShiftParty, seam?: "above" | "below") {
    const when = [formatShiftDate(party.date), party.timeRange].filter(Boolean).join(" \u00b7 ");
    return (
      <div
        style={{
          background: "var(--dg-color-surface-alt)",
          borderRadius: "var(--dg-radius-sm)",
          padding: "10px 12px",
          // Room for the swap disc that straddles the seam between two panels.
          ...(seam === "below" ? { paddingBottom: 24 } : {}),
          ...(seam === "above" ? { paddingTop: 24 } : {}),
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-muted)" }}>
          {party.name}
        </span>
        <span
          style={{
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 600,
            color: "var(--dg-color-text-primary)",
          }}
        >
          {party.shiftLabel}
        </span>
        {party.jobs.length > 0 ? (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {party.jobs.map((job, index) => renderJobPill(job, index))}
          </span>
        ) : null}
        {party.focusAreaName ? (
          <span
            style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}
          >
            {party.focusAreaName}
          </span>
        ) : null}
        <span
          className="dg-tabular-nums"
          style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-secondary)" }}
        >
          {when}
        </span>
      </div>
    );
  }

  function clearNote(requestId: string) {
    setResolveNotes((prev) => {
      const next = { ...prev };
      delete next[requestId];
      return next;
    });
  }

  // One optional note per decision, sent with whichever of approve, reject or
  // a manager's cancel is confirmed; it reaches both people on the request.
  function renderNoteField(req: ShiftRequest) {
    const notePlaceholder = `Note to ${describeShiftRequestNoteRecipients(req)}? (Optional)`;
    return (
      <textarea
        key="resolve-note"
        aria-label={notePlaceholder}
        placeholder={notePlaceholder}
        value={resolveNotes[req.id] ?? ""}
        onChange={(e) => setResolveNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
        style={{
          width: "100%",
          minHeight: 56,
          padding: "8px 10px",
          border: "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-md)",
          fontSize: "var(--dg-fs-caption)",
          fontFamily: "inherit",
          color: "var(--dg-color-text-primary)",
          background: "var(--dg-color-surface)",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    );
  }

  // ── Request card ─────────────────────────────────────────────────────────

  function renderCard(req: ShiftRequest) {
    const isSwap = req.type === "swap";
    const isCalloff = req.type === "calloff";
    const isOwnRequest = currentEmpId === req.requesterEmpId;
    const isTarget = currentEmpId === req.targetEmpId;
    const copy = describeShiftRequest(req, currentEmpId);
    const absenceType =
      isCalloff && req.absenceTypeId ? absenceTypeMap?.get(req.absenceTypeId) : null;
    const absenceTypeColors = absenceType
      ? resolveShiftPillColors(
          { color: absenceType.color, text: absenceType.text, border: absenceType.border },
          isDarkTheme,
        )
      : null;
    // Segments only carry names once the server resolved them; fall back to
    // resolving the assignment ids through the full-name map, and only then
    // to the (possibly abbreviated) server-baked label.
    const requesterLabel =
      joinShiftJobSegmentNames(req.requesterSegments ?? []) ||
      joinAssignmentNames(req.requesterAssignmentDefinitionIds, assignmentNameMap) ||
      req.requesterShiftLabel;
    const targetLabel =
      joinShiftJobSegmentNames(req.targetSegments ?? []) ||
      joinAssignmentNames(req.targetAssignmentDefinitionIds ?? [], assignmentNameMap) ||
      req.targetShiftLabel;

    return (
      <div
        key={req.id}
        style={{
          border: isCalloff
            ? "1px solid var(--dg-color-danger-border, #FCA5A5)"
            : "1px solid var(--dg-color-border)",
          borderRadius: "var(--dg-radius-md)",
          padding: "14px 16px",
          background: "var(--dg-color-surface)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Top row: name + status */}
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 700,
              color: "var(--dg-color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {copy.title}
          </span>
          {renderRequestPill(req)}
        </div>

        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}>
          {copy.subtitle}
        </span>

        {/* Shift info: every request shows its shift as a panel; a swap shows both */}
        {(() => {
          const requesterParty = describeParty(
            req,
            "requester",
            copy.requesterShiftLabel,
            requesterLabel,
          );
          const targetParty = isSwap
            ? describeParty(
                req,
                "target",
                copy.targetShiftLabel ?? req.targetName ?? "",
                targetLabel ?? req.targetShiftLabel ?? "",
              )
            : null;
          if (!requesterParty) return null;
          if (!targetParty) return renderShiftPanel(requesterParty);
          // The two panels sit nearly flush and the swap disc straddles the
          // seam between them; a ring in the card's colour lifts it off both.
          return (
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4 }}>
              {renderShiftPanel(requesterParty, "below")}
              <span
                aria-label="swaps with"
                role="img"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "var(--dg-color-brand-bg)",
                  color: "var(--dg-color-brand)",
                  boxShadow: "0 0 0 3px var(--dg-color-surface)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 1,
                }}
              >
                <ArrowUpDown size={14} strokeWidth={2.5} />
              </span>
              {renderShiftPanel(targetParty, "above")}
            </div>
          );
        })()}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {isCalloff && absenceType && (
            <span
              style={{
                fontSize: "var(--dg-fs-caption)",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "var(--dg-radius-sm)",
                background: absenceTypeColors?.color || "var(--dg-color-surface-alt)",
                color: absenceTypeColors?.text || "var(--dg-color-text-primary)",
                border: `1px solid ${absenceTypeColors?.border || "var(--dg-color-border)"}`,
              }}
            >
              {absenceType.label}: {absenceType.name}
            </span>
          )}
        </div>

        {/* A manager sees why an open swap cannot be decided yet: it is
            waiting on the person it was aimed at, not on them. */}
        {canApprove && isAwaitingRecipient(req) && req.targetName ? (
          <div
            role="note"
            style={{
              fontSize: "var(--dg-fs-footnote)",
              color: "var(--dg-color-warning-text)",
              background: "var(--dg-color-warning-bg)",
              border: "1px solid var(--dg-color-warning-border)",
              borderRadius: "var(--dg-radius-sm)",
              padding: "6px 10px",
            }}
          >
            {describeAwaitingRecipient(req.targetName)}
          </div>
        ) : null}
        {/* Expiry while it can still be acted on; when it was decided once it is over */}
        <div
          style={{
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Clock size={11} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          {req.status === "open" || req.status === "pending_approval"
            ? timeRemainingLabel(req.expiresAt)
            : req.resolvedAt
              ? `Decided ${formatResolvedAt(req.resolvedAt)}`
              : `Requested ${formatShiftDate(req.createdAt.slice(0, 10))}`}
        </div>
        {req.adminNote ? (
          <div
            style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--dg-color-text-secondary)" }}
          >
            Manager note: {req.adminNote}
          </div>
        ) : null}

        {/* Action buttons */}
        {renderActions(req, isOwnRequest, isTarget)}
      </div>
    );
  }

  // ── Action buttons ───────────────────────────────────────────────────────

  function renderActions(req: ShiftRequest, isOwnRequest: boolean, isTarget: boolean) {
    const actions: React.ReactNode[] = [];
    const primaryActions: React.ReactNode[] = [];
    const requesterFullLabel =
      joinShiftJobSegmentNames(req.requesterSegments ?? []) ||
      joinAssignmentNames(req.requesterAssignmentDefinitionIds, assignmentNameMap) ||
      req.requesterShiftLabel;
    const requestLabel = `${requesterFullLabel} on ${formatShiftDate(req.requesterShiftDate)}`;

    // Claim button: open pickup that isn't mine
    if (
      req.type === "pickup" &&
      req.status === "open" &&
      req.targetEmpId == null &&
      !isOwnRequest &&
      currentEmpId
    ) {
      primaryActions.push(
        <Button
          key="claim"
          className="dg-btn dg-btn-primary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Claim",
              key: `claim:${req.id}`,
              message: (
                <>
                  Claim <strong>{requesterFullLabel}</strong> on{" "}
                  <strong>{formatShiftDate(req.requesterShiftDate)}</strong>? This will be sent for
                  manager approval.
                </>
              ),
              onConfirm: () => onClaim(req.id),
              title: "Claim this shift?",
              variant: "info",
            })
          }
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Claim
        </Button>,
      );
    }

    // Target of a swap or targeted pickup with open status: Accept / Decline
    if (isTarget && (req.type === "swap" || req.type === "pickup") && req.status === "open") {
      primaryActions.push(
        <Button
          key="accept"
          className="dg-btn dg-btn-primary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Accept",
              key: `accept:${req.id}`,
              message: (
                <>
                  Accept {req.requesterName}&apos;s request for <strong>{requestLabel}</strong>?
                </>
              ),
              onConfirm: () => onRespond(req.id, true),
              title: "Accept request?",
              variant: "info",
            })
          }
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Accept
        </Button>,
      );
      actions.push(
        <Button
          key="decline"
          className="dg-btn dg-btn-secondary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Decline",
              key: `decline:${req.id}`,
              message: (
                <>
                  Decline {req.requesterName}&apos;s request for <strong>{requestLabel}</strong>?
                </>
              ),
              onConfirm: () => onRespond(req.id, false),
              title: "Decline request?",
              variant: "warning",
            })
          }
          style={{
            fontSize: "var(--dg-fs-caption)",
            padding: "7px 14px",
          }}
        >
          Decline
        </Button>,
      );
    }

    // Approve / Reject: admin with permission, request is pending_approval
    if (canApprove && req.status === "pending_approval") {
      const note = resolveNotes[req.id]?.trim() || undefined;
      actions.push(renderNoteField(req));
      actions.push(
        <Button
          key="reject"
          className="dg-btn dg-btn-secondary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Reject",
              key: `reject:${req.id}`,
              message: (
                <>
                  Reject {req.requesterName}&apos;s request for <strong>{requestLabel}</strong>? The
                  original schedule will stay in place.
                  {note ? (
                    <>
                      {" "}
                      Your note: <em>{note}</em>
                    </>
                  ) : null}
                </>
              ),
              onConfirm: async () => {
                const done = await onResolve(req.id, false, note);
                if (done !== false) clearNote(req.id);
                return done;
              },
              title: "Reject request?",
              variant: "warning",
            })
          }
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Reject
        </Button>,
      );
      primaryActions.push(
        <Button
          key="approve"
          className="dg-btn dg-btn-primary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Approve",
              key: `approve:${req.id}`,
              message: (
                <>
                  Approve {req.requesterName}&apos;s request for <strong>{requestLabel}</strong>?
                  This will finalize the staffing change.
                  {note ? (
                    <>
                      {" "}
                      Your note: <em>{note}</em>
                    </>
                  ) : null}
                </>
              ),
              onConfirm: async () => {
                const done = await onResolve(req.id, true, note);
                if (done !== false) clearNote(req.id);
                return done;
              },
              title: "Approve request?",
              variant: "info",
            })
          }
          style={{ fontSize: "var(--dg-fs-caption)", padding: "7px 14px" }}
        >
          Approve
        </Button>,
      );
    }

    // Cancel: the requester withdraws their own open or pending request; a
    // manager may also withdraw one still waiting on its recipient, since
    // nothing else can move it. Either way, cancelling over the recipient's
    // head gets the caution.
    const awaitingRecipient = isAwaitingRecipient(req);
    const canCancelOwn =
      isOwnRequest && (req.status === "open" || req.status === "pending_approval");
    const managerCancel = !canCancelOwn && canApprove && awaitingRecipient;
    if (canCancelOwn || managerCancel) {
      if (managerCancel) actions.push(renderNoteField(req));
      const cancelNote = managerCancel ? resolveNotes[req.id]?.trim() || undefined : undefined;
      actions.push(
        <Button
          key="cancel"
          className="dg-btn dg-btn-secondary"
          disabled={hasRunningAction}
          onClick={() =>
            setPendingConfirmation({
              confirmLabel: "Cancel request",
              key: `cancel:${req.id}`,
              message: awaitingRecipient ? (
                describeCancelAwaitingRecipientCaution(req)
              ) : (
                <>
                  Cancel {isOwnRequest ? "your" : "this"} request for{" "}
                  <strong>{requestLabel}</strong>? It will no longer be available for review.
                </>
              ),
              onConfirm: async () => {
                const done = await onCancel(req.id, req.requesterEmpId, cancelNote);
                if (cancelNote && done !== false) clearNote(req.id);
                return done;
              },
              title: "Cancel request?",
              variant: "warning",
            })
          }
          style={{
            fontSize: "var(--dg-fs-caption)",
            padding: "7px 14px",
          }}
        >
          {isOwnRequest ? "Cancel" : "Cancel request"}
        </Button>,
      );
    }

    const orderedActions = [...actions, ...primaryActions];
    if (orderedActions.length === 0) return null;

    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
        {orderedActions}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const tabData = getTabData();
  // The approval queue is split by what each request is waiting on: the
  // manager, a claimant, or the person it was aimed at. One column per group.
  const queueGroups = activeTab === "approval" ? groupManagerQueue(tabData) : null;
  // The panel opens at the standard width and grows leftwards only when the
  // tab in front needs the room: a second column once there are two cards (or
  // two queue groups), a third from three, and the history filters always
  // want the full spread.
  const columnCount = queueGroups ? queueGroups.length : tabData.length;
  const panelWidthClass =
    activeTab === "history" || columnCount >= 3
      ? " dg-panel--max"
      : columnCount === 2
        ? " dg-panel--cols-2"
        : "";

  return createPortal(
    <>
      <ProgressBar loading={loading} />
      {pendingConfirmation && (
        <ConfirmDialog
          confirmLabel={pendingConfirmation.confirmLabel}
          isLoading={runningConfirmationKey === pendingConfirmation.key}
          message={pendingConfirmation.message}
          title={pendingConfirmation.title}
          variant={pendingConfirmation.variant}
          onCancel={() => {
            if (!runningConfirmationKey) {
              setPendingConfirmation(null);
            }
          }}
          onConfirm={() => confirmPendingAction()}
        />
      )}
      {/* Backdrop */}
      <div className={`dg-panel-overlay${closing ? " closing" : ""}`} onClick={close} />

      {/* Panel */}
      <div
        className={`dg-panel${panelWidthClass}${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Shift requests"
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--dg-color-surface)",
          }}
        >
          {isMobile && (
            <Button
              onClick={close}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: "var(--dg-radius-md)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={20} color="var(--dg-color-text-primary)" />
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              Shift Requests
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-subtle)",
                marginTop: 2,
              }}
            >
              Pickups, swaps, and approvals
            </div>
          </div>
          {!isMobile && <CloseButton size="md" onClick={close} aria-label="Close panel" />}
        </div>

        {/* Tab bar */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            background: "var(--dg-color-surface)",
            flexShrink: 0,
          }}
        >
          <ScrollableTabs className="dg-span-tabs dg-span-tabs--light">
            {tabs
              .filter((t) => t.visible)
              .map((tab, i, visibleTabs) => {
                const isActive = activeTab === tab.key;
                const prevActive = i > 0 && activeTab === visibleTabs[i - 1].key;
                const showDivider = i > 0 && !isActive && !prevActive;
                return (
                  <Fragment key={tab.key}>
                    {i > 0 && (
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
                      onClick={() => setActiveTab(tab.key)}
                      className={`dg-span-tab${isActive ? " active" : ""}`}
                    >
                      {tab.label}
                      <NumericBadge
                        count={tab.count}
                        tone={isActive ? "onAccent" : "neutral"}
                        style={{ marginLeft: 6 }}
                      />
                    </Button>
                  </Fragment>
                );
              })}
          </ScrollableTabs>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: isMobile ? "16px" : "20px 24px",
          }}
        >
          {activeTab === "history" ? (
            <div
              // Each filter is at least as wide as its own value and shares
              // the leftover, wrapping as needed, rather than four equal
              // tracks that clip the date range and pad "All types".
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <DateRangePicker
                id="request-history-dates"
                style={{ flex: "1 1 auto" }}
                allowClear
                label="Shift dates"
                onChange={(next) => {
                  setHistoryFrom(next.from);
                  setHistoryTo(next.to);
                }}
                placeholder="Any shift date"
                value={{ from: historyFrom, to: historyTo }}
              />
              <CustomSelect
                style={{ flex: "1 1 auto" }}
                ariaLabel="Request type"
                fontSize="var(--dg-fs-caption)"
                onChange={setHistoryType}
                options={[
                  { value: "all", label: "All types" },
                  { value: "swap", label: "Swaps" },
                  { value: "pickup", label: "Pickups" },
                  { value: "calloff", label: "Time off" },
                ]}
                value={historyType}
              />
              <CustomSelect
                style={{ flex: "1 1 auto" }}
                ariaLabel="Outcome"
                fontSize="var(--dg-fs-caption)"
                onChange={setHistoryStatus}
                options={[
                  { value: "all", label: "All outcomes" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                  { value: "cancelled", label: "Cancelled" },
                  { value: "expired", label: "Expired" },
                ]}
                value={historyStatus}
              />
              <StaffMultiSelect
                style={{ flex: "1 1 auto" }}
                onChange={setHistoryStaff}
                options={staffOptions}
                value={historyStaff}
              />
            </div>
          ) : null}
          {tabData.length === 0 ? (
            loading || (activeTab === "history" && historyQuery.isPending) ? null : (
              <EmptyState
                icon={
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                }
                title={getEmptyMessage()}
                style={{ padding: "40px 24px", border: "none", background: "transparent" }}
              />
            )
          ) : queueGroups ? (
            <div
              style={{
                display: "grid",
                // A column is never narrower than a card needs to show a name
                // beside its pill; groups wrap under one another once the
                // panel cannot hold them side by side.
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(340px, 1fr))",
                gap: 16,
                alignItems: "start",
              }}
            >
              {queueGroups.map((group) => (
                <section
                  key={group.key}
                  aria-labelledby={`request-queue-${group.key}`}
                  style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}
                >
                  <h3
                    id={`request-queue-${group.key}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      margin: 0,
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 600,
                      color: "var(--dg-color-text-secondary)",
                    }}
                  >
                    {group.label}
                    <NumericBadge count={group.requests.length} />
                  </h3>
                  {group.requests.map((req) => renderCard(req))}
                </section>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))",
                gap: 10,
                alignItems: "start",
              }}
            >
              {tabData.map((req) => renderCard(req))}
            </div>
          )}
        </div>
        <ScrollOverflowCue />
      </div>
    </>,
    document.body,
  );
}
