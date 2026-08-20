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
