import type { MobileShiftRequest } from "@dubgrid/contracts";
import type { CountBadgeTone } from "../../dashboard/components/CountBadge";

/**
 * One label and one colour per request type, everywhere a request is listed.
 * The dashboard's approval queue and the Requests tab used to name the same
 * thing differently ("Time off" against "Calloff request"), so a request
 * looked like two kinds of thing depending on where it was met.
 */
export const REQUEST_TYPE_LABEL: Record<MobileShiftRequest["type"], string> = {
  pickup: "Pickup",
  swap: "Swap",
  calloff: "Time off",
};

export const REQUEST_TYPE_TONE: Record<MobileShiftRequest["type"], CountBadgeTone> = {
  pickup: "brand",
  swap: "success",
  calloff: "warning",
};
