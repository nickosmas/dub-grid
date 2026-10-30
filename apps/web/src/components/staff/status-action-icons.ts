import type { StatusAction } from "@dubgrid/domain";
import {
  Ban,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Plane,
  UserCheck,
  UserCog,
  UserMinus,
  type LucideIcon,
} from "lucide-react";

/** The confirmation icon for each staff status change, single or bulk. */
export const STATUS_ACTION_ICONS: Record<StatusAction, LucideIcon> = {
  markAway: Plane,
  archive: UserMinus,
  markActive: UserCheck,
  restore: UserCheck,
  reinstate: UserCheck,
  suspend: Ban,
  setSuspendedUntil: Ban,
  setReturnDate: CalendarDays,
  setPlannedChange: CalendarClock,
  cancelPlannedChange: CalendarX2,
};

/** For the list of choices, before one is picked. */
export const STATUS_CHANGE_ICON: LucideIcon = UserCog;
