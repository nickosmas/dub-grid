import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { checkDependenciesOrSay } from "./checkDependenciesOrSay";

describe("checkDependenciesOrSay", () => {
  beforeEach(() => toastError.mockReset());

  it("passes the check's result through", async () => {
    await expect(checkDependenciesOrSay(async () => ({ count: 2 }))).resolves.toEqual({
      count: 2,
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("says the check's own message when it fails", async () => {
    const result = await checkDependenciesOrSay(async () => {
      throw new Error("We couldn't check job dependencies. Try again.");
    });

    expect(result).toBeNull();
    expect(toastError).toHaveBeenCalledWith("We couldn't check job dependencies. Try again.");
  });

  it("says something plain when the network fails", async () => {
    await checkDependenciesOrSay(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(toastError).toHaveBeenCalledWith("We couldn't check what uses this. Try again.");
  });
});
