import type { PublishedWindowState } from "@/lib/schedule-logic";
import { buildPublishedDateSet, getPublishedWindowState } from "@/lib/schedule-logic";

export type PublicationDateRange = {
  startDate: string;
  endDate: string;
  publishedAt?: string;
  publishedBy?: string;
};

export type PublicationRangeLoadState =
  | { status: "loading"; ranges: PublicationDateRange[] }
  | { status: "loaded"; ranges: PublicationDateRange[] }
  | { status: "error"; ranges: PublicationDateRange[] };

export function beginPublicationRangeLoad(
  ranges: PublicationDateRange[] = [],
): PublicationRangeLoadState {
  return { status: "loading", ranges };
}

export function completePublicationRangeLoad(
  ranges: PublicationDateRange[],
): PublicationRangeLoadState {
  return { status: "loaded", ranges };
}

export function failPublicationRangeLoad(
  ranges: PublicationDateRange[] = [],
): PublicationRangeLoadState {
  return { status: "error", ranges };
}

/**
 * A missing publication is meaningful only after the range request succeeds.
 * Loading and failed requests return null so callers cannot present them as an
 * unpublished schedule.
 */
export function getLoadedPublishedWindowState(
  state: PublicationRangeLoadState,
  dates: Date[],
): PublishedWindowState | null {
  if (state.status !== "loaded") return null;
  return getPublishedWindowState(dates, buildPublishedDateSet(state.ranges));
}
