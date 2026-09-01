"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Department, FocusArea, NamedItem } from "@/types";
import { Button } from "@/components/Button";
import {
  fetchPeopleProfileChangeRequests,
  resolvePeopleProfileChangeRequest,
  type ProfileChangeRequest,
} from "@/features/account/client";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import { extractErrorMessage } from "@/lib/error-handling";
import { queryKeys } from "@/lib/query-keys";
import { Inbox } from "lucide-react";
import { ButtonLoading } from "@/components/ButtonSpinner";

interface ReferenceItem {
  id: number;
  name: string;
  abbr?: string | null;
}

function formatRequestType(type: ProfileChangeRequest["type"]) {
  return type === "account_deletion" ? "Account deletion" : "Profile update";
}

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  employmentType: "Employment",
  certificationId: "Certification",
  focusAreaIds: "Focus areas",
  roleIds: "Roles",
  departmentIds: "Departments",
};

const STATUS_STYLES: Record<ProfileChangeRequest["status"], { label: string; className: string }> =
  {
    pending: {
      label: "Pending",
      className: "bg-[var(--dg-color-warning-bg)] text-[var(--dg-color-warning-text)]",
    },
    approved: {
      label: "Approved",
      className: "bg-[var(--dg-color-success-bg)] text-[var(--dg-color-success-text)]",
    },
    rejected: {
      label: "Rejected",
      className: "bg-[var(--dg-color-danger-bg)] text-[var(--dg-color-danger-text)]",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-[var(--dg-color-bg)] text-[var(--dg-color-text-muted)]",
    },
  };

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatEmploymentType(value: unknown): string {
  if (value === "part_time") return "Part-time";
  if (value === "full_time") return "Full-time";
  return formatPlainValue(value);
}

function formatPlainValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatPlainValue).join(", ") : "None";
  }
  return JSON.stringify(value);
}

function formatReferenceList(ids: unknown, items: ReferenceItem[]): string {
  if (!Array.isArray(ids) || ids.length === 0) return "None";
  return ids
    .map((id) => {
      const match = items.find((item) => item.id === id);
      return match?.name ?? match?.abbr ?? String(id);
    })
    .join(", ");
}

function formatReferenceValue(value: unknown, items: ReferenceItem[]): string {
  if (value === null || value === undefined || value === "") return "Not set";
  const match = items.find((item) => item.id === value);
  return match?.name ?? match?.abbr ?? String(value);
}

function formatFieldValue(field: string, value: unknown, references: RequestReferenceData): string {
  switch (field) {
    case "employmentType":
      return formatEmploymentType(value);
    case "certificationId":
      return formatReferenceValue(value, references.certifications);
    case "focusAreaIds":
      return formatReferenceList(value, references.focusAreas);
    case "roleIds":
      return formatReferenceList(value, references.roles);
    case "departmentIds":
      return formatReferenceList(value, references.departments);
    default:
      return formatPlainValue(value);
  }
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <div className="dg-type-field-title">{label}</div>
      <div className="mt-1 break-words text-[13px] text-[var(--dg-color-text-primary)]">
        {value || "Not recorded"}
      </div>
    </div>
  );
}

interface RequestReferenceData {
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  departments: Department[];
}

interface ProfileChangeRequestQueueProps extends RequestReferenceData {
  orgId: string;
}

function ProfileUpdateDetails({
  request,
  references,
}: {
  request: ProfileChangeRequest;
  references: RequestReferenceData;
}) {
  const changeKeys = Object.keys(request.requestedChanges);

  if (changeKeys.length === 0) {
    return (
      <div className="rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg)] p-3 text-[13px] text-[var(--dg-color-text-muted)]">
        No structured profile fields were included with this request.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border-light)]">
      <div className="dg-type-table-heading grid grid-cols-[1fr_1fr_1fr] bg-[var(--dg-color-bg)]">
        <div className="border-r border-[var(--dg-color-border-light)] px-3 py-2">Field</div>
        <div className="border-r border-[var(--dg-color-border-light)] px-3 py-2">Current</div>
        <div className="px-3 py-2">Requested</div>
      </div>
      {changeKeys.map((field) => (
        <div
          key={field}
          className="grid grid-cols-[1fr_1fr_1fr] border-t border-[var(--dg-color-border-light)] text-[13px]"
        >
          <div className="border-r border-[var(--dg-color-border-light)] px-3 py-2 font-semibold text-[var(--dg-color-text-primary)]">
            {FIELD_LABELS[field] ?? field}
          </div>
          <div className="border-r border-[var(--dg-color-border-light)] px-3 py-2 text-[var(--dg-color-text-muted)]">
            {formatFieldValue(field, request.currentValues[field], references)}
          </div>
          <div className="px-3 py-2 font-semibold text-[var(--dg-color-text-primary)]">
            {formatFieldValue(
              field,
              request.requestedChanges[field as keyof typeof request.requestedChanges],
              references,
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountDeletionDetails({ request }: { request: ProfileChangeRequest }) {
  return (
    <div className="rounded-[var(--dg-radius-md)] border border-[var(--dg-color-danger-border)] bg-[var(--dg-color-danger-bg)] p-3">
      <div className="text-[13px] font-semibold text-[var(--dg-color-danger-text)]">
        Account deletion request
      </div>
      <p className="m-0 mt-1 text-[13px] leading-5 text-[var(--dg-color-danger-text)]">
        Approving will permanently delete this user&apos;s account and remove them from your
        organization. This can&apos;t be undone.
      </p>
    </div>
  );
}

function RequestQueueSkeleton() {
  return (
    <>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="dg-card" aria-hidden>
          <div className="dg-card-header">
            <div className="flex flex-col gap-2">
              <div className="dg-skeleton" style={{ width: 140, height: 14, borderRadius: 4 }} />
              <div className="dg-skeleton" style={{ width: 200, height: 12, borderRadius: 4 }} />
            </div>
            <div className="dg-skeleton" style={{ width: 64, height: 18, borderRadius: 999 }} />
          </div>
          <div className="dg-card-body flex flex-col gap-3">
            <div className="grid gap-3 rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg)] p-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((__, j) => (
                <div key={j} className="flex flex-col gap-2">
                  <div className="dg-skeleton" style={{ width: 90, height: 10, borderRadius: 4 }} />
                  <div
                    className="dg-skeleton"
                    style={{ width: "80%", height: 12, borderRadius: 4 }}
                  />
                </div>
              ))}
            </div>
            <div className="dg-skeleton" style={{ width: "100%", height: 96, borderRadius: 8 }} />
            <div className="flex gap-2">
              <div className="dg-skeleton" style={{ width: 96, height: 32, borderRadius: 6 }} />
              <div className="dg-skeleton" style={{ width: 96, height: 32, borderRadius: 6 }} />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function ProfileChangeRequestQueue({
  orgId,
  focusAreas,
  certifications,
  roles,
  departments,
}: ProfileChangeRequestQueueProps) {
  const queryClient = useQueryClient();
  const [pendingResolution, setPendingResolution] = useState<{
    request: ProfileChangeRequest;
    action: "approve" | "reject";
  } | null>(null);
  const references = { focusAreas, certifications, roles, departments };

  const requestsQuery = useQuery({
    queryKey: queryKeys.org.peopleChangeRequests(orgId, "pending"),
    queryFn: async () => {
      const result = await fetchPeopleProfileChangeRequests(orgId, "pending");
      return result.requests;
    },
  });

  useEffect(() => {
    if (requestsQuery.isError) {
      toast.error(
        extractErrorMessage(
          requestsQuery.error,
          "We couldn't load profile requests. Refresh and try again.",
        ),
      );
    }
  }, [requestsQuery.isError, requestsQuery.error]);

  const requests = requestsQuery.data ?? [];
  const loading = requestsQuery.isPending;

  const resolveMutation = useMutation({
    mutationFn: (input: { requestId: string; action: "approve" | "reject" }) =>
      resolvePeopleProfileChangeRequest({
        orgId,
        requestId: input.requestId,
        action: input.action,
      }),
    onSuccess: (_, variables) => {
      queryClient.setQueryData<ProfileChangeRequest[]>(
        queryKeys.org.peopleChangeRequests(orgId, "pending"),
        (current) => (current ?? []).filter((request) => request.id !== variables.requestId),
      );
      setPendingResolution(null);
      toast.success(variables.action === "approve" ? "Request approved." : "Request rejected.");
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, "We couldn't resolve request. Try again."));
    },
  });

  const resolvingId = resolveMutation.isPending
    ? (resolveMutation.variables?.requestId ?? null)
    : null;

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="m-0 text-[length:var(--dg-type-page-title-size)] font-bold tracking-tight text-[var(--dg-color-text-primary)]">
          People requests
        </h1>
        <p className="mb-0 mt-1 text-[14px] text-[var(--dg-color-text-muted)]">
          Review profile updates and account deletion requests from regular users.
        </p>
      </div>

      <ProgressBar loading={loading} />

      {loading ? (
        <RequestQueueSkeleton />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Inbox size={28} />}
          heading="No pending people requests"
          description="Profile updates and account deletion requests from members will appear here for review."
        />
      ) : (
        requests.map((request) => (
          <div key={request.id} className="dg-card">
            <div className="dg-card-header">
              <div>
                <div className="dg-card-title">{formatRequestType(request.type)}</div>
                <div className="dg-card-subtitle">
                  {request.requesterName || request.requesterEmail || "Unknown user"}
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[length:var(--dg-type-badge-size)] font-medium uppercase ${STATUS_STYLES[request.status].className}`}
              >
                {STATUS_STYLES[request.status].label}
              </span>
            </div>
            <div className="dg-card-body flex flex-col gap-3">
              <div className="grid gap-3 rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg)] p-3 sm:grid-cols-3">
                <DetailRow label="Requester email" value={request.requesterEmail} />
                <DetailRow label="Submitted" value={formatDate(request.createdAt)} />
                <DetailRow label="Last updated" value={formatDate(request.updatedAt)} />
              </div>

              {request.type === "account_deletion" ? (
                <AccountDeletionDetails request={request} />
              ) : (
                <ProfileUpdateDetails request={request} references={references} />
              )}

              {request.requestNote ? (
                <div className="rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg)] p-3">
                  <div className="dg-type-field-title">Request note</div>
                  <p className="m-0 mt-1 whitespace-pre-wrap text-[13px] leading-5 text-[var(--dg-color-text-muted)]">
                    {request.requestNote}
                  </p>
                </div>
              ) : null}

              {request.resolverNote || request.resolvedAt || request.cancelledAt ? (
                <div className="rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg)] p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DetailRow label="Resolved at" value={formatDate(request.resolvedAt)} />
                    <DetailRow label="Cancelled at" value={formatDate(request.cancelledAt)} />
                  </div>
                  {request.resolverNote ? (
                    <p className="m-0 mt-3 whitespace-pre-wrap text-[13px] leading-5 text-[var(--dg-color-text-muted)]">
                      {request.resolverNote}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={resolvingId === request.id}
                  className="dg-btn dg-btn-primary dg-btn-sm"
                  onClick={() => setPendingResolution({ request, action: "approve" })}
                >
                  <ButtonLoading loading={resolvingId === request.id}>Approve</ButtonLoading>
                </Button>
                <Button
                  type="button"
                  disabled={resolvingId === request.id}
                  className="dg-btn dg-btn-secondary dg-btn-sm"
                  onClick={() => setPendingResolution({ request, action: "reject" })}
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        ))
      )}
      {pendingResolution ? (
        <ConfirmDialog
          title={
            pendingResolution.action === "approve"
              ? `Approve ${formatRequestType(pendingResolution.request.type)}?`
              : `Reject ${formatRequestType(pendingResolution.request.type)}?`
          }
          message={
            pendingResolution.request.type === "account_deletion" &&
            pendingResolution.action === "approve"
              ? "Permanently delete this user's account and remove them from your organization? This can't be undone."
              : pendingResolution.action === "approve"
                ? "Approve this profile change request and apply the requested updates?"
                : "Reject this request? The requester will not receive the requested changes."
          }
          confirmLabel={pendingResolution.action === "approve" ? "Approve" : "Reject"}
          variant={
            pendingResolution.request.type === "account_deletion" &&
            pendingResolution.action === "approve"
              ? "danger"
              : "warning"
          }
          isLoading={resolvingId === pendingResolution.request.id}
          onConfirm={() => {
            return resolveMutation.mutateAsync({
              requestId: pendingResolution.request.id,
              action: pendingResolution.action,
            });
          }}
          onCancel={() => {
            if (!resolvingId) setPendingResolution(null);
          }}
        />
      ) : null}
    </div>
  );
}
