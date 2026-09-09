import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptTermsPage from "./page";

const replace = vi.fn();
const recordCurrentTermsAcceptance = vi.fn();
const signOutFromBrowser = vi.fn();
const toastError = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "calm-haven-user" }, isLoading: false }),
}));
vi.mock("@/hooks", () => ({
  useTermsAcceptanceStatus: () => ({
    data: { acceptedCurrentTerms: false },
    isLoading: false,
  }),
}));
vi.mock("@/features/account/client", () => ({
  recordCurrentTermsAcceptance: (...args: unknown[]) => recordCurrentTermsAcceptance(...args),
  signOutFromBrowser: (...args: unknown[]) => signOutFromBrowser(...args),
}));
vi.mock("@/components/auth/TermsAcceptanceCard", () => ({
  default: ({ onAccept, loading }: { onAccept: () => void; loading: boolean }) => (
    <button type="button" onClick={onAccept} disabled={loading}>
      Accept and continue
    </button>
  ),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AcceptTermsPage />
    </QueryClientProvider>,
  );
}

describe("AcceptTermsPage recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordCurrentTermsAcceptance.mockResolvedValue({ success: true });
    signOutFromBrowser.mockResolvedValue(undefined);
  });

  it("waits for a slow successful acceptance before navigating", async () => {
    let resolveAcceptance: ((value: { success: true }) => void) | undefined;
    recordCurrentTermsAcceptance.mockReturnValue(
      new Promise((resolve) => {
        resolveAcceptance = resolve;
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
    });
    expect(replace).not.toHaveBeenCalled();
    resolveAcceptance?.({ success: true });

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("uses safe recovery copy, re-enables retry, and prevents duplicate acceptance", async () => {
    let rejectAcceptance: ((error: unknown) => void) | undefined;
    recordCurrentTermsAcceptance.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectAcceptance = reject;
      }),
    );
    renderPage();
    const button = screen.getByRole("button", { name: "Accept and continue" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(recordCurrentTermsAcceptance).toHaveBeenCalledTimes(1));
    rejectAcceptance?.({ status: 503, message: "private provider detail" });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "DubGrid is temporarily unavailable. Please try again.",
      );
    });
    expect(screen.queryByText("private provider detail")).not.toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(signOutFromBrowser).not.toHaveBeenCalled();
  });
});
