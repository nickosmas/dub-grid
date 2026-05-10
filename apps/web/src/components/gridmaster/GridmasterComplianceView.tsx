"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import {
  exportGridmasterAuditLog,
  fetchGridmasterCompliance,
} from "@/features/gridmaster/client";
import ConfirmDialog from "@/components/ConfirmDialog";
import { queryKeys } from "@/lib/query-keys";
import { sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import { describeAuditEvent } from "@/lib/activity-log-utils";
import { formatClientErrorMessage, formatDateTimeLabel } from "@/lib/client-facing";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ ...sectionStyle, padding: "14px 16px", flex: "1 1 170px" }}>
      <div style={{ fontSize: "var(--dg-fs-card-title)", fontWeight: 800, color: "var(--color-text-primary)", fontFamily: "var(--font-dm-mono), monospace" }}>{value}</div>
      <div style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 700, color: "var(--color-text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function GridmasterComplianceView({ onSelectOrg }: { onSelectOrg: (orgId: string) => void }) {
  const [exporting, setExporting] = useState(false);
  const [exportConfirm, setExportConfirm] = useState(false);
  const complianceQuery = useQuery({
    queryKey: queryKeys.gridmaster.compliance(),
    queryFn: fetchGridmasterCompliance,
    staleTime: 30_000,
  });
  const compliance = complianceQuery.data;

  async function handleExportHighRisk() {
    setExporting(true);
    try {
      const result = await exportGridmasterAuditLog({ highRiskOnly: true, limit: 1000 });
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dubgrid-high-risk-audit-${result.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.rowCount} audit entries`);
    } catch (err: unknown) {
      toast.error(formatClientErrorMessage(err, "We couldn't export audit entries right now."));
    } finally {
      setExporting(false);
      setExportConfirm(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: "var(--dg-fs-heading)", fontWeight: 700, color: "var(--color-text-primary)" }}>
          Compliance Oversight
        </h2>
        <button className="dg-btn dg-btn-secondary" onClick={() => setExportConfirm(true)} disabled={exporting}>
          <Upload size={16} />
          {exporting ? "Exporting..." : "Export High-Risk Audit"}
        </button>
      </div>

      {complianceQuery.error instanceof Error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: "var(--dg-radius-lg)", fontSize: "var(--dg-fs-label)", fontWeight: 600, marginBottom: 16 }}>
          {formatClientErrorMessage(complianceQuery.error, "We couldn't load compliance oversight right now.")}
        </div>
      )}

      {complianceQuery.isLoading || !compliance ? (
        <div style={sectionStyle}>
          <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>Loading compliance evidence...</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <Stat label="Terms Acceptances" value={compliance.termsAcceptanceCount} />
            <Stat label="Cookie Consents" value={compliance.cookieConsentCount} />
            <Stat label="Pending Profile Requests" value={compliance.pendingProfileChangeRequestCount} />
            <Stat label="Retention Risk" value={compliance.dataRetentionRisk.length} />
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            <div style={sectionStyle}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)", fontWeight: 800, color: "var(--color-text-primary)" }}>Data Retention</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={thStyle}>Organization</th><th style={thStyle}>Retention Days</th></tr></thead>
                  <tbody>
                    {compliance.orgRetention.map((org) => (
                      <tr key={org.orgId} onClick={() => onSelectOrg(org.orgId)} style={{ cursor: "pointer", background: org.dataRetentionDays > 365 ? "var(--color-warning-bg)" : undefined }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{org.orgName}</td>
                        <td style={tdStyle}>{org.dataRetentionDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", fontSize: "var(--dg-fs-label)", fontWeight: 800, color: "var(--color-text-primary)" }}>Recent Compliance Events</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={thStyle}>Action</th><th style={thStyle}>Actor</th><th style={thStyle}>Created</th></tr></thead>
                  <tbody>
                    {[...compliance.gdprEvents, ...compliance.accountDeletionEvents].map((event) => (
                      <tr key={`${event.action}-${event.id}`}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{describeAuditEvent(event.action, event.details)}</td>
                        <td style={tdStyle}>{event.actorEmail ?? event.actorId ?? "—"}</td>
                        <td style={tdStyle}>{formatDateTimeLabel(event.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
      {exportConfirm && (
        <ConfirmDialog
          title="Export High-Risk Audit"
          message="Export up to 1,000 high-risk activity records?"
          confirmLabel="Export"
          variant="warning"
          isLoading={exporting}
          onConfirm={handleExportHighRisk}
          onCancel={() => setExportConfirm(false)}
        />
      )}
    </>
  );
}
