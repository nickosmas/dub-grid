import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

const useSessionState = vi.fn();
const useBootstrap = vi.fn();
const acceptCurrentTerms = vi.fn();
const handleExpiredMobileSession = vi.fn();
const invalidateQueries = vi.fn();
const setQueriesData = vi.fn();
const pushToast = vi.fn();

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState: (...args: unknown[]) => useSessionState(...args),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: (...args: unknown[]) => invalidateQueries(...args),
      setQueriesData: (...args: unknown[]) => setQueriesData(...args),
    }),
  };
});

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap: (...args: unknown[]) => useBootstrap(...args),
}));

vi.mock("../../../shared/lib/api", () => ({
  acceptCurrentTerms: (...args: unknown[]) => acceptCurrentTerms(...args),
}));

vi.mock("../../../shared/lib/auth-reset", () => ({
  handleExpiredMobileSession: (...args: unknown[]) => handleExpiredMobileSession(...args),
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast: (...args: unknown[]) => pushToast(...args) }),
}));

vi.mock("../lib/consent", () => ({
  getLegalUrls: () => ({
    privacy: "https://example.test/privacy",
    terms: "https://example.test/terms",
    cookies: "https://example.test/cookie-policy",
  }),
}));

import { TermsGate } from "./TermsGate";

function renderGate() {
  return render(
    <TermsGate>
      <div>app-content</div>
    </TermsGate>,
  );
}

describe("TermsGate", () => {
  beforeEach(() => {
    useSessionState.mockReset();
    useBootstrap.mockReset();
    acceptCurrentTerms.mockReset();
    handleExpiredMobileSession.mockReset();
    pushToast.mockReset();

    invalidateQueries.mockReset();
    invalidateQueries.mockResolvedValue(undefined);
    setQueriesData.mockReset();

    useSessionState.mockReturnValue({ accessToken: "token-123", isLoading: false });
    acceptCurrentTerms.mockResolvedValue({ acceptedCurrentTerms: true });
  });

  it("blocks with the acceptance sheet when the user is on an outdated terms version", () => {
    useBootstrap.mockReturnValue({ data: { acceptedCurrentTerms: false } });

    renderGate();

    expect(screen.getByText("We've updated our Terms")).toBeInTheDocument();
    expect(screen.getByText("app-content")).toBeInTheDocument();
  });

  it("stays out of the way once the current terms are accepted", () => {
    useBootstrap.mockReturnValue({ data: { acceptedCurrentTerms: true } });

    renderGate();

    expect(screen.queryByText("We've updated our Terms")).not.toBeInTheDocument();
  });

  // A loading or errored bootstrap must not gate — otherwise a network blip
  // strands the user behind a sheet whose only action needs the network.
  it("does not gate while bootstrap has not answered", () => {
    useBootstrap.mockReturnValue({ data: undefined });

    renderGate();

    expect(screen.queryByText("We've updated our Terms")).not.toBeInTheDocument();
  });

  // The sheet covers the entire app, so declining has to be reachable from
  // inside it — there is no profile screen to escape to underneath.
  it("lets a user who will not accept sign out instead", () => {
    useBootstrap.mockReturnValue({ data: { acceptedCurrentTerms: false } });

    renderGate();
    fireEvent.click(screen.getByText("Sign out"));

    expect(handleExpiredMobileSession).toHaveBeenCalled();
  });

  it("records acceptance and refreshes bootstrap", async () => {
    useBootstrap.mockReturnValue({ data: { acceptedCurrentTerms: false } });

    renderGate();
    fireEvent.click(screen.getByText("Accept and continue"));

    await waitFor(() => {
      expect(acceptCurrentTerms).toHaveBeenCalledWith("token-123");
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["mobile", "bootstrap"],
    });
    expect(setQueriesData).toHaveBeenCalledWith(
      { queryKey: ["mobile", "bootstrap"] },
      expect.any(Function),
    );
  });

  it("does not duplicate acceptance while the first request is active", async () => {
    let resolveAcceptance: ((value: { acceptedCurrentTerms: true }) => void) | undefined;
    acceptCurrentTerms.mockReturnValue(
      new Promise((resolve) => {
        resolveAcceptance = resolve;
      }),
    );
    useBootstrap.mockReturnValue({ data: { acceptedCurrentTerms: false } });

    renderGate();
    fireEvent.click(screen.getByText("Accept and continue"));
    fireEvent.click(screen.getByText("Accept and continue"));

    expect(acceptCurrentTerms).toHaveBeenCalledTimes(1);
    await act(async () => resolveAcceptance?.({ acceptedCurrentTerms: true }));
  });

  it("unlatches after acceptance even when the background refresh stalls", async () => {
    useBootstrap.mockReturnValue({ data: { acceptedCurrentTerms: false } });
    invalidateQueries.mockReturnValue(new Promise(() => undefined));

    renderGate();
    fireEvent.click(screen.getByText("Accept and continue"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Accept and continue" })).toBeEnabled();
    });
  });

  it("surfaces an inline error and keeps gating when acceptance fails", async () => {
    useBootstrap.mockReturnValue({ data: { acceptedCurrentTerms: false } });
    acceptCurrentTerms.mockRejectedValue(new Error("nope"));

    renderGate();
    fireEvent.click(screen.getByText("Accept and continue"));

    await waitFor(() => {
      expect(screen.getByText("We've updated our Terms")).toBeInTheDocument();
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
