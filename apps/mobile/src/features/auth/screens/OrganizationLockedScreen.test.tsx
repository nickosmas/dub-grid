import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

const useQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
}));

const getOrgStatus = vi.fn();

vi.mock("../../../shared/lib/api", () => ({
  getOrgStatus: (...args: unknown[]) => getOrgStatus(...args),
}));

vi.mock("../../../shared/lib/env", () => ({
  getMobileEnvConfig: () => ({ apiBaseUrl: "https://app.dubgrid.com" }),
}));

import { OrganizationLockedScreen } from "./OrganizationLockedScreen";

const onRetry = vi.fn();
const onSignOut = vi.fn();

function mockStatus(data: unknown) {
  useQuery.mockReturnValue({ data, isLoading: false, error: null });
}

describe("OrganizationLockedScreen", () => {
  beforeEach(() => {
    useQuery.mockReset();
    getOrgStatus.mockReset();
    onRetry.mockReset();
    onSignOut.mockReset();
    mockStatus(undefined);
  });

  it("renders the fallback message with no extra detail when org-status hasn't resolved yet", () => {
    render(
      <OrganizationLockedScreen
        accessToken="token-123"
        message="Organization unavailable. Contact your organization administrator."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByText("Organization unavailable")).toBeInTheDocument();
    expect(screen.getByText("Contact your organization administrator.")).toBeInTheDocument();
    expect(screen.queryByText(/Grace period ends/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Manage billing on web")).not.toBeInTheDocument();
  });

  it("shows a suspended detail line when org-status reports suspended", () => {
    mockStatus({ state: "suspended", isLocked: true, trialGraceEndsAt: null, orgRole: "user" });

    render(
      <OrganizationLockedScreen
        accessToken="token-123"
        message="Organization unavailable. Contact your organization administrator."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    );

    expect(
      screen.getByText(
        "This organization is currently unavailable. Contact support if you need help.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the grace-period end date for a trial_grace org", () => {
    mockStatus({
      state: "trial_grace",
      isLocked: false,
      trialGraceEndsAt: "2026-05-15T00:00:00.000Z",
      orgRole: "admin",
    });

    render(
      <OrganizationLockedScreen
        accessToken="token-123"
        message="Organization unavailable."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByText(/Grace period ends/)).toBeInTheDocument();
  });

  it("shows a Manage billing on web button only for super_admins, and opens the billing URL", async () => {
    mockStatus({ state: "locked", isLocked: true, trialGraceEndsAt: null, orgRole: "super_admin" });
    // Billing opens in an in-app browser, so a locked org can be paid for
    // without leaving the app and losing the retry button behind it.
    const { openedUrls } = await import("../../../test/shims/expo-web-browser");
    openedUrls.length = 0;

    render(
      <OrganizationLockedScreen
        accessToken="token-123"
        message="Organization unavailable."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    );

    const billingButton = screen.getByText("Manage billing on web");
    fireEvent.click(billingButton);

    await waitFor(() => {
      expect(openedUrls.at(-1)?.url).toBe("https://app.dubgrid.com/settings?section=org-billing");
    });
  });

  it("does not show the billing button for non-super-admins", () => {
    mockStatus({ state: "locked", isLocked: true, trialGraceEndsAt: null, orgRole: "admin" });

    render(
      <OrganizationLockedScreen
        accessToken="token-123"
        message="Organization unavailable."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    );

    expect(screen.queryByText("Manage billing on web")).not.toBeInTheDocument();
  });

  it("calls onRetry and onSignOut when their buttons are pressed", () => {
    render(
      <OrganizationLockedScreen
        accessToken={null}
        message="Organization unavailable."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    );

    fireEvent.click(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Sign out"));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("does not query org-status when there is no access token", () => {
    render(
      <OrganizationLockedScreen
        accessToken={null}
        message="Organization unavailable."
        onRetry={onRetry}
        onSignOut={onSignOut}
      />,
    );

    expect(useQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});
