import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePostLoginDestination } from "../shared";

const fetchTermsAcceptanceStatus = vi.fn();

vi.mock("@/features/account/client", () => ({
  fetchTermsAcceptanceStatus: (...args: unknown[]) => fetchTermsAcceptanceStatus(...args),
}));

describe("resolvePostLoginDestination", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes an accepted user to the dashboard", async () => {
    fetchTermsAcceptanceStatus.mockResolvedValue({ acceptedCurrentTerms: true });
    await expect(resolvePostLoginDestination()).resolves.toBe("/dashboard");
  });

  it("routes an unaccepted user through the Terms gate", async () => {
    fetchTermsAcceptanceStatus.mockResolvedValue({ acceptedCurrentTerms: false });
    await expect(resolvePostLoginDestination()).resolves.toBe("/accept-terms?next=%2Fdashboard");
  });

  it("does not bypass the Terms gate when status cannot be verified", async () => {
    const outage = Object.assign(new Error("Unavailable"), { status: 503 });
    fetchTermsAcceptanceStatus.mockRejectedValue(outage);
    await expect(resolvePostLoginDestination()).rejects.toBe(outage);
  });
});
