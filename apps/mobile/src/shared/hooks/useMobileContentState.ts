import { getMobileQueryContentState } from "../lib/query-state";
import { useSkeletonGate } from "./useSkeletonGate";

type ContentStateInput = {
  hasData: boolean;
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
};

type MobileContentState =
  | ({ kind: "loading" } & { showSkeleton: boolean })
  | Exclude<ReturnType<typeof getMobileQueryContentState>, { kind: "loading" }>;

/**
 * `getMobileQueryContentState` with the skeleton flash taken out.
 *
 * The pure function stays the source of truth for *which* state a screen is in;
 * this adds the only part that needs a clock, namely whether the loading state
 * has lasted long enough to be worth painting. Screens should branch on
 * `showSkeleton` rather than rendering a placeholder for every `loading`:
 *
 *     if (contentState.kind === "loading") {
 *       return contentState.showSkeleton ? <ListSkeleton rows={4} /> : null;
 *     }
 *
 * Realtime invalidation is the reason this matters beyond cold loads: a screen
 * whose `hasData` is derived from list length will otherwise flash its skeleton
 * every time an unrelated row changes.
 */
export function useMobileContentState(input: ContentStateInput): MobileContentState {
  const state = getMobileQueryContentState(input);
  const showSkeleton = useSkeletonGate(state.kind === "loading");

  if (state.kind === "loading") {
    return { kind: "loading", showSkeleton };
  }

  return state;
}
