"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import { ButtonLoading } from "@/components/ButtonSpinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requireCredentialAssurance } from "@/features/account/client";
import { useStepUpAction } from "@/hooks/useStepUpAction";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { SectionNotice } from "@/components/ui/SectionNotice";
import { PersonActivityTimeline } from "@/components/activity/PersonActivityTimeline";
import {
  exportGridmasterPersonHistory,
  fetchGridmasterPersonHistory,
  type GridmasterPersonTarget,
} from "@/features/gridmaster/client";
import type { GridmasterPersonRecord } from "@/features/gridmaster/person-record";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "@/lib/audit/registry";
import { queryKeys } from "@/lib/query-keys";
import { PersonSection } from "./PersonField";

const ALL_CATEGORIES = Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[];

/**
 * Everything done by or to the person, across organizations and the platform,
 * fetched only once it is opened.
 */
export function PersonHistoryCard({
  target,
  record,
}: {
  target: GridmasterPersonTarget;
  record: GridmasterPersonRecord;
}) {
  const [open, setOpen] = useState(false);
  const [exportConfirm, setExportConfirm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const stepUp = useStepUpAction();
  const id = target.kind === "user" ? target.userId : target.employeeId;
  const query = useQuery({
    queryKey: queryKeys.gridmaster.personHistory(target.kind, id),
    queryFn: () => fetchGridmasterPersonHistory(target),
    enabled: open,
    staleTime: 30_000,
  });

  const organizations = useMemo(
    () => [
      ...record.organizations.map(({ org }) => ({ value: org.id, label: org.name })),
      { value: "none", label: "Platform (no organization)" },
    ],
    [record.organizations],
  );

  async function handleExport() {
    setExporting(true);
    try {
      await stepUp.run(async (accessToken) => {
        await requireCredentialAssurance(accessToken);
        const result = await exportGridmasterPersonHistory(target, accessToken);
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `dubgrid-person-history-${id}-${result.exportedAt.slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${result.rowCount} history entries`);
      });
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't export this history right now."));
    } finally {
      setExporting(false);
      setExportConfirm(false);
    }
  }

  return (
    <PersonSection
      title="History"
      description="Everything done by or to this person, in every organization and on the platform."
      actions={
        open ? (
          <Button
            className="dg-btn dg-btn-secondary"
            onClick={() => setExportConfirm(true)}
            disabled={exporting}
          >
            <ButtonLoading loading={exporting} spinnerSize={16} icon={<Upload size={16} />}>
              Export history
            </ButtonLoading>
          </Button>
        ) : undefined
      }
    >
      <Button
        className="dg-btn dg-btn-ghost dg-btn-sm self-start"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Hide history" : "Show history"}
      </Button>
      {open ? (
        <>
          {query.data?.truncated ? (
            <SectionNotice
              tone="warning"
              messages={[
                "This history is partial: at least one source has more rows than it reads. The platform audit log holds the rest.",
              ]}
            />
          ) : null}
          {query.isError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] text-[var(--dg-color-danger-text)]">
                {query.error instanceof Error
                  ? query.error.message
                  : "We couldn't load this history."}
              </p>
              <Button
                className="dg-btn dg-btn-secondary dg-btn-sm"
                onClick={() => void query.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <PersonActivityTimeline
              entries={query.data?.entries ?? []}
              loading={query.isPending}
              error={null}
              categories={ALL_CATEGORIES}
              organizations={organizations}
              emptyDescription="Nothing has been recorded by or about this person yet."
            />
          )}
        </>
      ) : null}
      {stepUp.dialog}
      {exportConfirm && !stepUp.dialog ? (
        <ConfirmDialog
          title="Export history"
          message="Download this person's whole history as a file? The export is recorded in the audit log."
          confirmLabel="Export"
          variant="warning"
          isLoading={exporting}
          onConfirm={handleExport}
          onCancel={() => setExportConfirm(false)}
        />
      ) : null}
    </PersonSection>
  );
}
