"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { capitalizeFirst, DEFAULT_ORGANIZATION_LABELS, singularLabelNoun } from "@dubgrid/domain";
import { FileUp } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { Banner } from "@/components/ui/Banner";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { SpanTabs } from "@/components/ui/span-tabs";
import { EDITOR_ACTION_LABELS } from "@/components/ui/editor-action-labels";
import { useUnsavedChangesPrompt } from "@/components/ui/use-unsaved-changes-prompt";
import { InviteOptionBox } from "@/components/staff/InviteOptionBox";
import { useEmployees } from "@/hooks";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { downloadCsvFile } from "@/lib/export-csv";
import { formatDateKey } from "@/lib/utils";
import { inviteRoleOptions } from "@/features/employees/client/invite-on-save";
import {
  useInviteNewStaff,
  type InviteNewStaffResult,
} from "@/features/employees/client/use-invite-new-staff";
import {
  buildStaffImportTemplate,
  checkStaffImportRows,
  isCsvFileName,
  parseImportDate,
  parseStaffCsv,
  staffImportReason,
  STAFF_IMPORT_MAX_BYTES,
  STAFF_IMPORT_MAX_ROWS,
  type StaffImportLabels,
  type StaffImportRow,
  type StaffImportRowCheck,
} from "@/features/employees/staff-import";
import type { AdminPermissions, AssignableOrganizationRole, FocusArea, NamedItem } from "@/types";

type Step = "choose" | "check" | "done";
type RowFilter = "all" | "ready" | "blocked";

interface ImportOutcome {
  added: { rowNumber: number; id: string; email: string }[];
  refused: { rowNumber: number; name: string; reason: string }[];
  invites: InviteNewStaffResult | null;
}

interface BulkImportModalProps {
  orgId: string;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  /** A Super Admin or Gridmaster, who alone invites Admins and Super Admins. */
  canGrantElevatedRoles?: boolean;
  onClose: () => void;
  onImported: () => void;
}

const COUNT_NOUN = (count: number) => (count === 1 ? "person" : "people");

function displayDay(value: string): string {
  const date = parseImportDate(value);
  if (!date) return value;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function RowStatus({ check }: { check: StaffImportRowCheck }) {
  const { tone, title, detail } =
    check.status === "ready"
      ? { tone: "success" as const, title: "Ready", detail: check.note }
      : check.status === "similar"
        ? { tone: "warning" as const, title: check.issue.title, detail: check.issue.detail }
        : {
            tone: "danger" as const,
            title: check.issues[0]?.title ?? "Won't be added",
            detail: staffImportReason(check.issues),
          };
  return (
    <div className="flex items-start gap-2">
      <StatusIcon
        tone={tone}
        size={16}
        className={`dg-import-status-icon mt-px shrink-0 is-${tone}`}
      />
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        {detail ? (
          <div className="text-[12px] text-[var(--dg-color-text-muted)]">{detail}</div>
        ) : null}
      </div>
    </div>
  );
}

export function BulkImportModal({
  orgId,
  focusAreas,
  certifications,
  roles,
  focusAreaLabel = DEFAULT_ORGANIZATION_LABELS.focusArea,
  certificationLabel = DEFAULT_ORGANIZATION_LABELS.certification,
  roleLabel = DEFAULT_ORGANIZATION_LABELS.role,
  canGrantElevatedRoles = false,
  onClose,
  onImported,
}: BulkImportModalProps) {
  const labels: StaffImportLabels = useMemo(
    () => ({ focusArea: focusAreaLabel, certification: certificationLabel, role: roleLabel }),
    [focusAreaLabel, certificationLabel, roleLabel],
  );
  const references = useMemo(
    () => ({ focusAreas, certifications, roles }),
    [focusAreas, certifications, roles],
  );
  const roleOptions = inviteRoleOptions(canGrantElevatedRoles);

  const [step, setStep] = useState<Step>("choose");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<StaffImportRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [invite, setInvite] = useState(true);
  const [role, setRole] = useState<AssignableOrganizationRole>("user");
  const [adminPermissions, setAdminPermissions] = useState<AdminPermissions | null>(null);
  const [importing, setImporting] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const newStaffInvites = useInviteNewStaff(orgId);

  // Everyone in any status holds their name, email and phone, so all are checked.
  const { employees, inactiveEmployees, removedEmployees } = useEmployees(orgId);
  const existing = useMemo(
    () =>
      [...employees, ...inactiveEmployees, ...removedEmployees].map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone,
      })),
    [employees, inactiveEmployees, removedEmployees],
  );

  const checks = useMemo(
    () =>
      checkStaffImportRows(rows, {
        ...references,
        labels,
        existing,
        today: formatDateKey(new Date()),
      }),
    [rows, references, labels, existing],
  );
  const addable = checks.filter(
    (check): check is Exclude<StaffImportRowCheck, { status: "blocked" }> =>
      check.status !== "blocked",
  );
  const blockedCount = checks.length - addable.length;
  const invitable = addable.filter((check) => check.resolved.email).length;
  const inviting = invite && invitable > 0;
  const visible = checks.filter(
    (check) =>
      filter === "all" ||
      (filter === "blocked" ? check.status === "blocked" : check.status !== "blocked"),
  );

  const { requestClose, unsavedChangesDialog } = useUnsavedChangesPrompt({
    hasUnsavedChanges: step === "check" && rows.length > 0,
    onDiscard: onClose,
  });
  const handleRequestClose = useCallback(() => {
    if (importing) return false;
    return requestClose();
  }, [importing, requestClose]);

  const readFile = useCallback(
    (file: File) => {
      setFileError(null);
      if (!isCsvFileName(file.name)) {
        setFileError(`We couldn't read ${file.name}. Save it as a CSV file and choose it again.`);
        return;
      }
      if (file.size > STAFF_IMPORT_MAX_BYTES) {
        setFileError(`${file.name} is larger than 2 MB. Split it into smaller files.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parseStaffCsv(String(reader.result ?? ""), labels);
        if (!parsed.ok) {
          setFileError(parsed.error);
          return;
        }
        setFileName(file.name);
        setRows(parsed.rows);
        setFilter("all");
        setStep("check");
      };
      reader.onerror = () => setFileError(`We couldn't read ${file.name}. Choose it again.`);
      reader.readAsText(file);
    },
    [labels],
  );

  const backToChoose = () => {
    setStep("choose");
    setRows([]);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  async function handleImport() {
    if (addable.length === 0) return;
    setFileError(null);
    setImporting(true);
    try {
      const res = await fetch("/api/import/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, rows: addable.map((check) => check.row) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(formatClientErrorMessage(data?.error, "We couldn't import those people."));
      }
      const added = (data.added ?? []) as ImportOutcome["added"];
      const refusedHere = checks
        .filter(
          (check): check is Extract<StaffImportRowCheck, { status: "blocked" }> =>
            check.status === "blocked",
        )
        .map((check) => ({
          rowNumber: check.row.rowNumber,
          name: `${check.row.firstName} ${check.row.lastName}`.trim(),
          reason: staffImportReason(check.issues),
        }));
      const refused = [...refusedHere, ...((data.refused ?? []) as ImportOutcome["refused"])].sort(
        (a, b) => a.rowNumber - b.rowNumber,
      );
      if (added.length > 0) onImported();

      let invites: InviteNewStaffResult | null = null;
      if (invite && added.some((person) => person.email)) {
        invites = await newStaffInvites.inviteAddedPeople(
          added,
          added
            .filter((person) => person.email)
            .map((person) => ({
              email: person.email,
              role,
              ...(canGrantElevatedRoles && role === "admin" && adminPermissions
                ? { adminPermissions: { ...adminPermissions } }
                : {}),
            })),
        );
      }
      setOutcome({ added, refused, invites });
      setStep("done");
    } catch (error) {
      setFileError(
        error instanceof Error ? error.message : "We couldn't import those people. Try again.",
      );
    } finally {
      setImporting(false);
    }
  }

  const certificationColumn = capitalizeFirst(singularLabelNoun(certificationLabel));

  const chooseStep = (
    <div className="flex flex-col gap-5">
      {fileError ? (
        <Banner tone="danger" role="alert">
          {fileError}
        </Banner>
      ) : null}
      <button
        type="button"
        className={`dg-import-drop${dragActive ? " is-active" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const file = event.dataTransfer.files[0];
          if (file) readFile(file);
        }}
      >
        <FileUp
          size={32}
          strokeWidth={1.6}
          aria-hidden="true"
          className="text-[var(--dg-color-text-faint)]"
        />
        <span className="text-[14px] font-semibold text-[var(--dg-color-text-primary)]">
          Drop a CSV file here
        </span>
        <span className="text-[13px] text-[var(--dg-color-text-muted)]">
          or choose one from your computer
        </span>
        <span className="dg-btn dg-btn-secondary mt-1">Choose file</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        aria-label="Choose a CSV file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) readFile(file);
        }}
      />

      <div className="flex flex-col gap-2.5">
        <div className="text-[13px] font-semibold">What the file needs</div>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[18px] text-[13px] leading-[1.5] text-[var(--dg-color-text-secondary)]">
          <li>
            A first name, last name and at least one {singularLabelNoun(focusAreaLabel)} for each
            person, up to {STAFF_IMPORT_MAX_ROWS} people.
          </li>
          <li>
            Names that match your settings. Separate several {focusAreaLabel.toLowerCase()} or{" "}
            {roleLabel.toLowerCase()} with a semicolon (;).
          </li>
          <li>
            Optional: email, phone, {singularLabelNoun(certificationLabel)},{" "}
            {roleLabel.toLowerCase()}, employment, first day and notes.
          </li>
        </ul>
        <div className="mt-1.5 flex items-center justify-between gap-4 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border)] px-3.5 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="text-[13px] font-medium">Template</div>
            <div className="text-[12px] text-[var(--dg-color-text-muted)]">
              Every column, with two example rows using your own {focusAreaLabel.toLowerCase()},{" "}
              {certificationLabel.toLowerCase()} and {roleLabel.toLowerCase()}.
            </div>
          </div>
          <Button
            type="button"
            className="dg-btn dg-btn-secondary shrink-0"
            onClick={() =>
              downloadCsvFile(
                buildStaffImportTemplate(labels, references),
                "staff-import-template.csv",
              )
            }
          >
            Download template
          </Button>
        </div>
      </div>
    </div>
  );

  const checkStep = (
    <div className="flex min-h-0 flex-col gap-3.5">
      {fileError ? (
        <Banner tone="danger" role="alert">
          {fileError}
        </Banner>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SpanTabs<RowFilter>
          aria-label="Show rows"
          value={filter}
          onChange={setFilter}
          items={[
            {
              value: "all",
              label: "All",
              count: checks.length,
              countLabel: `${checks.length} rows`,
            },
            {
              value: "ready",
              label: "Ready",
              count: addable.length,
              countLabel: `${addable.length} rows`,
            },
            {
              value: "blocked",
              label: "Won't be added",
              count: blockedCount,
              countLabel: `${blockedCount} rows`,
            },
          ]}
        />
        <div className="text-[12px] text-[var(--dg-color-text-muted)]">
          Rows that won&apos;t be added are left out. Fix them in your file and choose it again.
        </div>
      </div>

      <div className="dg-import-table-wrap">
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-[var(--dg-color-text-muted)]">
            {filter === "blocked" ? "Every row can be added." : "No row can be added yet."}
          </div>
        ) : (
          <table className="dg-import-table">
            <thead>
              <tr>
                <th className="w-[52px]">Row</th>
                <th className="w-[210px]">Person</th>
                <th className="w-[160px]">{focusAreaLabel}</th>
                <th className="w-[104px]">{certificationColumn}</th>
                <th className="w-[110px]">{roleLabel}</th>
                <th className="w-[96px]">Employment</th>
                <th className="w-[104px]">First day</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((check) => {
                const { row } = check;
                return (
                  <tr key={row.rowNumber}>
                    <td className="dg-tabular-nums text-[var(--dg-color-text-faint)]">
                      {row.rowNumber}
                    </td>
                    <td>
                      <div className="truncate font-medium">
                        {`${row.firstName} ${row.lastName}`.trim() || "No name"}
                      </div>
                      <div
                        className={`truncate text-[12px] ${row.email ? "text-[var(--dg-color-text-muted)]" : "text-[var(--dg-color-text-faint)]"}`}
                      >
                        {row.email || "No email"}
                      </div>
                    </td>
                    <td>{row.focusAreaNames || "-"}</td>
                    <td>{row.certificationName || "-"}</td>
                    <td>{row.roleNames || "-"}</td>
                    <td>{row.employment || "Full-time"}</td>
                    <td className="dg-tabular-nums whitespace-nowrap">
                      {row.firstDay ? displayDay(row.firstDay) : "-"}
                    </td>
                    <td>
                      <RowStatus check={check} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {invitable > 0 ? (
        <InviteOptionBox
          label={`Invite everyone with an email (${invitable} of ${addable.length})`}
          checked={invite}
          onCheckedChange={setInvite}
          role={
            roleOptions.length > 1
              ? { value: role, options: roleOptions, onChange: setRole }
              : undefined
          }
          permissions={
            canGrantElevatedRoles && role === "admin"
              ? { value: adminPermissions, onChange: setAdminPermissions }
              : undefined
          }
        />
      ) : null}
    </div>
  );

  const doneStep = outcome ? (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-[var(--dg-radius-md)] border border-[var(--dg-color-border)] bg-[var(--dg-color-bg)] px-4 py-3.5">
        <StatusIcon
          tone={outcome.added.length > 0 ? "success" : "danger"}
          size={20}
          className={`dg-import-status-icon mt-px shrink-0 is-${outcome.added.length > 0 ? "success" : "danger"}`}
        />
        <div className="flex flex-col gap-0.5">
          <div className="text-[15px] font-semibold">
            {outcome.added.length > 0 ? (
              <>
                <span className="dg-tabular-nums">{outcome.added.length}</span>{" "}
                {COUNT_NOUN(outcome.added.length)} added
              </>
            ) : (
              "No one was added"
            )}
          </div>
          <InviteSummary result={outcome.invites} added={outcome.added.length} />
        </div>
      </div>

      {outcome.refused.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="text-[13px] font-semibold">
              <span className="dg-tabular-nums">{outcome.refused.length}</span>{" "}
              {outcome.refused.length === 1 ? "row wasn't" : "rows weren't"} added
            </div>
            <div className="text-[12px] text-[var(--dg-color-text-muted)]">
              Fix them in your file and import it again. People already added are skipped.
            </div>
          </div>
          <ul className="dg-import-refused">
            {outcome.refused.map((row) => (
              <li key={row.rowNumber}>
                <span className="dg-tabular-nums w-[52px] shrink-0 text-[var(--dg-color-text-faint)]">
                  Row {row.rowNumber}
                </span>
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="font-medium">{row.name || "No name"}</span>
                  <span className="text-[var(--dg-color-text-muted)]">{row.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  ) : null;

  const footer =
    step === "check" ? (
      <div className="flex items-center justify-between gap-4">
        <div className="text-[12px] text-[var(--dg-color-text-muted)]">
          {inviting
            ? invitable === 1
              ? "We email the person you invite a link to join."
              : `We email each of the ${invitable} people you invite a link to join.`
            : "Anyone you don't invite now can be invited from their page."}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="dg-btn dg-btn-secondary"
            disabled={importing}
            onClick={() => {
              if (handleRequestClose()) onClose();
            }}
          >
            {EDITOR_ACTION_LABELS.close}
          </Button>
          <Button
            type="button"
            className="dg-btn dg-btn-primary"
            disabled={importing || addable.length === 0}
            onClick={handleImport}
          >
            <ButtonLoading
              loading={importing}
              spinnerColor="var(--dg-color-text-inverse)"
              spinnerSize={16}
            >
              {inviting
                ? `Add ${addable.length} & invite ${invitable}`
                : `Add ${addable.length} ${COUNT_NOUN(addable.length)}`}
            </ButtonLoading>
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex justify-end">
        <Button
          type="button"
          className={`dg-btn ${step === "done" ? "dg-btn-primary" : "dg-btn-secondary"}`}
          onClick={onClose}
        >
          {step === "done" ? "Done" : EDITOR_ACTION_LABELS.close}
        </Button>
      </div>
    );

  return (
    <>
      <Modal
        title={
          step === "choose"
            ? "Import staff"
            : step === "check"
              ? "Check before adding"
              : "Import finished"
        }
        subtitle={
          step === "choose"
            ? `Add people from a CSV file, up to ${STAFF_IMPORT_MAX_ROWS} rows.`
            : `${fileName} · ${rows.length} ${rows.length === 1 ? "row" : "rows"}`
        }
        onBack={step === "check" && !importing ? backToChoose : undefined}
        onClose={onClose}
        onRequestClose={handleRequestClose}
        disableOverlayClose={importing}
        className={step === "check" ? "dg-modal--import-check" : "dg-modal--import"}
        footer={footer}
      >
        {step === "choose" ? chooseStep : step === "check" ? checkStep : doneStep}
      </Modal>
      {unsavedChangesDialog}
      {newStaffInvites.dialog}
    </>
  );
}

function InviteSummary({ result, added }: { result: InviteNewStaffResult | null; added: number }) {
  if (added === 0) {
    return (
      <div className="text-[13px] text-[var(--dg-color-text-muted)]">
        Every row needs a fix before it can be added.
      </div>
    );
  }
  const onPeople = "They're on People now.";
  if (!result) {
    return (
      <div className="text-[13px] text-[var(--dg-color-text-muted)]">
        {onPeople} Invite them from their page when you&apos;re ready.
      </div>
    );
  }
  if (result.status === "cancelled") {
    return (
      <div className="text-[13px] text-[var(--dg-color-text-muted)]">
        {onPeople} No invites were sent. Invite them from their page.
      </div>
    );
  }
  if (result.status === "error") {
    return (
      <div className="text-[13px] text-[var(--dg-color-text-muted)]">
        {onPeople} {result.message} Invite them from their page.
      </div>
    );
  }
  return (
    <div className="text-[13px] text-[var(--dg-color-text-muted)]">
      {result.sent > 0 ? (
        <>
          We emailed <span className="dg-tabular-nums">{result.sent}</span> of them a link to
          join.{" "}
        </>
      ) : null}
      {onPeople}
      {result.failed.length > 0
        ? ` We couldn't invite ${result.failed.join(", ")}. Invite ${result.failed.length === 1 ? "them" : "each"} from their page.`
        : ""}
    </div>
  );
}
