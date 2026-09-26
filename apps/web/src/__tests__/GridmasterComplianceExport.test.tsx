import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import GridmasterComplianceView from "@/components/gridmaster/GridmasterComplianceView";
import type { GridmasterComplianceSummary } from "@/types";

const stepUpRun = vi.fn();
const requireCredentialAssurance = vi.fn();
const exportGridmasterAuditLog = vi.fn();
const fetchGridmasterCompliance = vi.fn();

vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
}));
vi.mock("@/features/gridmaster/client", () => ({
  exportGridmasterAuditLog: (...args: unknown[]) => exportGridmasterAuditLog(...args),
  fetchGridmasterCompliance: () => fetchGridmasterCompliance(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const compliance: GridmasterComplianceSummary = {
  generatedAt: "2026-09-26T00:00:00.000Z",
  termsAcceptanceCount: 0,
  cookieConsentCount: 0,
  pendingProfileChangeRequestCount: 0,
  dataRetentionRisk: [],
  gdprEvents: [],
  accountDeletionEvents: [],
  impersonationEvidence: [],
  orgRetention: [],
};

const createObjectURL = vi.fn(() => "blob:audit-export");
const revokeObjectURL = vi.fn();
let anchorClick: ReturnType<typeof vi.spyOn>;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

async function exportHighRisk() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GridmasterComplianceView onSelectOrg={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText("Terms Acceptances");
  fireEvent.click(screen.getByRole("button", { name: "Export High-Risk Audit" }));
  fireEvent.click(await screen.findByRole("button", { name: "Export" }));
}

describe("Gridmaster compliance: high-risk audit export (41d3, F-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fetchGridmasterCompliance.mockResolvedValue(compliance);
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
    exportGridmasterAuditLog.mockResolvedValue({
      exportedAt: "2026-09-26T12:00:00.000Z",
      rowCount: 3,
      entries: [],
    });
  });

  afterEach(() => {
    anchorClick.mockRestore();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("exports with the assured token after the credential check, then downloads", async () => {
    await exportHighRisk();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Exported 3 audit entries"));
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(exportGridmasterAuditLog).toHaveBeenCalledWith(
      { highRiskOnly: true, limit: 1000 },
      "fresh-token",
    );
    expect(requireCredentialAssurance.mock.invocationCallOrder[0]).toBeLessThan(
      exportGridmasterAuditLog.mock.invocationCallOrder[0],
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const link = anchorClick.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("dubgrid-high-risk-audit-2026-09-26.json");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:audit-export");
  });

  it("exports and downloads nothing when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValue(false);

    await exportHighRisk();

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument(),
    );
    expect(exportGridmasterAuditLog).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Export High-Risk Audit" })).toBeEnabled();
  });

  it("downloads nothing when the credential check fails", async () => {
    requireCredentialAssurance.mockRejectedValue(new Error("Confirm it's you first."));

    await exportHighRisk();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(exportGridmasterAuditLog).not.toHaveBeenCalled();
    expect(anchorClick).not.toHaveBeenCalled();
  });
});
