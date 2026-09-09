import { QueryClient, QueryObserver, focusManager, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBootstrap = vi.fn();

vi.mock("../../../shared/lib/api", () => ({
  getBootstrap: (...args: unknown[]) => getBootstrap(...args),
}));

import { createBootstrapQueryOptions } from "./useBootstrap";

function tokenFor(userId: string, orgId: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: userId, org_id: orgId }),
    "signature",
  ].join(".");
}

describe("bootstrap recovery coordination", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    getBootstrap.mockReset();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Infinity },
      },
    });
    queryClient.mount();
    onlineManager.setOnline(false);
    focusManager.setFocused(false);
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
    onlineManager.setOnline(true);
    focusManager.setFocused(true);
  });

  it("coalesces a reconnect and foreground transition into one bootstrap request", async () => {
    let finishBootstrap: ((value: unknown) => void) | undefined;
    getBootstrap.mockReturnValue(
      new Promise((resolve) => {
        finishBootstrap = resolve;
      }),
    );
    const observer = new QueryObserver(
      queryClient,
      createBootstrapQueryOptions(tokenFor("user-1", "org-1")),
    );
    const unsubscribe = observer.subscribe(() => undefined);

    expect(observer.getCurrentResult().fetchStatus).toBe("paused");
    expect(getBootstrap).not.toHaveBeenCalled();

    onlineManager.setOnline(true);
    focusManager.setFocused(true);

    await vi.waitFor(() => {
      expect(getBootstrap).toHaveBeenCalledTimes(1);
    });

    finishBootstrap?.({});
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isFetching).toBe(false);
    });
    expect(getBootstrap).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
