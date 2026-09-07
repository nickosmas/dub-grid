import {
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarOff,
  ChartColumnBig,
  CirclePlus,
  CircleUserRound,
  ClipboardList,
  Clock,
  CreditCard,
  FileCheck,
  Flag,
  History,
  LayoutDashboard,
  Lock,
  Monitor,
  Network,
  Settings,
  ShieldCheck,
  Table2,
  Tag,
  TriangleAlert,
  UserCog,
  UserPlus,
  Users,
  VenetianMask,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavIconProps {
  size?: number;
}

function makeIcon(Glyph: LucideIcon, defaultSize: number) {
  return function NavIcon({ size = defaultSize }: NavIconProps) {
    return <Glyph width={size} height={size} aria-hidden="true" />;
  };
}

/* ── Top navbar (default size 16) ─────────────────────────── */
export const DashboardIcon = makeIcon(LayoutDashboard, 16);
export const ScheduleIcon = makeIcon(CalendarDays, 16);
export const PeopleIcon = makeIcon(Users, 16);
export const ReportsIcon = makeIcon(ChartColumnBig, 16);
export const SettingsIcon = makeIcon(Settings, 16);

/* ── Settings sidebar (default size 16) ───────────────────── */
export const BuildingIcon = makeIcon(Building2, 16);
export const BillingIcon = makeIcon(CreditCard, 16);
export const LabelsIcon = makeIcon(Tag, 16);
export const DisplayIcon = makeIcon(Monitor, 16);
export const ShieldIcon = makeIcon(ShieldCheck, 16);
export const DepartmentsIcon = makeIcon(Network, 16);
export const ShiftsIcon = makeIcon(Clock, 16);
export const JobsIcon = makeIcon(Briefcase, 16);
export const AbsenceIcon = makeIcon(CalendarOff, 16);
export const CoverageIcon = makeIcon(Table2, 16);
export const AwardIcon = makeIcon(BadgeCheck, 16);
export const RolesIcon = makeIcon(UserPlus, 16);
export const IndicatorIcon = makeIcon(Flag, 16);
export const ActivityIcon = makeIcon(Zap, 16);
export const DangerIcon = makeIcon(TriangleAlert, 16);

/**
 * The solid twin of `DangerIcon`, for notices rather than navigation.
 *
 * Drawn by hand against the house rule of taking icons from lucide, because
 * lucide is a stroke set and ships no solid variant of anything - a 1.5px
 * outline reads as a thin scribble against a filled notice, where the glyph
 * has to carry as much weight as the fill behind it. `DangerIcon` stays the
 * outline: it sits in the settings sidebar beside a column of other outlines,
 * and a solid one there would be the odd one out.
 *
 * The bar and dot are cut out of the triangle by `evenodd` rather than painted
 * over it, so the glyph reads on any fill it is placed on.
 */
export function DangerIconSolid({ size = 16 }: NavIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
      />
    </svg>
  );
}

/* ── Account sidebar (default size 16) ────────────────────── */
export const ProfileIcon = makeIcon(CircleUserRound, 16);
export const NotificationsIcon = makeIcon(Bell, 16);
export const DataPrivacyIcon = makeIcon(Lock, 16);

/* ── Gridmaster sidebar (default size 16) ─────────────────── */
export const AuditLogIcon = makeIcon(ClipboardList, 16);
export const ComplianceIcon = makeIcon(FileCheck, 16);
export const BellIcon = makeIcon(Bell, 16);
export const HistoryIcon = makeIcon(History, 16);
export const UserGroupIcon = makeIcon(UserCog, 16);
export const ImpersonateIcon = makeIcon(VenetianMask, 16);
export const NewOrgIcon = makeIcon(CirclePlus, 16);
