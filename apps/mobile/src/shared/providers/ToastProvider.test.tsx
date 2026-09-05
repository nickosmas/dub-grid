import { render, screen, waitFor } from "@testing-library/react";
import { act, useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

let isOffline = false;

vi.mock("./NetworkStateProvider", () => ({
  useNetworkStatus: () => ({ isOffline }),
}));

vi.mock("./NetworkRecoveryProvider", () => ({
  useNetworkRecovery: () => ({ isNetworkRecoveryActive: false }),
}));

import { ToastProvider, useToast } from "./ToastProvider";

/**
 * The exact shape every consumer uses: push from an effect that lists both the
 * error and `pushToast` as dependencies. It is what turned an unstable
 * `pushToast` into an unbounded loop.
 */
function ErrorReporter({ error, onPush }: { error: unknown; onPush: () => void }) {
  const { pushToast } = useToast();

  useEffect(() => {
    if (error) {
      onPush();
      pushToast({ tone: "error", title: "Could not load", message: "Something went wrong." });
    }
  }, [error, onPush, pushToast]);

  return null;
}

function IdentityProbe({ onRender }: { onRender: (isStable: boolean) => void }) {
  const { pushToast } = useToast();
  const firstRef = useRef(pushToast);

  onRender(pushToast === firstRef.current);

  return null;
}

function ManualPusher({ message }: { message: string }) {
  const { pushToast } = useToast();

  useEffect(() => {
    pushToast({ tone: "error", message });
  }, [message, pushToast]);

  return null;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    isOffline = false;
  });

  it("pushes one toast for a persistent error, not a stream", async () => {
    // The reported symptom: a non-network failure (a 403 or a 500) that stays
    // truthy produced an endless run of identical toasts, because pushing one
    // changed `pushToast`, which re-ran the effect that pushed it.
    const onPush = vi.fn();
    const error = new Error("boom");

    render(
      <ToastProvider>
        <ErrorReporter error={error} onPush={onPush} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("toast-notification")).toBeInTheDocument();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onPush).toHaveBeenCalledTimes(1);
  });

  it("does not re-render consumers when a toast comes and goes", async () => {
    // `pushToast` is the whole context value, so a stable identity means a toast
    // no longer re-renders every screen subscribed to it. A consumer that
    // renders once here is the proof — and the reason the loop is gone, since
    // the loop was those re-renders re-running the effects that push.
    const identities: boolean[] = [];

    render(
      <ToastProvider>
        <IdentityProbe onRender={(isStable) => identities.push(isStable)} />
        <ManualPusher message="Something went wrong." />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("toast-notification")).toBeInTheDocument();
    });

    expect(identities).toEqual([true]);
  });

  it("still drops toasts while offline, where the banner speaks for them", async () => {
    isOffline = true;

    render(
      <ToastProvider>
        <ErrorReporter error={new Error("boom")} onPush={() => {}} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("offline-toast")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("toast-notification")).not.toBeInTheDocument();
  });

  it("dedupes by key against the toast already on screen", async () => {
    function DoublePusher() {
      const { pushToast } = useToast();

      useEffect(() => {
        pushToast({ tone: "error", message: "Offline", dedupeKey: "net" });
        pushToast({ tone: "error", message: "Offline", dedupeKey: "net" });
      }, [pushToast]);

      return null;
    }

    render(
      <ToastProvider>
        <DoublePusher />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("toast-notification")).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("toast-notification")).toHaveLength(1);
  });
});
