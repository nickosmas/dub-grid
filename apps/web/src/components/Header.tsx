"use client";
import { ChevronDown, User } from "lucide-react";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { Button } from "@/components/Button";
import {
  DashboardIcon,
  ScheduleIcon,
  PeopleIcon,
  ReportsIcon,
  SettingsIcon,
  type NavIconProps,
} from "@/components/icons/NavIcons";
import {
  useClientFeatureFlags,
  useLogout,
  usePermissions,
  setUserViewActive,
  useMediaQuery,
  MOBILE,
  TABLET,
  HEADER_NARROW,
} from "@/hooks";
import { useAuth } from "@/components/AuthProvider";
import { fetchAccountIdentity } from "@/features/account/client";
import { fetchOrganizationBilling } from "@/features/billing/client";
import MobileNavSheet from "@/components/MobileNavSheet";
import { queryKeys } from "@/lib/query-keys";
import { getAvatarInitials } from "@/lib/utils";
import { getAvatarTypography, getAvatarTone } from "@dubgrid/design-tokens";
import * as Sentry from "@/lib/sentry";
import NotificationBell from "@/components/NotificationBell";
import ThemeToggleButton from "@/components/ThemeToggleButton";
import { MaybeHint } from "@/components/ui/hint";
import type { OrganizationBillingSummary } from "@/types";
import SandboxBanner from "@/components/test-sandbox/SandboxBanner";
import CreateSandboxDialog from "@/components/test-sandbox/CreateSandboxDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { exitSandbox } from "@/features/account/client";
import {
  getOrganizationBootstrapQueryPolicy,
  type OrganizationBootstrap,
} from "@/features/organization/client/api";

type NavIconComponent = React.ComponentType<NavIconProps>;

const NAV_ITEMS: { id: string; href: string; label: string; Icon: NavIconComponent }[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { id: "schedule", href: "/schedule", label: "Schedule", Icon: ScheduleIcon },
  { id: "people", href: "/people", label: "People", Icon: PeopleIcon },
  { id: "reports", href: "/reports", label: "Reports", Icon: ReportsIcon },
  { id: "settings", href: "/settings", label: "Settings", Icon: SettingsIcon },
];

const ROLE_LABELS: Record<string, string> = {
  gridmaster: "Gridmaster",
  super_admin: "Super Admin",
  admin: "Admin",
  scheduler: "Scheduler",
  supervisor: "Supervisor",
  user: "User",
};

type BillingNoticeTone = "info" | "warning" | "danger";

interface BillingNotice {
  label: string;
  compactLabel: string;
  ariaLabel: string;
  tone: BillingNoticeTone;
}

function formatHeaderBillingNotice(billing: OrganizationBillingSummary): BillingNotice | null {
  const { billingAccess } = billing;

  if (billingAccess.isLocked) {
    return {
      label: "Billing locked",
      compactLabel: "Locked",
      ariaLabel: "Billing locked",
      tone: "danger",
    };
  }

  if (billingAccess.state === "payment_attention_required") {
    return {
      label: "Billing attention",
      compactLabel: "Billing",
      ariaLabel: "Billing attention required",
      tone: "warning",
    };
  }

  if (billingAccess.state === "trial_grace") {
    return {
      label: "Trial in grace period",
      compactLabel: "Grace",
      ariaLabel: "Trial is in grace period",
      tone: "danger",
    };
  }

  // Trial clock has not started yet (no super_admin has signed in). Neutral,
  // not a misconfiguration warning.
  if (billingAccess.state === "trial_pending") {
    return {
      label: "Trial starting",
      compactLabel: "Trial",
      ariaLabel: "Trial is starting",
      tone: "info",
    };
  }

  const days = billingAccess.daysUntilTrialEnd;
  if (days == null) {
    return null;
  }

  if (days <= 0) {
    return {
      label: "Trial ends today",
      compactLabel: "Today",
      ariaLabel: "Trial ends today",
      tone: "danger",
    };
  }

  const tone: BillingNoticeTone = days <= 3 ? "danger" : days <= 7 ? "warning" : "info";
  const dayWord = days === 1 ? "day" : "days";
  return {
    label: `Trial ends in ${days} ${dayWord}`,
    compactLabel: `Trial ${days}d`,
    ariaLabel: `Trial ends in ${days} ${dayWord}`,
    tone,
  };
}

function HeaderBillingNotice({ orgId, compact = false }: { orgId: string; compact?: boolean }) {
  const billingQuery = useQuery({
    queryKey: queryKeys.org.billing(orgId),
    queryFn: () => fetchOrganizationBilling(orgId),
    staleTime: 30_000,
  });
  const notice = billingQuery.data ? formatHeaderBillingNotice(billingQuery.data) : null;

  if (!notice) return null;

  const colors =
    notice.tone === "danger"
      ? {
          bg: "var(--dg-color-danger-bg)",
          border: "var(--dg-color-danger-border)",
          text: "var(--dg-color-danger)",
        }
      : notice.tone === "warning"
        ? {
            bg: "var(--dg-color-warning-bg)",
            border: "var(--dg-color-warning-border)",
            text: "var(--dg-color-warning)",
          }
        : {
            bg: "var(--dg-color-info-bg)",
            border: "var(--dg-color-info-border)",
            text: "var(--dg-color-info-text)",
          };

  return (
    <Link
      href="/settings?section=org-billing"
      aria-label={notice.ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: compact ? 28 : 30,
        maxWidth: compact ? 112 : undefined,
        padding: compact ? "0 8px" : "0 10px",
        borderRadius: "9999px",
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        fontSize: "var(--dg-fs-caption)",
        fontWeight: 600,
        lineHeight: 1.3,
        textDecoration: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {compact ? notice.compactLabel : notice.label}
    </Link>
  );
}

const renderDrawerIcon = (id: string): React.ReactNode => {
  const item = NAV_ITEMS.find((i) => i.id === id);
  if (!item) return <span />;
  const Icon = item.Icon;
  return <Icon size={22} />;
};

/* ── Hamburger Icon ──────────────────────────────────────── */
function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="var(--dg-color-text-primary)"
      strokeWidth="1.8"
      strokeLinecap="round"
      style={{ transition: "transform 150ms ease" }}
    >
      {open ? (
        <>
          <line x1="4" y1="4" x2="16" y2="16" />
          <line x1="16" y1="4" x2="4" y2="16" />
        </>
      ) : (
        <>
          <line x1="3" y1="5" x2="17" y2="5" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="15" x2="17" y2="15" />
        </>
      )}
    </svg>
  );
}

/* ── Header ──────────────────────────────────────────────── */
interface HeaderProps {
  orgName?: string;
}

export default function Header({ orgName }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useLogout();
  const {
    orgId,
    isGridmaster,
    role,
    canViewStaff,
    canAccessSettings,
    canViewReports,
    isSuperAdmin,
    isImpersonating,
    isUserViewActive,
    actualLevel,
    isOnSchedule,
    isManagementUser,
  } = usePermissions();
  // Management-only, non-admin accounts (management department access, no
  // scheduled focus area) only get Schedule + People — see DashboardPageContent
  // for the matching redirect if they land on /dashboard directly.
  const isManagementOnlyUser = role === "user" && isManagementUser && !isOnSchedule;
  const isMobile = useMediaQuery(MOBILE);
  const isTablet = useMediaQuery(TABLET);
  // Wider than the tablet compaction (which the trial badge already survives
  // via its own `compact` prop) but still not enough room for the full row —
  // most visibly at 125%+ browser zoom on an ordinary desktop width. The
  // badge is the one element here that's least costly to drop entirely.
  const isHeaderNarrow = useMediaQuery(HEADER_NARROW);
  const featureFlags = useClientFeatureFlags();

  // The bell opens a preview of the inbox; on the inbox itself it is noise.
  const onAlertsPage = pathname.startsWith("/alerts");

  // Match each top-nav route explicitly. Routes like /profile and
  // /alerts aren't top-nav items and should leave every tab
  // un-highlighted — don't fall through to "schedule".
  const activeTab = pathname.startsWith("/dashboard")
    ? "dashboard"
    : pathname.startsWith("/schedule")
      ? "schedule"
      : pathname.startsWith("/people")
        ? "people"
        : pathname.startsWith("/reports")
          ? "reports"
          : pathname.startsWith("/settings")
            ? "settings"
            : "";

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    // A gridmaster has no organization of their own: on /profile the org tabs
    // would lead nowhere. They get the portal button instead. Impersonation
    // keeps the tabs, since that is the org view being inspected.
    if (isGridmaster && !isImpersonating) return false;
    if (item.id === "dashboard") return !isManagementOnlyUser;
    if (item.id === "schedule") return true;
    if (item.id === "people") return canViewStaff;
    if (item.id === "reports") {
      return featureFlags.reports && !isUserViewActive && (isSuperAdmin || canViewReports);
    }
    if (item.id === "settings") {
      return isGridmaster || isSuperAdmin || (role === "admin" && canAccessSettings);
    }
    return false;
  });

  const { user: authUser } = useAuth();
  const { resolvedTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [sandboxDialogOpen, setSandboxDialogOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [exitingForLogout, setExitingForLogout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);

  const sandboxBootstrapQuery = useQuery<OrganizationBootstrap>({
    queryKey: queryKeys.org.bootstrap(),
    ...getOrganizationBootstrapQueryPolicy(),
    enabled: Boolean(authUser),
  });
  const isInSandbox = sandboxBootstrapQuery.data?.org?.workspaceKind === "sandbox";
  const canOpenSandbox =
    Boolean(authUser) && !isImpersonating && !isUserViewActive && !isInSandbox && actualLevel >= 2;

  // Hydrate cached name from sessionStorage after mount
  useEffect(() => {
    const cached = sessionStorage.getItem("dg_user_name");
    if (cached) setUserName(cached);
  }, []);

  // NOTE: drawer is NOT auto-closed on route change — the drill-down
  // navigation needs the sheet to stay open while switching pages.

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    void (async () => {
      try {
        const identity = await fetchAccountIdentity();
        if (cancelled) return;
        const name = identity.displayName || authUser.email?.split("@")[0] || null;
        setUserName(name);
        if (name) sessionStorage.setItem("dg_user_name", name);
      } catch {
        if (cancelled) return;
        const fallbackName = authUser.email?.split("@")[0] || null;
        setUserName(fallbackName);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const displayName = userName || "Account";
  const initials = getAvatarInitials(userName, "?");
  // Seeded by auth user id, the same seed presence uses, so you appear to
  // yourself in the same color your team sees on the schedule grid.
  const avatarSeed = authUser?.id ?? "";
  const avatarTone = getAvatarTone(avatarSeed, resolvedTheme === "dark");
  const roleLabel = ROLE_LABELS[role] ?? "User";
  const canShowBillingNotice =
    Boolean(orgId) && !isUserViewActive && !isImpersonating && (isSuperAdmin || isGridmaster);

  const handleSignOut = useCallback(() => {
    // Always confirm before signing out — in sandbox mode the confirmation
    // also warns that it permanently discards the sandbox.
    setLogoutConfirmOpen(true);
  }, []);

  const handleConfirmSignOut = useCallback(() => {
    // signOut() hard-navigates to /goodbye?scope=local; the destination owns
    // the actual session teardown. No teardown happens here, so there's no
    // race with ProtectedRoute, no Supabase auth-lock contention, no need to
    // pre-clear view-as-user.
    signOut();
  }, [signOut]);

  const handleExitAndSignOut = useCallback(async () => {
    setExitingForLogout(true);
    try {
      // Destroy the sandbox before tearing down the session — afterwards the
      // request would be unauthenticated. If it fails we still sign out; the
      // next login wipes any leftover sandbox as a backstop.
      await exitSandbox();
    } catch (err) {
      Sentry.captureException(err);
    }
    signOut();
  }, [signOut]);

  const logoutConfirmDialog = logoutConfirmOpen ? (
    isInSandbox ? (
      <ConfirmDialog
        returnFocus={accountTriggerRef}
        title="Exit sandbox to sign out"
        message="You're in sandbox mode. Signing out will permanently discard your sandbox and all its changes."
        confirmLabel="Exit & sign out"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={exitingForLogout}
        onConfirm={handleExitAndSignOut}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    ) : (
      <ConfirmDialog
        returnFocus={accountTriggerRef}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="info"
        onConfirm={handleConfirmSignOut}
        onCancel={() => setLogoutConfirmOpen(false)}
      />
    )
  ) : null;

  /* ── Mobile Header ─────────────────────────────────────── */
  if (isMobile) {
    return (
      <>
        <SandboxBanner />
        {sandboxDialogOpen ? (
          <CreateSandboxDialog orgName={orgName} onClose={() => setSandboxDialogOpen(false)} />
        ) : null}
        {logoutConfirmDialog}
        <div
          style={{
            background: "var(--dg-color-surface)",
            padding: "0 var(--dg-page-gutter)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 56,
            borderBottom: "1px solid var(--dg-color-border)",
          }}
        >
          {/* Logo + Org Name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
            <DubGridLogo size={26} />
            {orgName && (
              <>
                <span
                  style={{
                    color: "var(--dg-color-border)",
                    fontSize: "var(--dg-fs-body)",
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  |
                </span>
                <MaybeHint content={orgName} side="bottom">
                  <span
                    style={{
                      color: "var(--dg-color-text-muted)",
                      fontSize: "var(--dg-fs-label)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {orgName}
                  </span>
                </MaybeHint>
              </>
            )}
          </div>

          {canShowBillingNotice && orgId && <HeaderBillingNotice orgId={orgId} compact />}

          <ThemeToggleButton appearance="header" />

          {/* Hamburger */}
          <Button
            onClick={() => setDrawerOpen((o) => !o)}
            ref={accountTriggerRef}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              background: "transparent",
              border: "none",
              borderRadius: "var(--dg-btn-radius)",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <HamburgerIcon open={drawerOpen} />
          </Button>
        </div>

        <MobileNavSheet
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          mainNavItems={visibleNavItems.map((item) => ({
            id: item.id,
            href: item.href,
            label: item.label,
            icon: renderDrawerIcon(item.id),
          }))}
          activeTab={activeTab}
          isGridmaster={isGridmaster}
          displayName={displayName}
          initials={initials}
          avatarTone={avatarTone}
          roleLabel={roleLabel}
          onSignOut={handleSignOut}
          isUserViewActive={isUserViewActive}
          actualLevel={actualLevel}
          isImpersonating={isImpersonating}
          onToggleUserView={() => setUserViewActive(!isUserViewActive)}
        />
      </>
    );
  }

  /* ── Desktop / Tablet Header ───────────────────────────── */
  return (
    <>
      <SandboxBanner />
      {sandboxDialogOpen ? (
        <CreateSandboxDialog orgName={orgName} onClose={() => setSandboxDialogOpen(false)} />
      ) : null}
      {logoutConfirmDialog}
      <div
        className="dg-app-header-desktop"
        style={{
          background: "var(--dg-color-surface)",
          // The logo sits on the canonical page gutter on every route, with no
          // per-route exceptions — every page's left content edge uses the same
          // token, so the logo never shifts as you navigate.
          paddingLeft: "var(--dg-page-gutter)",
          paddingRight: "var(--dg-page-gutter)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          borderBottom: "1px solid var(--dg-color-border)",
        }}
      >
        {/* Logo + Org Anchor */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexShrink: 0 }}>
          <DubGridLogo size={30} />
          {!isTablet && <DubGridWordmark fontSize={18} color="var(--dg-color-text-primary)" />}
          {orgName && (
            <>
              <span
                style={{
                  color: "var(--dg-color-border)",
                  fontSize: "var(--dg-fs-title)",
                  userSelect: "none",
                }}
              >
                |
              </span>
              <MaybeHint content={orgName} side="bottom">
                <span
                  style={{
                    color: "var(--dg-color-text-muted)",
                    fontSize: "var(--dg-fs-label)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: isTablet ? 112 : 200,
                  }}
                >
                  {orgName}
                </span>
              </MaybeHint>
            </>
          )}
        </div>

        {/* Nav Tabs */}
        <div
          style={{
            display: "flex",
            gap: isTablet ? 2 : 4,
            alignItems: "center",
            flex: 1,
            justifyContent: "center",
          }}
        >
          {visibleNavItems.map((item) => {
            const active = activeTab === item.id;
            const Icon = item.Icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`dg-nav-tab${active ? " active" : ""}`}
                style={{ paddingInline: isTablet ? 8 : 14 }}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}

          {isGridmaster && (
            <Button
              onClick={() => router.push("/gridmaster")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                border: "1px solid var(--dg-color-border)",
                color: "var(--dg-type-navigation-color)",
                borderRadius: "var(--dg-btn-radius)",
                padding: "5px 14px",
                fontSize: "var(--dg-type-navigation-size)",
                cursor: "pointer",
                fontWeight: "var(--dg-type-navigation-weight)",
                letterSpacing: "var(--dg-type-navigation-letter-spacing)",
                marginLeft: 8,
                fontFamily: "inherit",
                transition: "background 150ms ease, border-color 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--dg-color-bg-secondary)";
                e.currentTarget.style.borderColor = "var(--dg-color-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--dg-color-border)";
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Gridmaster
            </Button>
          )}
        </div>

        {/* Billing notice, theme, alerts */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {canShowBillingNotice && orgId && !isHeaderNarrow && (
            <HeaderBillingNotice orgId={orgId} compact={isTablet} />
          )}
          <ThemeToggleButton appearance="header" />
          {!isGridmaster && <NotificationBell hidden={onAlertsPage} />}
        </div>
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <Button
            onClick={() => setMenuOpen((o) => !o)}
            ref={accountTriggerRef}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: menuOpen ? "var(--dg-color-bg-secondary)" : "transparent",
              border: "1px solid " + (menuOpen ? "var(--dg-color-border)" : "transparent"),
              borderRadius: "var(--dg-btn-radius)",
              padding: isTablet ? 4 : "4px 8px 4px 4px",
              minHeight: 44,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              if (!menuOpen) {
                e.currentTarget.style.background = "var(--dg-color-bg-secondary)";
                e.currentTarget.style.borderColor = "var(--dg-color-border)";
              }
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "transparent";
              }
            }}
          >
            <div
              style={{
                ...getAvatarTypography(28),
                width: 28,
                height: 28,
                boxSizing: "border-box",
                borderRadius: "50%",
                background: avatarTone.backgroundColor,
                border: `1px solid ${avatarTone.borderColor}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: avatarTone.textColor,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            {!isTablet && (
              <>
                <div style={{ textAlign: "left", maxWidth: 120 }}>
                  <div
                    style={{
                      fontSize: "var(--dg-fs-caption)",
                      fontWeight: 600,
                      color: "var(--dg-color-text-primary)",
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--dg-fs-footnote)",
                      color: "var(--dg-color-text-muted)",
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {roleLabel}
                  </div>
                </div>
                <ChevronDown
                  size={12}
                  strokeWidth={2.5}
                  color="var(--dg-color-text-muted)"
                  style={{
                    flexShrink: 0,
                    transition: "transform 150ms ease",
                    transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </>
            )}
          </Button>

          {menuOpen && (
            <div
              className="dg-menu dg-profile-menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 200,
              }}
            >
              <Button
                className="dg-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/profile");
                }}
              >
                <User size={13} />
                Profile
              </Button>
              {canOpenSandbox && (
                <>
                  <div className="dg-menu-divider" />
                  <Button
                    type="button"
                    className="dg-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setSandboxDialogOpen(true);
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="9" y1="3" x2="15" y2="3" />
                      <path d="M10 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9.5V3" />
                      <line x1="7" y1="14" x2="17" y2="14" />
                    </svg>
                    Test sandbox
                  </Button>
                </>
              )}
              {actualLevel >= 2 && !isImpersonating && (
                <>
                  <div className="dg-menu-divider" />
                  <Button
                    className="dg-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setUserViewActive(!isUserViewActive);
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {isUserViewActive ? "Exit User View" : "View as User"}
                  </Button>
                </>
              )}
              <div className="dg-menu-divider" />
              <Button
                className="dg-menu-item dg-menu-item--danger"
                onClick={() => {
                  setMenuOpen(false);
                  handleSignOut();
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
