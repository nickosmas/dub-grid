import { beforeEach, describe, expect, it, vi } from "vitest";

const afterCallbacks: Array<() => unknown> = [];
const dispatchNotificationEvent = vi.fn();

vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    afterCallbacks.push(callback);
  },
}));

vi.mock("./events", () => ({
  dispatchNotificationEvent: (...args: unknown[]) => dispatchNotificationEvent(...args),
}));

import { dispatchNotificationEventAfterResponse } from "./after-response";

describe("dispatchNotificationEventAfterResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
  });

  it("hands the dispatch to after() instead of sending it now", async () => {
    const event = {
      action: "shift_request_cancelled",
      orgId: "org-1",
      requestId: "req-1",
    } as const;

    dispatchNotificationEventAfterResponse("actor", event);

    expect(dispatchNotificationEvent).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(dispatchNotificationEvent).toHaveBeenCalledWith("actor", event);
  });
});
