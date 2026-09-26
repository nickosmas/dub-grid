import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

const useBootstrap = vi.fn();
const handleExpiredMobileSession = vi.fn();
const invalidateQueries = vi.fn();
const push = vi.fn();
let pathname = "/";

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState: () => ({ accessToken: "token-123", isLoading: false }),
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => invalidateQueries(...args),
  }),
}));
vi.mock("../hooks/useBootstrap", () => ({
  useBootstrap: (...args: unknown[]) => useBootstrap(...args),
}));
vi.mock("../../../shared/lib/auth-reset", () => ({
  handleExpiredMobileSession: (...args: unknown[]) => handleExpiredMobileSession(...args),
}));
vi.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => push(...args) },
  usePathname: () => pathname,
}));

import { TwoFactorReenrollGate } from "./TwoFactorReenrollGate";

const TITLE = "Set up two-factor again";

function renderGate() {
  return render(
    <TwoFactorReenrollGate>
      <div>app-content</div>
    </TwoFactorReenrollGate>,
  );
}

describe("TwoFactorReenrollGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/";
    invalidateQueries.mockResolvedValue(undefined);
  });

  it("holds the app after a reset and sends them to the two-factor screen", () => {
    useBootstrap.mockReturnValue({ data: { mfaReenrollRequired: true } });
    renderGate();

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Set up two-factor"));
    expect(push).toHaveBeenCalledWith("/(tabs)/profile/two-factor");
  });

  it("stands aside on the two-factor screen, and asks bootstrap again on leaving it", () => {
    useBootstrap.mockReturnValue({ data: { mfaReenrollRequired: true } });
    pathname = "/profile/two-factor";
    const { rerender } = renderGate();
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();

    pathname = "/profile/security";
    rerender(
      <TwoFactorReenrollGate>
        <div>app-content</div>
      </TwoFactorReenrollGate>,
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["mobile", "bootstrap"] });
  });

  it("lets them sign out instead", () => {
    useBootstrap.mockReturnValue({ data: { mfaReenrollRequired: true } });
    renderGate();
    fireEvent.click(screen.getByText("Sign out"));
    expect(handleExpiredMobileSession).toHaveBeenCalled();
  });

  it.each([
    ["no reset is pending", { mfaReenrollRequired: false }],
    ["bootstrap has not answered", undefined],
  ])("stays out of the way when %s", (_name, data) => {
    useBootstrap.mockReturnValue({ data });
    renderGate();
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    expect(screen.getByText("app-content")).toBeInTheDocument();
  });

  it("waits for the terms gate first", () => {
    useBootstrap.mockReturnValue({
      data: { mfaReenrollRequired: true, acceptedCurrentTerms: false },
    });
    renderGate();
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("stays down while bootstrap re-checks after enrollment", () => {
    let settle: () => void = () => {};
    invalidateQueries.mockReturnValue(new Promise<void>((resolve) => (settle = resolve)));
    useBootstrap.mockReturnValue({ data: { mfaReenrollRequired: true } });
    pathname = "/profile/two-factor";
    const { rerender } = renderGate();

    pathname = "/profile/security";
    rerender(
      <TwoFactorReenrollGate>
        <div>app-content</div>
      </TwoFactorReenrollGate>,
    );
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    settle();
  });
});
