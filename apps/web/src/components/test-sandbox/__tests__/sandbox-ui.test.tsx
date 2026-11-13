import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setUserViewActive = vi.fn();
const toastInfo = vi.fn();

vi.mock("@/hooks", () => ({
  setUserViewActive: (active: boolean) => setUserViewActive(active),
}));
vi.mock("sonner", () => ({ toast: { info: (...args: unknown[]) => toastInfo(...args) } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: null }) }));

import CreateSandboxDialog from "../CreateSandboxDialog";
import SandboxBanner from "../SandboxBanner";

const reload = vi.fn();
const originalLocation = window.location;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  vi.unstubAllGlobals();
  document.cookie = "dg-sandbox-ended=; path=/; max-age=0";
});

describe("CreateSandboxDialog", () => {
  it("asks before replacing a sandbox open elsewhere, then replaces it on confirm", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json(409, { code: "SANDBOX_OPEN_ELSEWHERE", error: "open elsewhere", startedAt: null }),
      )
      .mockResolvedValueOnce(json(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateSandboxDialog orgName="Calm Haven" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Enter sandbox" }));

    await screen.findByText("Replace your other sandbox?");
    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start here instead" }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      action: "enter",
      replaceExisting: true,
    });
    expect(setUserViewActive).toHaveBeenCalledWith(false);
  });
});

describe("SandboxBanner", () => {
  it("says once why the person is back in their organization", async () => {
    document.cookie = "dg-sandbox-ended=1; path=/";

    render(
      <QueryClientProvider client={new QueryClient()}>
        <SandboxBanner />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(toastInfo).toHaveBeenCalledTimes(1));
    expect(setUserViewActive).toHaveBeenCalledWith(false);
    expect(document.cookie).not.toContain("dg-sandbox-ended=1");
  });
});
