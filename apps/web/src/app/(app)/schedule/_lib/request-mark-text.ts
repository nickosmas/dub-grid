import {
  describeRequestText,
  type RequestText,
  type ShiftChangeResolvers,
} from "@dubgrid/schedule-core";
import { publishedAtFormatter } from "@/components/schedule-grid/gridHelpers";
import type { ShiftRequest } from "@/types";
import type { RequestCellMark } from "./request-marks";

export type RequestMarkText = RequestText;

/**
 * The hover card and panel text for one waiting request as it touches one day.
 * The words live in `@dubgrid/schedule-core`, which the mobile request page
 * shares.
 */
export function describeRequestMark(args: {
  mark: RequestCellMark;
  request: ShiftRequest;
  resolvers: ShiftChangeResolvers;
  timeZone?: string | null;
}): RequestMarkText {
  const formatter = publishedAtFormatter(args.timeZone);
  return describeRequestText({
    mark: args.mark,
    request: args.request,
    resolvers: args.resolvers,
    formatAsked: (date) => formatter.format(date),
  });
}
