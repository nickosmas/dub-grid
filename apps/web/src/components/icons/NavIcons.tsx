import React from "react";
import {
  Squares2X2Icon as DashboardOutline,
  CalendarIcon as CalendarOutline,
  UsersIcon as UsersOutline,
  ChartBarSquareIcon as ReportsOutline,
  Cog6ToothIcon as SettingsOutline,
  BuildingOffice2Icon as BuildingOutline,
  CreditCardIcon as BillingOutline,
  TagIcon as TagOutline,
  ComputerDesktopIcon as DisplayOutline,
  ShieldCheckIcon as ShieldOutline,
  TableCellsIcon as TableOutline,
  CheckBadgeIcon as CheckBadgeOutline,
  UserPlusIcon as UserPlusOutline,
  FlagIcon as FlagOutline,
  UserCircleIcon as UserCircleOutline,
  BoltIcon as BoltOutline,
  ExclamationTriangleIcon as WarningOutline,
  ClipboardDocumentListIcon as ClipboardListOutline,
  DocumentCheckIcon as DocumentCheckOutline,
  BellIcon as BellOutline,
  ClockIcon as ClockOutline,
  UserGroupIcon as UserGroupOutline,
  PlusCircleIcon as PlusCircleOutline,
  LockClosedIcon as LockOutline,
} from "@heroicons/react/24/outline";
import {
  Squares2X2Icon as DashboardSolid,
  CalendarIcon as CalendarSolid,
  UsersIcon as UsersSolid,
  ChartBarSquareIcon as ReportsSolid,
  Cog6ToothIcon as SettingsSolid,
  BuildingOffice2Icon as BuildingSolid,
  CreditCardIcon as BillingSolid,
  TagIcon as TagSolid,
  ComputerDesktopIcon as DisplaySolid,
  ShieldCheckIcon as ShieldSolid,
  TableCellsIcon as TableSolid,
  CheckBadgeIcon as CheckBadgeSolid,
  UserPlusIcon as UserPlusSolid,
  FlagIcon as FlagSolid,
  UserCircleIcon as UserCircleSolid,
  BoltIcon as BoltSolid,
  ExclamationTriangleIcon as WarningSolid,
  ClipboardDocumentListIcon as ClipboardListSolid,
  DocumentCheckIcon as DocumentCheckSolid,
  BellIcon as BellSolid,
  ClockIcon as ClockSolid,
  UserGroupIcon as UserGroupSolid,
  PlusCircleIcon as PlusCircleSolid,
  LockClosedIcon as LockSolid,
} from "@heroicons/react/24/solid";

export interface NavIconProps {
  size?: number;
  active?: boolean;
}

type HeroIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

function makeIcon(Outline: HeroIcon, Solid: HeroIcon, defaultSize: number) {
  return function NavIcon({ size = defaultSize, active = false }: NavIconProps) {
    const Component = active ? Solid : Outline;
    return <Component style={{ width: size, height: size }} aria-hidden="true" />;
  };
}

/* ── Top navbar (default size 16) ─────────────────────────── */
export const DashboardIcon = makeIcon(DashboardOutline, DashboardSolid, 16);
export const ScheduleIcon = makeIcon(CalendarOutline, CalendarSolid, 16);
export const PeopleIcon = makeIcon(UsersOutline, UsersSolid, 16);
export const ReportsIcon = makeIcon(ReportsOutline, ReportsSolid, 16);
export const SettingsIcon = makeIcon(SettingsOutline, SettingsSolid, 16);

/* ── Settings sidebar (default size 16) ───────────────────── */
export const BuildingIcon = makeIcon(BuildingOutline, BuildingSolid, 16);
export const BillingIcon = makeIcon(BillingOutline, BillingSolid, 16);
export const LabelsIcon = makeIcon(TagOutline, TagSolid, 16);
export const DisplayIcon = makeIcon(DisplayOutline, DisplaySolid, 16);
export const ShieldIcon = makeIcon(ShieldOutline, ShieldSolid, 16);
export const CalendarIcon = makeIcon(CalendarOutline, CalendarSolid, 16);
export const CoverageIcon = makeIcon(TableOutline, TableSolid, 16);
export const AwardIcon = makeIcon(CheckBadgeOutline, CheckBadgeSolid, 16);
export const RolesIcon = makeIcon(UserPlusOutline, UserPlusSolid, 16);
export const IndicatorIcon = makeIcon(FlagOutline, FlagSolid, 16);
export const ImpersonateIcon = makeIcon(UserCircleOutline, UserCircleSolid, 16);
export const ActivityIcon = makeIcon(BoltOutline, BoltSolid, 16);
export const DangerIcon = makeIcon(WarningOutline, WarningSolid, 16);

/* ── Account sidebar (default size 16) ────────────────────── */
export const ProfileIcon = makeIcon(UserCircleOutline, UserCircleSolid, 16);
export const NotificationsIcon = makeIcon(BellOutline, BellSolid, 16);
export const DataPrivacyIcon = makeIcon(LockOutline, LockSolid, 16);

/* ── Gridmaster sidebar (default size 16) ─────────────────── */
export const AuditLogIcon = makeIcon(ClipboardListOutline, ClipboardListSolid, 16);
export const ComplianceIcon = makeIcon(DocumentCheckOutline, DocumentCheckSolid, 16);
export const BellIcon = makeIcon(BellOutline, BellSolid, 16);
export const HistoryIcon = makeIcon(ClockOutline, ClockSolid, 16);
export const UserGroupIcon = makeIcon(UserGroupOutline, UserGroupSolid, 16);
export const NewOrgIcon = makeIcon(PlusCircleOutline, PlusCircleSolid, 16);
