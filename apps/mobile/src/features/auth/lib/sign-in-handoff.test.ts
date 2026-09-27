import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginSignInHandoff,
  isSignInHandoffPending,
  useSignInHandoffPending,
} from "./sign-in-handoff";

describe("sign-in handoff", () => {
  const releases: Array<() => void> = [];
  const begin = () => {
    const release = beginSignInHandoff();
    releases.push(release);
    return release;
  };

  afterEach(() => {
    for (const release of releases.splice(0)) release();
  });

  it("is pending from begin until its release", () => {
    expect(isSignInHandoffPending()).toBe(false);

    const release = begin();
    expect(isSignInHandoffPending()).toBe(true);

    release();
    expect(isSignInHandoffPending()).toBe(false);
  });

  it("ignores a stale release once a newer handoff has begun", () => {
    const releaseFirst = begin();
    const releaseSecond = begin();

    releaseFirst();
    expect(isSignInHandoffPending()).toBe(true);

    releaseSecond();
    expect(isSignInHandoffPending()).toBe(false);
  });

  it("re-renders subscribers when the handoff begins and ends", () => {
    const { result } = renderHook(() => useSignInHandoffPending());
    expect(result.current).toBe(false);

    let release = () => {};
    act(() => {
      release = begin();
    });
    expect(result.current).toBe(true);

    act(() => release());
    expect(result.current).toBe(false);
  });
});
