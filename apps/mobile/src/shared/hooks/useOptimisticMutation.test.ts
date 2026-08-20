import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOptimisticMutationLifecycle,
  optimisticPatch,
  type OptimisticMutationOptions,
} from "./useOptimisticMutation";

type Counter = { value: number };
type Variables = { by: number };

const COUNTER_KEY = ["test", "counter"] as const;

describe("createOptimisticMutationLifecycle", () => {
  let queryClient: QueryClient;
  let pushToast: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.fn>;
  let announce: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pushToast = vi.fn();
    notify = vi.fn();
    announce = vi.fn();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(COUNTER_KEY, { value: 1 });
  });

  function build(overrides?: Partial<OptimisticMutationOptions<string, Variables>>) {
    const options: OptimisticMutationOptions<string, Variables> = {
      mutationFn: async () => "ok",
      patches: [
        optimisticPatch<Counter, Variables>(COUNTER_KEY, (previous, variables) =>
          previous ? { value: previous.value + variables.by } : previous,
        ),
      ],
      successToast: { tone: "success", message: "Saved" },
      errorToast: { title: "Could not save", fallbackMessage: "Try again." },
      announceOnSuccess: "Counter saved",
      ...overrides,
    };

    return createOptimisticMutationLifecycle(options, {
      queryClient,
      pushToast,
      notify,
      announce,
    });
  }

  it("writes the optimistic value and returns a snapshot of what it replaced", async () => {
    const lifecycle = build();

    const context = await lifecycle.onMutate({ by: 5 });

    expect(queryClient.getQueryData(COUNTER_KEY)).toEqual({ value: 6 });
    expect(context.snapshots).toEqual([{ queryKey: COUNTER_KEY, previous: { value: 1 } }]);
  });

  it("cancels in-flight queries before writing, so a landing refetch cannot clobber the patch", async () => {
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries");
    const setQueryData = vi.spyOn(queryClient, "setQueryData");
    const lifecycle = build();

    await lifecycle.onMutate({ by: 1 });

    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: COUNTER_KEY });
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      setQueryData.mock.invocationCallOrder[0],
    );
  });

  it("restores the exact previous value on failure", async () => {
    const lifecycle = build();
    const context = await lifecycle.onMutate({ by: 5 });
    expect(queryClient.getQueryData(COUNTER_KEY)).toEqual({ value: 6 });

    lifecycle.onError(new Error("boom"), { by: 5 }, context);

    expect(queryClient.getQueryData(COUNTER_KEY)).toEqual({ value: 1 });
    expect(notify).toHaveBeenCalledWith("error");
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error", title: "Could not save" }),
    );
  });

  it("rolls back to undefined when there was no cached value to begin with", async () => {
    queryClient.removeQueries({ queryKey: COUNTER_KEY });
    const lifecycle = build({
      patches: [optimisticPatch<Counter, Variables>(COUNTER_KEY, () => ({ value: 99 }))],
    });

    const context = await lifecycle.onMutate({ by: 1 });
    expect(queryClient.getQueryData(COUNTER_KEY)).toEqual({ value: 99 });

    lifecycle.onError(new Error("boom"), { by: 1 }, context);

    expect(queryClient.getQueryData(COUNTER_KEY)).toBeUndefined();
  });

  it("toasts, announces and fires a success haptic", async () => {
    const lifecycle = build();

    await lifecycle.onSuccess("ok", { by: 1 });

    expect(notify).toHaveBeenCalledWith("success");
    expect(pushToast).toHaveBeenCalledWith({ tone: "success", message: "Saved" });
    expect(announce).toHaveBeenCalledWith("Counter saved");
  });

  it("lets server truth win by invalidating patched keys once settled", () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const lifecycle = build({ invalidateKeys: [["test", "related"]] });

    lifecycle.onSettled("ok", null, { by: 1 });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: COUNTER_KEY });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["test", "related"] });
  });

  it("reconciles even when the mutation failed", () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const lifecycle = build();

    lifecycle.onSettled(undefined, new Error("boom"), { by: 1 });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: COUNTER_KEY });
  });

  it("supports patches derived from the variables", async () => {
    const lifecycle = build({
      patches: (variables) => [
        optimisticPatch<Counter, Variables>(["test", "counter", variables.by], () => ({
          value: variables.by,
        })),
      ],
    });

    await lifecycle.onMutate({ by: 7 });

    expect(queryClient.getQueryData(["test", "counter", 7])).toEqual({ value: 7 });
    // The statically-keyed entry is untouched.
    expect(queryClient.getQueryData(COUNTER_KEY)).toEqual({ value: 1 });
  });

  it("skips haptics when asked", async () => {
    const lifecycle = build({ haptics: false });

    await lifecycle.onSuccess("ok", { by: 1 });

    expect(notify).not.toHaveBeenCalled();
  });

  it("touches nothing when no patches are supplied", async () => {
    const lifecycle = build({ patches: undefined });

    const context = await lifecycle.onMutate({ by: 3 });

    expect(context.snapshots).toEqual([]);
    expect(queryClient.getQueryData(COUNTER_KEY)).toEqual({ value: 1 });
  });
});
