"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { exportGridmasterAuditLog, fetchGridmasterCompliance } from "@/features/gridmaster/client";
import { Button } from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import { queryKeys } from "@/lib/query-keys";
import { sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import { describeAuditEvent } from "@/lib/activity-log-utils";
import { formatClientErrorMessage, formatDateTimeLabel } from "@/lib/client-facing";
import { ButtonLoading } from "@/components/ButtonSpinner";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ ...sectionStyle, padding: "14px 16px", flex: "1 1 170px" }}>
      <div
        style={{
          fontSize: "var(--dg-fs-card-title)",
          fontWeight: 800,
          color: "var(--dg-color-text-primary)",
          fontFamily: "var(--font-dm-mono), monospace",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 700,
          color: "var(--dg-color-text-muted)",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ComplianceSkeleton() {
  return (
    <div aria-hidden>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              ...sectionStyle,
              padding: "14px 16px",
              flex: "1 1 170px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="dg-skeleton" style={{ width: 48, height: 22, borderRadius: 4 }} />
            <div className="dg-skeleton" style={{ width: 110, height: 10, borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 20 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} style={sectionStyle}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--dg-color-border-light)",
              }}
            >
              <div className="dg-skeleton" style={{ width: 140, height: 12, borderRadius: 4 }} />
            </div>
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} style={{ display: "flex", gap: 16 }}>
                  <div className="dg-skeleton" style={{ flex: 1, height: 12, borderRadius: 4 }} />
                  <div className="dg-skeleton" style={{ width: 80, height: 12, borderRadius: 4 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GridmasterComplianceView({
  onSelectOrg,
}: {
  onSelectOrg: (orgId: string) => void;
}) {
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--dg-fs-page-title)",
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
          }}
        >
          Compliance Oversight
        </h2>
        <Button
          className="dg-btn dg-btn-secondary"
          onClick={() => setExportConfirm(true)}
          disabled={exporting}
        >
          <ButtonLoading
            loading={exporting}
            loadingLabel="Exporting"
            spinnerSize={16}
            icon={<Upload size={16} />}
          >
            Export High-Risk Audit
          </ButtonLoading>
        </Button>
      </div>

      {complianceQuery.error instanceof Error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {formatClientErrorMessage(
            complianceQuery.error,
            "We couldn't load compliance oversight right now.",
          )}
        </div>
      )}

      <ProgressBar loading={complianceQuery.isLoading || !compliance} />

      {complianceQuery.isLoading || !compliance ? (
        <ComplianceSkeleton />
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <Stat label="Terms Acceptances" value={compliance.termsAcceptanceCount} />
            <Stat label="Cookie Consents" value={compliance.cookieConsentCount} />
            <Stat
              label="Pending Profile Requests"
              value={compliance.pendingProfileChangeRequestCount}
            />
            <Stat label="Retention Risk" value={compliance.dataRetentionRisk.length} />
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            <div style={sectionStyle}>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--dg-color-border-light)",
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 800,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                Data Retention
              </div>
              {compliance.orgRetention.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <EmptyState
                    size="compact"
                    icon={
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      </svg>
                    }
                    title="No retention data yet"
                    description="Organization retention configuration will appear here once set."
                  />
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Organization</th>
                        <th style={thStyle}>Retention Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compliance.orgRetention.map((org) => (
                        <tr
                          key={org.orgId}
                          onClick={() => onSelectOrg(org.orgId)}
                          style={{
                            cursor: "pointer",
                            background:
                              org.dataRetentionDays > 365
                                ? "var(--dg-color-warning-bg)"
                                : undefined,
                          }}
                        >
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{org.orgName}</td>
                          <td style={tdStyle}>{org.dataRetentionDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={sectionStyle}>
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--dg-color-border-light)",
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 800,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                Recent Compliance Events
              </div>
              {compliance.gdprEvents.length === 0 &&
              compliance.accountDeletionEvents.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <EmptyState
                    size="compact"
                    icon={
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    }
                    title="No compliance events"
                    description="GDPR and account deletion activity will appear here."
                  />
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Action</th>
                        <th style={thStyle}>Actor</th>
                        <th style={thStyle}>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...compliance.gdprEvents, ...compliance.accountDeletionEvents].map(
                        (event) => (
                          <tr key={`${event.action}-${event.id}`}>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>
                              {describeAuditEvent(event.action, event.details)}
                            </td>
                            <td style={tdStyle}>{event.actorEmail ?? "Unknown"}</td>
                            <td style={tdStyle}>{formatDateTimeLabel(event.createdAt)}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {exportConfirm && (
        <ConfirmDialog
          title="Export High-Risk Audit"
          message="Export up to 1,000 high-risk activity records?"
          confirmLabel="Export"
          confirmPendingLabel="Exporting"
          variant="warning"
          isLoading={exporting}
          onConfirm={handleExportHighRisk}
          onCancel={() => setExportConfirm(false)}
        />
      )}
    </>
  );
}
