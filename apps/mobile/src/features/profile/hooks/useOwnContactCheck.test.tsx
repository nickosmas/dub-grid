import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkMobileOwnContact = vi.hoisted(() => vi.fn());

vi.mock("../../../shared/lib/api", () => ({ checkMobileOwnContact }));

import { useOwnContactCheck } from "./useOwnContactCheck";

type Props = { accessToken: string | null; email: string | null; phone: string | null };

function renderCheck(initial: Props) {
  return renderHook((props: Props) => useOwnContactCheck(props), { initialProps: initial });
}

async function settle(ms = 400) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useOwnContactCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkMobileOwnContact.mockReset().mockResolvedValue({ emailTaken: false, phoneTaken: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks nothing when there is nothing to check", async () => {
    const { result } = renderCheck({ accessToken: "token", email: null, phone: null });
    await settle();

    expect(checkMobileOwnContact).not.toHaveBeenCalled();
    expect(result.current).toEqual({ checking: false, emailTaken: false, phoneTaken: false });
  });

  it("waits for typing to pause, then reports what's taken", async () => {
    checkMobileOwnContact.mockResolvedValue({ emailTaken: true, phoneTaken: false });
    const { result } = renderCheck({
      accessToken: "token",
      email: "lee@example.com",
      phone: "415-555-0100",
    });

    expect(result.current.checking).toBe(true);
    await settle(399);
    expect(checkMobileOwnContact).not.toHaveBeenCalled();

    await settle(1);
    expect(checkMobileOwnContact).toHaveBeenCalledWith(
      "token",
      { email: "lee@example.com", phone: "415-555-0100" },
      expect.any(AbortSignal),
    );
    expect(result.current).toEqual({ checking: false, emailTaken: true, phoneTaken: false });
  });

  it("drops an answer for values you've since changed", async () => {
    let answerFirst: (value: { emailTaken: boolean; phoneTaken: boolean }) => void = () => {};
    checkMobileOwnContact.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerFirst = resolve;
        }),
    );
    const { result, rerender } = renderCheck({
      accessToken: "token",
      email: "lee@example.com",
      phone: null,
    });
    await settle();

    rerender({ accessToken: "token", email: "lena@example.com", phone: null });
    await act(async () => {
      answerFirst({ emailTaken: true, phoneTaken: false });
    });

    expect(result.current).toEqual({ checking: true, emailTaken: false, phoneTaken: false });
    await settle();
    expect(result.current).toEqual({ checking: false, emailTaken: false, phoneTaken: false });
  });

  it("treats a failed check as not taken, so it never blocks a save", async () => {
    checkMobileOwnContact.mockRejectedValue(new Error("offline"));
    const { result } = renderCheck({ accessToken: "token", email: "lee@example.com", phone: null });
    await settle();

    expect(result.current).toEqual({ checking: false, emailTaken: false, phoneTaken: false });
  });
});
