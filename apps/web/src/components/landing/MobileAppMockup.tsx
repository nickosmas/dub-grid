/* ── Mobile companion app mockup ──────────────────────────────────────
   Pixel-faithful reproduction of the real DubGrid mobile app, built at the
   native iPhone 17 Pro Max logical resolution (440 × 956 pt) and rendered
   through a single `transform: scale()` so every interior value stays the
   exact React Native unit. Sources:
     · packages/design-tokens/src/index.ts         . Colour / type / radius
     · apps/mobile/src/shared/components/Screen.tsx . Screen wrapper, Card
     · apps/mobile/src/shared/components/Button.tsx . Buttons
     · apps/mobile/app/(tabs)/_layout.tsx           . Tab set, active tab
       (real bar is now Expo Router `NativeTabs` — OS-rendered, no literal
       icon size to match; the 28px custom icons here are an approximation)
     · apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx
     · apps/mobile/src/features/shift-requests/screens/RequestsScreen.tsx
     · apps/mobile/src/features/dashboard/screens/AdminHomeScreen.tsx
     · apps/mobile/src/features/dashboard/components/DashboardHeader.tsx,
       DashboardHeroCard.tsx, PeriodToggle.tsx, ActionQueueCard.tsx,
       CountBadge.tsx
   Phone 1. The admin/super_admin "Home" dashboard — period toggle, schedule
     health metrics, coverage by wings. Calm Haven seed data throughout.
   Phone 2. "My Schedule" (Me) with an in-progress (On Duty) hero shift.
   Phone 3. The shift-requests "Available" tab. ── */

import { Fragment } from "react";
import { useTheme } from "next-themes";
import {
  Home,
  Calendar,
  ArrowLeftRight,
  Users,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  Bell,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCheck,
  BarChart3,
} from "lucide-react";

/* ── colorTokens (design-tokens) ──
   Same light/dark values as `lightColorTokens`/`darkColorTokens` in
   packages/design-tokens, referenced here as CSS custom properties so the
   phone screens follow the page theme like every other landing mockup. ── */
const C = {
  background: "var(--color-bg)",
  surface: "var(--color-surface)",
  surfaceSecondary: "var(--color-bg-secondary)",
  surfaceMuted: "var(--color-row-alt)",
  border: "var(--color-border)",
  borderSubtle: "var(--color-border-light)",
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
  textMuted: "var(--color-text-muted)",
  textSubtle: "var(--color-text-subtle)",
  textInverse: "var(--color-text-inverse)",
  brand: "var(--color-brand)",
  brandSoft: "var(--color-brand-bg)",
  brandBorder: "var(--color-brand-border)",
  success: "var(--color-success)",
  successText: "var(--color-success-text)",
  successSoft: "var(--color-success-bg)",
  successBorder: "var(--color-success-border)",
  warning: "var(--color-warning)",
  warningText: "var(--color-warning-text)",
  warningSoft: "var(--color-warning-bg)",
  warningBorder: "var(--color-warning-border)",
  danger: "var(--color-danger)",
  dangerText: "var(--color-danger-text)",
  dangerSoft: "var(--color-danger-bg)",
  dangerBorder: "var(--color-danger-border)",
  shadow: "var(--color-shadow)",
  shadowStrong: "var(--color-shadow-strong)",
};

/* ── ScheduleScreen.tsx's ME_HERO_CARD_GRADIENT_LIGHT/_DARK + matching
   shadow — the "On Duty" hero card is the one place the real app swaps a
   literal (non-token) color set between themes, so it needs its own JS
   theme read rather than a CSS var. ── */
function useMockupIsDark(): boolean {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark";
}

const ME_HERO_GRADIENT_LIGHT =
  "linear-gradient(to top right, #142579 0%, #2C49CC 55%, #6E90FF 100%)";
const ME_HERO_GRADIENT_DARK =
  "linear-gradient(to top right, #0A1442 0%, #1D3AA0 55%, #2075FF 100%)";
const ME_HERO_SHADOW_LIGHT = "rgba(37, 99, 235, 0.3)";
const ME_HERO_SHADOW_DARK = "rgba(32, 117, 255, 0.28)";

/* ── mobileTypographyTokens.text, restated as CSS ── the token itself carries
   { fontSize, lineHeight, fontFamily }, since DM Sans is four single-weight
   files on mobile. Here it's one webfont, so the family's weight becomes a
   plain numeric `fontWeight`. ── */
const heroMetric = { fontSize: 24, lineHeight: "30px", fontWeight: 700 };
const sectionTitle = { fontSize: 16, lineHeight: "22px", fontWeight: 700 };
const rowTitle = { fontSize: 15, lineHeight: "21px", fontWeight: 600 };
const body = { fontSize: 14, lineHeight: "21px", fontWeight: 400 };
const bodyStrong = { fontSize: 14, lineHeight: "21px", fontWeight: 600 };
const label = { fontSize: 12, lineHeight: "16px", fontWeight: 600 };
const caption = { fontSize: 12, lineHeight: "16px", fontWeight: 400 };
const badge = { fontSize: 11, lineHeight: "14px", fontWeight: 700 };
const micro = { fontSize: 10, lineHeight: "12px", fontWeight: 600 };

/* ── iPhone 17 Pro Max — 440 × 956 logical points ── */
const SCREEN_W = 440;
const SCREEN_H = 956;
const BEZEL = 12;
const SCALE = 0.6;

/* ─────────────────────────────────────────────────────────────────────
   Bottom tab bar. App/(tabs)/_layout.tsx NativeTabs
   ───────────────────────────────────────────────────────────────────── */
const TABS = [
  { label: "Home", Icon: Home },
  { label: "Schedule", Icon: Calendar },
  { label: "Requests", Icon: ArrowLeftRight },
  { label: "People", Icon: Users },
  { label: "Profile", Icon: UserCircle },
];

function TabBar({ active }: { active: string }) {
  return (
    <div style={{ background: C.surface, flexShrink: 0 }}>
      <div
        style={{
          display: "flex",
          borderTop: `1px solid ${C.shadow}`,
          paddingTop: 10,
        }}
      >
        {TABS.map(({ label: tabLabel, Icon }) => {
          const on = tabLabel === active;
          return (
            <div
              key={tabLabel}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon size={28} color={on ? C.brand : C.textSubtle} strokeWidth={on ? 2.4 : 2} />
              {/* labelStyle: fontSize 11, fontWeight 600 default / 700 selected */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: on ? 700 : 600,
                  color: on ? C.brand : C.textSubtle,
                }}
              >
                {tabLabel}
              </span>
            </div>
          );
        })}
      </div>
      {/* iOS home indicator */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          paddingTop: 10,
          paddingBottom: 9,
        }}
      >
        <div
          style={{
            width: 144,
            height: 5,
            borderRadius: 3,
            background: C.textPrimary,
          }}
        />
      </div>
    </div>
  );
}

/* ── iOS status bar + Dynamic Island (iPhone 17 Pro Max safe area ~62pt) ── */
function StatusBar() {
  return (
    <div
      style={{
        height: 62,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 600, color: C.textPrimary }}>9:41</span>
      <div
        style={{
          position: "absolute",
          top: 13,
          left: "50%",
          transform: "translateX(-50%)",
          width: 126,
          height: 37,
          borderRadius: 19,
          background: "#0A0A0C",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="19" height="12" viewBox="0 0 19 12" fill={C.textPrimary}>
          <rect x="0" y="8" width="3.4" height="4" rx="1" />
          <rect x="5.2" y="5.5" width="3.4" height="6.5" rx="1" />
          <rect x="10.4" y="3" width="3.4" height="9" rx="1" />
          <rect x="15.6" y="0" width="3.4" height="12" rx="1" />
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 13" fill={C.textPrimary}>
          <path d="M8.5 2.6c2.7 0 5.2 1 7 2.8l-1.4 1.4A8.2 8.2 0 0 0 8.5 4.5c-2.2 0-4.2.9-5.6 2.3L1.5 5.4A11.6 11.6 0 0 1 8.5 2.6Zm0 3.7c1.7 0 3.2.7 4.3 1.8l-1.4 1.4A4 4 0 0 0 8.5 8.4c-1.1 0-2.1.4-2.9 1.1L4.2 8.1A5.8 5.8 0 0 1 8.5 6.3Zm0 3.6c.7 0 1.3.3 1.7.8L8.5 12.4 6.8 10.7c.4-.5 1-.8 1.7-.8Z" />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <div
            style={{
              width: 25,
              height: 12,
              borderRadius: 3.5,
              border: `1px solid ${C.textPrimary}`,
              opacity: 0.4,
              padding: 1.8,
            }}
          >
            <div
              style={{
                width: "80%",
                height: "100%",
                borderRadius: 1.5,
                background: C.textPrimary,
              }}
            />
          </div>
          <div
            style={{
              width: 1.8,
              height: 4.5,
              borderRadius: 1,
              background: C.textPrimary,
              opacity: 0.4,
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Phone frame — native iPhone 17 Pro Max, rendered through transform: scale.
   Bezel is near-black in both themes on a real device, but that reads as
   invisible against this page's near-black dark-mode background, so the
   bezel itself switches to a lighter chassis gray in dark mode. ── */
const BEZEL_LIGHT = "#0A0A0C";
const BEZEL_DARK = "#3F3F46";

function Phone({ active, children }: { active: string; children: React.ReactNode }) {
  const isDark = useMockupIsDark();
  const outerW = SCREEN_W + BEZEL * 2;
  const outerH = SCREEN_H + BEZEL * 2;
  return (
    <div
      style={{
        width: outerW * SCALE,
        height: outerH * SCALE,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: outerW,
          height: outerH,
          transform: `scale(${SCALE})`,
          transformOrigin: "top left",
          borderRadius: 62,
          background: isDark ? BEZEL_DARK : BEZEL_LIGHT,
          padding: BEZEL,
          boxShadow: "0 30px 80px rgba(15,23,42,0.28), 0 6px 18px rgba(15,23,42,0.14)",
        }}
      >
        <div
          style={{
            width: SCREEN_W,
            height: SCREEN_H,
            borderRadius: 50,
            background: C.background,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <StatusBar />
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {children}
          </div>
          <TabBar active={active} />
        </div>
      </div>
    </div>
  );
}

/* ── 44×44 round icon control — ScheduleScreen.iconControlButton ── */
function IconControlButton({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: C.borderSubtle,
        background: C.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 6px 14px ${C.shadow}`,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

/* ── Tone palette for status pills / badges / icon chips — mirrors
   Screen.tsx's CARD_ICON_TONE and CountBadge.tsx's TONE_STYLES (icon and
   badge-text color are identical per tone in both real components) ── */
type Tone = "brand" | "success" | "warning" | "danger";
const TONE: Record<Tone, { bg: string; border: string; text: string }> = {
  brand: { bg: C.brandSoft, border: C.brandBorder, text: C.brand },
  success: { bg: C.successSoft, border: C.successBorder, text: C.successText },
  warning: { bg: C.warningSoft, border: C.warningBorder, text: C.warningText },
  danger: { bg: C.dangerSoft, border: C.dangerBorder, text: C.dangerText },
};

/* ── CountBadge.tsx — radius 999, border 1, paddingH 8, paddingV 3 ── */
function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        border: `1px solid ${t.border}`,
        background: t.bg,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 3,
        paddingBottom: 3,
        flexShrink: 0,
      }}
    >
      <span style={{ ...badge, color: t.text }}>{children}</span>
    </div>
  );
}

/* ── Screen.tsx Card icon frame — 32×32, radius 10, border 1 ── */
function IconChip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

/* ── Screen.tsx Card shell — surface, radius 16, padding 18, gap 10, border
   borderSubtle, shadow (h8 r20 shadowStrong) ── */
function MockCard({
  icon: Icon,
  iconTone = "brand",
  title,
  headerRight,
  children,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconTone?: Tone;
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = TONE[iconTone];
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        border: `1px solid ${C.borderSubtle}`,
        boxShadow: `0 8px 20px ${C.shadowStrong}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <IconChip tone={iconTone}>
            <Icon size={16} color={t.text} strokeWidth={2} />
          </IconChip>
          <span style={{ ...sectionTitle, color: C.textPrimary }}>{title}</span>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

/* ── ExpandableList.tsx "See all N" — Button compact tone="link": full-width,
   content centered, label bodyStrong colored brand ── */
function SeeAllLink({ count }: { count: number }) {
  return (
    <div style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ ...bodyStrong, color: C.brand }}>See all {count}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Screen 1. My Schedule (the "Me" tab), in-progress hero shift
   ───────────────────────────────────────────────────────────────────── */

const UPCOMING = [
  {
    weekday: "THU",
    day: "15",
    title: "Evening Shift",
    area: "Sheltered Care",
    time: "3:00 PM – 11:00 PM",
  },
  {
    weekday: "FRI",
    day: "16",
    title: "Day Shift",
    area: "Skilled Nursing",
    time: "7:00 AM – 3:30 PM",
  },
  {
    weekday: "SAT",
    day: "17",
    title: "Day Shift",
    area: "Skilled Nursing",
    time: "7:00 AM – 3:30 PM",
  },
  {
    weekday: "MON",
    day: "19",
    title: "Evening Shift",
    area: "Memory Care",
    time: "3:00 PM – 11:00 PM",
  },
  {
    weekday: "TUE",
    day: "20",
    title: "Day Shift",
    area: "Skilled Nursing",
    time: "7:00 AM – 3:30 PM",
  },
];

function ScheduleScreen() {
  const isDark = useMockupIsDark();
  return (
    <>
      {/* ── Sticky header. Screen.stickyHeaderShell + meWeekNavigator ── */}
      <div
        style={{
          background: C.background,
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 4,
          paddingBottom: 14,
          borderBottom: `1px solid ${C.borderSubtle}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            paddingTop: 2,
            paddingBottom: 2,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {/* meWeekNavigatorTitle: sectionTitle → fontSize 26, lineHeight 32, weight 800 */}
            <span
              style={{
                fontSize: 26,
                lineHeight: "32px",
                fontWeight: 800,
                color: C.textPrimary,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Wed, May 14
            </span>
            {/* meWeekNavigatorRangeLabel: bodyStrong, textSecondary */}
            <span style={{ ...bodyStrong, color: C.textSecondary }}>May 12 – 18</span>
          </div>
          {/* meWeekNavigatorActions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <IconControlButton>
                <ChevronLeft size={20} color={C.textPrimary} />
              </IconControlButton>
              <IconControlButton>
                <ChevronRight size={20} color={C.textPrimary} />
              </IconControlButton>
            </div>
            <IconControlButton>
              <Bell size={20} color={C.textPrimary} />
            </IconControlButton>
          </div>
        </div>
      </div>

      {/* ── Content. Screen.content (paddingHorizontal 16) +
            contentWithStickyHeader (paddingTop 16) → mePage (gap 22, paddingTop 8) ── */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          padding: "24px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {/* ── MeHeroCard. Status "active" (on duty / in progress).
              Real gradient goes bottom-left → top-right; ScheduleScreen.tsx
              swaps to a deeper navy/app-blue set (+ dimmer shadow) in dark
              mode (ME_HERO_CARD_GRADIENT_DARK / ME_HERO_CARD_SHADOW_DARK). ── */}
        <div
          style={{
            background: isDark ? ME_HERO_GRADIENT_DARK : ME_HERO_GRADIENT_LIGHT,
            borderRadius: 24,
            paddingLeft: 18,
            paddingRight: 18,
            paddingTop: 18,
            paddingBottom: 18,
            boxShadow: `0 14px 28px ${isDark ? ME_HERO_SHADOW_DARK : ME_HERO_SHADOW_LIGHT}`,
          }}
        >
          {/* meHeroContent: gap 11 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {/* meHeroHeader: row, alignItems flex-start, justify space-between, gap 12.
                Badge + title share a meHeroHeaderCopy column so the title sits directly
                under the badge instead of trailing the (taller) date tile's own height. */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {/* meHeroHeaderCopy: column, gap 10 */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 }}
              >
                {/* meHeroBadge. Status "active" → meHeroBadgeDotActive (#86EFAC) */}
                <div
                  style={{
                    alignSelf: "flex-start",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 4.5,
                      background: "#86EFAC",
                    }}
                  />
                  <span
                    style={{
                      ...label,
                      color: C.textInverse,
                      textTransform: "uppercase",
                    }}
                  >
                    On Duty
                  </span>
                </div>

                {/* meHeroTitleRow → meHeroTitle */}
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span style={{ ...heroMetric, color: C.textInverse }}>Day Shift</span>
                </div>
              </div>
              {/* meHeroDateTile */}
              <div
                style={{
                  minWidth: 58,
                  borderRadius: 16,
                  border: "1px solid rgba(255, 255, 255, 0.22)",
                  background: "rgba(255, 255, 255, 0.14)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 8,
                  paddingBottom: 8,
                }}
              >
                <span style={{ ...label, color: "rgba(255, 255, 255, 0.72)" }}>WED</span>
                <span style={{ ...heroMetric, color: C.textInverse }}>14</span>
              </div>
            </div>

            {/* meHeroAreaRow: marginTop 2 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 2,
              }}
            >
              <MapPin size={18} color="rgba(255, 255, 255, 0.82)" strokeWidth={2} />
              <span style={{ ...rowTitle, color: "rgba(255, 255, 255, 0.86)" }}>
                Skilled Nursing
              </span>
            </div>

            {/* meHeroRoleRow → MeTypePill → JobPill (compact). "Mentor" job chip.
                buildJobChip's mentor/trainer branch: bg/border track the shared
                warning token, but text stays a bespoke light-mode amber
                (#B45309, darker than warningText) and only swaps to the token's
                warningText in dark mode. */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 8,
                  border: `1px solid ${C.warningBorder}`,
                  background: C.warningSoft,
                  paddingLeft: 9,
                  paddingRight: 9,
                  paddingTop: 5,
                  paddingBottom: 5,
                }}
              >
                {/* jobPillText + jobPillTextCompact: fontSize 12, weight 700, uppercase */}
                <span
                  style={{
                    fontSize: 12,
                    lineHeight: "14px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: isDark ? C.warningText : "#B45309",
                  }}
                >
                  Mentor
                </span>
              </div>
            </div>

            {/* meHeroScheduleRow: marginTop 6. Time row + timing label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flex: 1,
                  gap: 9,
                  minWidth: 0,
                }}
              >
                <Clock size={24} color="rgba(255, 255, 255, 0.82)" strokeWidth={2} />
                <span style={{ ...sectionTitle, color: C.textInverse }}>7:00 AM – 3:30 PM</span>
              </div>
              {/* meHeroProgressLabel. FormatDurationLabel("2h 15m left") */}
              <span
                style={{
                  ...rowTitle,
                  color: "rgba(255, 255, 255, 0.86)",
                  flexShrink: 0,
                }}
              >
                2h 15m left
              </span>
            </div>

            {/* meHeroProgressTrack / meHeroProgressFill */}
            <div
              style={{
                height: 7,
                borderRadius: 999,
                background: "rgba(15, 23, 42, 0.24)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "62%",
                  height: "100%",
                  borderRadius: 999,
                  background: "#42E878",
                }}
              />
            </div>
          </div>
        </div>

        {/* ── UpcomingShiftsSection (upcomingSectionBlock: gap 18) ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* upcomingSectionHeader */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <span
              style={{
                ...sectionTitle,
                fontSize: 18,
                lineHeight: "24px",
                flex: 1,
                color: C.textPrimary,
              }}
            >
              Your Week
            </span>
            {/* upcomingHoursBadge */}
            <div
              style={{
                borderRadius: 12,
                background: C.brandSoft,
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 9,
                paddingBottom: 9,
              }}
            >
              <span style={{ ...bodyStrong, color: C.brand }}>30h this week</span>
            </div>
          </div>

          {/* upcomingShiftsCard */}
          <div
            style={{
              background: C.surface,
              borderRadius: 28,
              border: `1px solid ${C.borderSubtle}`,
              paddingLeft: 20,
              paddingRight: 20,
              boxShadow: `0 12px 24px ${C.shadow}`,
            }}
          >
            {UPCOMING.map((r, i) => (
              <div
                key={r.day}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 18,
                  borderTop: i > 0 ? `1px solid ${C.borderSubtle}` : undefined,
                }}
              >
                {/* upcomingDateColumn */}
                <div
                  style={{
                    width: 60,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingTop: 18,
                    paddingBottom: 18,
                  }}
                >
                  {/* upcomingDateTile */}
                  <div
                    style={{
                      width: 60,
                      height: 68,
                      borderRadius: 16,
                      border: `1px solid ${C.borderSubtle}`,
                      background: C.surfaceMuted,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ ...micro, fontSize: 11, color: C.textSubtle }}>{r.weekday}</span>
                    <span
                      style={{
                        ...sectionTitle,
                        fontSize: 20,
                        lineHeight: "24px",
                        color: C.textSecondary,
                      }}
                    >
                      {r.day}
                    </span>
                  </div>
                </div>

                {/* upcomingDateShiftStack → upcomingShiftRow */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      minHeight: 132,
                      display: "flex",
                      alignItems: "center",
                      gap: 18,
                      paddingTop: 18,
                      paddingBottom: 18,
                    }}
                  >
                    {/* upcomingShiftCopy: gap 9 */}
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 9,
                      }}
                    >
                      {/* upcomingShiftTitleRow */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            ...sectionTitle,
                            fontSize: 17,
                            color: C.textPrimary,
                          }}
                        >
                          {r.title}
                        </span>
                        {/* upcomingShiftTime */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexShrink: 0,
                          }}
                        >
                          <Clock size={18} color={C.textMuted} strokeWidth={2} />
                          <span style={{ ...bodyStrong, color: C.textSubtle }}>{r.time}</span>
                        </div>
                      </div>
                      {/* upcomingShiftArea */}
                      <span style={{ ...rowTitle, color: C.textSecondary }}>{r.area}</span>
                    </div>
                    {/* upcomingShiftAction */}
                    <div
                      style={{
                        width: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronRight size={22} color={C.textMuted} strokeWidth={2} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Screen 2. Shift Requests ("Available" tab)
   ───────────────────────────────────────────────────────────────────── */

// Real tab set (RequestsScreen.tsx `tabs` array) is Available/All/Mine/
// Approval/History, filtered by permission — an admin viewer sees all 5.
const REQ_TABS = [
  { label: "Available", count: 7, active: true },
  { label: "All", count: 0, active: false },
  { label: "Mine", count: 0, active: false },
  { label: "Approval", count: 0, active: false },
  { label: "History", count: 3, active: false },
];

// Date groups use formatScheduleDayLabel (schedule-core): "Today, {date}" /
// "Tomorrow, {date}" / else "{weekday short}, {month short} {day}" — not
// full weekday names. Two shifts include the real
// volunteerBlockReason/canVolunteer=false state (disabled Volunteer button
// + block-reason line) for a viewer not assigned to that focus area.
const OPEN_SHIFT_GROUPS = [
  {
    date: "Today, Jul 12",
    shifts: [
      {
        title: "Day Shift",
        time: "7:00 AM – 3:30 PM",
        area: "Skilled Nursing",
        needed: "1 teammate needed",
        blocked: false,
      },
      {
        title: "Evening Shift",
        time: "3:00 PM – 11:00 PM",
        area: "Sheltered Care",
        needed: "2 teammates needed",
        blocked: false,
      },
    ],
  },
  {
    date: "Tomorrow, Jul 13",
    shifts: [
      {
        title: "Night Shift",
        time: "12:00 AM – 8:00 AM",
        area: "Memory Care",
        needed: "1 teammate needed",
        blocked: true,
      },
    ],
  },
  {
    date: "Tue, Jul 14",
    shifts: [
      {
        title: "Day Shift",
        time: "7:00 AM – 3:30 PM",
        area: "Rehab Therapy",
        needed: "1 teammate needed",
        blocked: false,
      },
      {
        title: "Night Shift",
        time: "12:00 AM – 8:00 AM",
        area: "Night Shift",
        needed: "1 teammate needed",
        blocked: true,
      },
    ],
  },
  {
    date: "Wed, Jul 15",
    shifts: [
      {
        title: "Night Shift",
        time: "12:00 AM – 8:00 AM",
        area: "Skilled Nursing",
        needed: "1 teammate needed",
        blocked: true,
      },
    ],
  },
  {
    date: "Thu, Jul 16",
    shifts: [
      {
        title: "Day Shift",
        time: "7:00 AM – 3:30 PM",
        area: "Visiting CSNS",
        needed: "1 teammate needed",
        blocked: false,
      },
    ],
  },
];

function RequestsScreen() {
  return (
    <>
      {/* ── iOS large-title nav header. CreateTopLevelStackOptions("Requests"),
            headerStyle bg = background, headerTitleStyle weight 700 ── */}
      <div style={{ background: C.background, flexShrink: 0 }}>
        <div style={{ height: 44 }} />
        <div style={{ padding: "0 16px 8px" }}>
          <span
            style={{
              fontSize: 34,
              lineHeight: "41px",
              fontWeight: 700,
              letterSpacing: "0.012em",
              color: C.textPrimary,
            }}
          >
            Requests
          </span>
        </div>
      </div>

      {/* ── Content. Screen.content (paddingHorizontal 16, gap 16) ── */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* tabRow: marginHorizontal -16 → full-bleed; content paddingHorizontal 16, gap 8 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "2px 16px",
          }}
        >
          {REQ_TABS.map((t) => (
            <div
              key={t.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 36,
                paddingLeft: 14,
                paddingRight: 14,
                paddingTop: 8,
                paddingBottom: 8,
                borderRadius: 999,
                border: `1px solid ${t.active ? C.brand : C.borderSubtle}`,
                background: t.active ? C.brand : C.surface,
              }}
            >
              {/* tabButtonText: fontSize 14, fontWeight 700 */}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: t.active ? C.textInverse : C.textSecondary,
                }}
              >
                {t.label}
              </span>
              {/* tabBadge — hidden when count is 0 (count > 0 ? badge : null) */}
              {t.count > 0 ? (
                <div
                  style={{
                    minWidth: 20,
                    paddingLeft: 6,
                    paddingRight: 6,
                    paddingTop: 3,
                    paddingBottom: 3,
                    borderRadius: 999,
                    background: t.active ? "rgba(255, 255, 255, 0.22)" : C.surfaceSecondary,
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      ...badge,
                      color: t.active ? C.textInverse : C.textMuted,
                    }}
                  >
                    {t.count}
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {/* section: gap 18 → repeated dateGroup blocks (gap 10 each) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          {OPEN_SHIFT_GROUPS.map((group) => (
            <div key={group.date} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* dateGroupLabel: bodyStrong, textMuted */}
              <span style={{ ...bodyStrong, color: C.textMuted }}>{group.date}</span>
              {/* dateGroupItems: gap 10 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {group.shifts.map((s) => (
                  <div
                    key={`${group.date}-${s.title}-${s.area}`}
                    /* requestCard + openShiftCard: bg surface, radius 16, border 1
                       borderSubtle, padding 18, gap 12 — no shadow. List cards use
                       a flat border only; shadows are reserved for singular hero
                       cards (DashboardHeroCard), not repeated list items. */
                    style={{
                      background: C.surface,
                      borderRadius: 16,
                      border: `1px solid ${C.borderSubtle}`,
                      padding: 18,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    {/* openShiftTitleRow: row, justify space-between, align CENTER,
                       gap 12 — pairs the title/time line with the status pill only;
                       everything else below flows as separate stacked siblings
                       (OpenShiftCard has no icon column to indent under). */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      {/* shiftTitleTimeRow: flex 1, row, alignItems baseline, justify space-between, gap 12 */}
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        {/* openShiftTitle: sectionTitle, textPrimary */}
                        <span style={{ ...sectionTitle, color: C.textPrimary }}>{s.title}</span>
                        {/* shiftTitleTimeText: rowTitle → fontWeight 500, textMuted */}
                        <span style={{ ...rowTitle, fontWeight: 500, color: C.textMuted }}>
                          {s.time}
                        </span>
                      </div>
                      {/* statusChip, tone-colored via OPEN_SHIFT_CHIP_TONE
                         (= STATUS_CHIP_TONES.open) — brand, same semantic as an
                         `open` request: "this is available/actionable" */}
                      <div
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${TONE.brand.border}`,
                          background: TONE.brand.bg,
                          paddingLeft: 10,
                          paddingRight: 10,
                          paddingTop: 6,
                          paddingBottom: 6,
                          alignSelf: "flex-start",
                        }}
                      >
                        {/* statusChipText: caption → fontWeight 600, tone text color */}
                        <span
                          style={{
                            ...caption,
                            fontWeight: 600,
                            color: TONE.brand.text,
                          }}
                        >
                          Open shift
                        </span>
                      </div>
                    </div>

                    {/* openShiftContextStack: gap 8. Focus area only
                       (open shifts don't surface a job/designation chip) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* openShiftContextText: rowTitle, textSecondary */}
                      <span style={{ ...rowTitle, color: C.textSecondary }}>{s.area}</span>
                    </div>

                    {/* metaText: body, textMuted */}
                    <span style={{ ...body, color: C.textMuted }}>{s.needed}</span>

                    {/* volunteerBlockReason metaText — shown when
                        openShift.canVolunteer === false */}
                    {s.blocked ? (
                      <span style={{ ...body, color: C.textMuted }}>
                        You are not assigned to the focus area required for this shift.
                      </span>
                    ) : null}

                    {/* cardActions — flexWrap wrap, justifyContent flex-start, gap 8,
                       paddingTop 10, hairline top border. Base cardActions has
                       marginLeft 42 to indent under a card's icon column; OpenShiftCard
                       has no icon, so cardActionsFlush overrides that back to 0. */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "flex-start",
                        gap: 8,
                        paddingTop: 10,
                        borderTop: `1px solid ${C.borderSubtle}`,
                      }}
                    >
                      <div
                        style={{
                          minHeight: 44,
                          borderRadius: 12,
                          paddingLeft: 14,
                          paddingRight: 14,
                          paddingTop: 10,
                          paddingBottom: 10,
                          border: `1px solid ${C.brandBorder}`,
                          background: C.brandSoft,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: s.blocked ? 0.5 : 1,
                        }}
                      >
                        {/* label: bodyStrong, labelSecondary color brand */}
                        <span style={{ ...bodyStrong, color: C.brand }}>Volunteer</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Screen 3. Admin dashboard ("Home" tab for admin/super_admin roles)
   ───────────────────────────────────────────────────────────────────── */

const PERIOD_MODES = [
  { label: "Day", active: false },
  { label: "Week", active: true },
  { label: "2 Weeks", active: false },
];

// Jul 12–18, 2026 week — Sun/Mon/Tue confirmed from the real screenshot,
// Wed–Sat continue plausibly (not visible in the source screenshot).
const WEEK_SCHEDULE: Array<{
  weekday: string;
  day: string;
  shift: { name: string; time: string } | null;
}> = [
  { weekday: "SUN", day: "12", shift: null },
  { weekday: "MON", day: "13", shift: { name: "Day Shift", time: "7:00 AM – 3:30 PM" } },
  { weekday: "TUE", day: "14", shift: { name: "Day Shift", time: "7:00 AM – 3:30 PM" } },
  { weekday: "WED", day: "15", shift: { name: "Evening Shift", time: "3:00 PM – 11:00 PM" } },
  { weekday: "THU", day: "16", shift: null },
  { weekday: "FRI", day: "17", shift: { name: "Day Shift", time: "7:00 AM – 3:30 PM" } },
  { weekday: "SAT", day: "18", shift: { name: "Evening Shift", time: "3:00 PM – 11:00 PM" } },
];

function coverageColor(pct: number): string {
  if (pct >= 90) return C.success;
  if (pct >= 70) return C.warning;
  return C.danger;
}

// The 4 real "Coverage by wings" sections — filled/required confirmed from
// the real screenshot (percentages and the "20 open" header badge both
// derive exactly from these values, not hardcoded separately).
const COVERAGE_SECTIONS = [
  { name: "Night Shift", filled: 12, required: 21 },
  { name: "Skilled Nursing", filled: 41, required: 49 },
  { name: "Sheltered Care", filled: 12, required: 14 },
  { name: "Visiting CSNS", filled: 6, required: 7 },
].map((s) => ({ ...s, pct: Math.round((s.filled / s.required) * 100) }));

// Area names match the 4 real "Coverage by wings" sections above.
const ADMIN_OPEN_SHIFTS = [
  { area: "Skilled Nursing", meta: "Jul 12 · D · 7:00 AM – 3:30 PM", needed: "1" },
  { area: "Sheltered Care", meta: "Jul 12 · E · 3:00 PM – 11:00 PM", needed: "2" },
  { area: "Night Shift", meta: "Jul 13 · N · 11:00 PM – 7:00 AM", needed: "2" },
  { area: "Skilled Nursing", meta: "Jul 13 · D · 7:00 AM – 3:30 PM", needed: "1" },
  { area: "Visiting CSNS", meta: "Jul 14 · D · 7:00 AM – 3:30 PM", needed: "1" },
  { area: "Night Shift", meta: "Jul 14 · N · 11:00 PM – 7:00 AM", needed: "1" },
];

const STAFF_HOURS = [
  { name: "Jordan Reyes", total: 44, ot: 4 },
  { name: "Priya Shah", total: 42, ot: 2 },
  { name: "Marcus Webb", total: 46, ot: 6 },
  { name: "Alicia Chen", total: 41, ot: 1 },
  { name: "Devon Brooks", total: 43, ot: 3 },
  { name: "Sam Whitfield", total: 45, ot: 5 },
];

const ACTIVITY: Array<{ type: string; tone: Tone; time: string; desc: string }> = [
  {
    type: "Published",
    tone: "brand",
    time: "2h ago",
    desc: "Published the schedule for Jul 12–18",
  },
  {
    type: "Shift change",
    tone: "warning",
    time: "4h ago",
    desc: "Marcus Webb picked up Jordan Reyes's Day shift on Jul 13",
  },
  {
    type: "Request",
    tone: "success",
    time: "6h ago",
    desc: "Priya Shah requested a swap for Jul 14",
  },
  { type: "Sign-up", tone: "success", time: "1d ago", desc: "Sam Whitfield joined Calm Haven" },
  {
    type: "Shift change",
    tone: "warning",
    time: "1d ago",
    desc: "Devon Brooks called off for Jul 14",
  },
  { type: "Published", tone: "brand", time: "2d ago", desc: "Published the schedule for Jul 5–11" },
];

function AdminHomeScreenMockup() {
  return (
    <>
      {/* ── Sticky header. Screen.stickyHeaderShell + DashboardHeader ── */}
      <div
        style={{
          background: C.background,
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 4,
          paddingBottom: 14,
          borderBottom: `1px solid ${C.borderSubtle}`,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* DashboardHeader.styles.greeting: screenTitle, textPrimary */}
        <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 700, color: C.textPrimary }}>
          Good morning, Nic!
        </span>
        {/* DashboardHeader.styles.meta: body, textSecondary */}
        <span style={{ ...body, color: C.textSecondary }}>
          Calm Haven · 1:39 AM PDT | Jul 12–18, 2026
        </span>
      </div>

      {/* ── Content. Screen.content (paddingHorizontal 16, gap 16) +
            contentWithStickyHeader (paddingTop 16) ── */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* ── DashboardHeroCard. styles.card: surface, radius 16, padding 18,
              gap 16, border borderSubtle, shadow (h8 r20 shadowStrong) ── */}
        <div
          style={{
            background: C.surface,
            borderRadius: 16,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            border: `1px solid ${C.borderSubtle}`,
            boxShadow: `0 8px 20px ${C.shadowStrong}`,
          }}
        >
          {/* headerRow: row, justify space-between, align flex-start, gap 12 */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {/* headerCopy: flexShrink 1, gap 6. statusPill: STATUS_TONE maps
                "Attention" → danger tone */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 1 }}>
              <Pill tone="danger">Attention</Pill>
              {/* title: sectionTitle, textPrimary */}
              <span style={{ ...sectionTitle, color: C.textPrimary }}>6 coverage gaps</span>
            </div>

            {/* PeriodToggle. track: row, alignSelf flex-start, surfaceSecondary,
                radius 999, border borderSubtle, padding 2 */}
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                background: C.surfaceSecondary,
                borderRadius: 999,
                border: `1px solid ${C.borderSubtle}`,
                padding: 2,
                flexShrink: 0,
              }}
            >
              {PERIOD_MODES.map((mode) => (
                <div
                  key={mode.label}
                  style={{
                    paddingLeft: 9,
                    paddingRight: 9,
                    paddingTop: 3,
                    paddingBottom: 3,
                    borderRadius: 999,
                    background: mode.active ? C.brand : "transparent",
                  }}
                >
                  <span
                    style={{
                      ...caption,
                      fontWeight: mode.active ? 700 : 400,
                      color: mode.active ? C.textInverse : C.textMuted,
                    }}
                  >
                    {mode.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* tileRow: row, wrap, gap 10 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {[
              {
                label: "Coverage",
                value: "78%",
                detail: "Current staffing coverage",
                tone: "brand" as const,
                Icon: ShieldCheck,
              },
              {
                // tone: openGapCount > 0 ? "danger" : "success"
                label: "Open gaps",
                value: "6",
                detail: "Staffing gaps this period",
                tone: "danger" as const,
                Icon: AlertCircle,
              },
              {
                // tone: pendingApprovalsCount > 0 ? "warning" : "success"
                label: "Pending approvals",
                value: "0",
                detail: "Requests waiting for review",
                tone: "success" as const,
                Icon: CheckCheck,
              },
            ].map((tile) => {
              const t = TONE[tile.tone];
              return (
                <div
                  key={tile.label}
                  style={{
                    flexGrow: 1,
                    flexBasis: "30%",
                    minWidth: 0,
                    overflow: "hidden",
                    background: C.surfaceSecondary,
                    borderRadius: 12,
                    border: `1px solid ${C.borderSubtle}`,
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {/* tileHeader: row, align flex-start, justify space-between, gap 6 */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <span style={{ ...caption, color: C.textMuted, flex: 1 }}>{tile.label}</span>
                    {/* tileIconFrame: 26×26, radius 13, border, nudged -4/-4 */}
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        border: `1px solid ${t.border}`,
                        background: t.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: -4,
                        marginRight: -4,
                      }}
                    >
                      <tile.Icon size={16} color={t.text} strokeWidth={2} />
                    </div>
                  </div>
                  <span style={{ ...heroMetric, color: C.textPrimary }}>{tile.value}</span>
                  <span style={{ ...caption, color: C.textMuted }}>{tile.detail}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* No ActionQueueCard — AdminHomeScreen.tsx only renders it for
              role === "admin"; this viewer is super_admin (matches
              pendingApprovalsCount: 0 above, and the real screenshot showing
              "Your schedule" immediately after the hero card). */}

        {/* ── MyScheduleCard. Horizontal 7-day strip — scrollView marginHorizontal
              -18 (bleed) + scrollContent paddingHorizontal 18 (padded ends),
              matching the real edge-bleed-with-padded-ends fix ── */}
        <div
          style={{
            background: C.surface,
            borderRadius: 16,
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            border: `1px solid ${C.borderSubtle}`,
            boxShadow: `0 8px 20px ${C.shadowStrong}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <IconChip tone="brand">
              <Calendar size={16} color={C.brand} strokeWidth={2} />
            </IconChip>
            <span style={{ ...sectionTitle, color: C.textPrimary }}>Your schedule</span>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              overflow: "hidden",
              marginLeft: -18,
              marginRight: -18,
              paddingLeft: 18,
              paddingRight: 18,
            }}
          >
            {WEEK_SCHEDULE.map((d) => (
              <div
                key={d.day}
                style={{
                  width: 132,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: C.surfaceSecondary,
                  borderRadius: 12,
                  border: `1px solid ${C.borderSubtle}`,
                  padding: 12,
                }}
              >
                <span style={{ ...label, color: C.textMuted }}>
                  {d.weekday} {d.day}
                </span>
                {d.shift ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ ...bodyStrong, color: C.textPrimary }}>{d.shift.name}</span>
                    <span style={{ ...caption, color: C.textMuted }}>{d.shift.time}</span>
                  </div>
                ) : (
                  // isAbsence ? "Off" : "—" — these two rest days are modeled
                  // as absence records, matching real usage.
                  <div style={{ minHeight: 36, display: "flex", alignItems: "center" }}>
                    <span style={{ ...body, color: C.textSubtle }}>Off</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── CoverageBySectionCard. 6 rows — progress bars, coverageColor
              (>=90 success / >=70 warning / else danger). Icon: real card
              uses Ionicons "stats-chart-outline" → lucide BarChart3 ── */}
        <MockCard
          icon={BarChart3}
          iconTone="brand"
          title="Coverage by wings"
          headerRight={
            <Pill tone="warning">
              {COVERAGE_SECTIONS.reduce((sum, s) => sum + (s.required - s.filled), 0)} open
            </Pill>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {COVERAGE_SECTIONS.slice(0, 5).map((s) => {
              const pctColor = coverageColor(s.pct);
              return (
                <div key={s.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <span style={{ ...body, color: C.textPrimary, flexShrink: 1 }}>{s.name}</span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
                      <span style={{ ...caption, color: C.textSubtle }}>
                        {s.filled} / {s.required} filled
                      </span>
                      <span style={{ ...bodyStrong, color: pctColor }}>{s.pct}%</span>
                    </div>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: C.borderSubtle,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 3,
                        background: pctColor,
                        width: `${s.pct}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {/* hasMore = items.length > collapsedCount(5) — 4 real sections,
                so no "See all" link (matches the real screenshot). */}
            {COVERAGE_SECTIONS.length > 5 ? <SeeAllLink count={COVERAGE_SECTIONS.length} /> : null}
          </div>
        </MockCard>

        {/* ── OpenShiftsCard. 6 rows — 5 visible + "See all 6" ── */}
        <MockCard
          icon={Calendar}
          iconTone="brand"
          title="Open shifts"
          headerRight={<Pill tone="brand">{ADMIN_OPEN_SHIFTS.length}</Pill>}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ADMIN_OPEN_SHIFTS.slice(0, 5).map((s) => (
              <div
                key={`${s.area}-${s.meta}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 1 }}>
                  <span style={{ ...body, color: C.textPrimary }}>{s.area}</span>
                  <span style={{ ...caption, color: C.textMuted }}>{s.meta}</span>
                </div>
                <Pill tone="brand">{s.needed} needed</Pill>
              </div>
            ))}
            {ADMIN_OPEN_SHIFTS.length > 5 ? <SeeAllLink count={ADMIN_OPEN_SHIFTS.length} /> : null}
          </div>
        </MockCard>

        {/* ── StaffHoursCard ("Overtime watch"). 6 rows — 5 visible + "See all 6" ── */}
        <MockCard
          icon={AlertCircle}
          iconTone="danger"
          title="Overtime watch"
          headerRight={<Pill tone="danger">{STAFF_HOURS.length}</Pill>}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STAFF_HOURS.slice(0, 5).map((entry) => (
              <div
                key={entry.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ ...body, color: C.textPrimary }}>{entry.name}</span>
                  <span style={{ ...caption, color: C.textMuted }}>{entry.total}h total</span>
                </div>
                <Pill tone="danger">+{entry.ot}h OT</Pill>
              </div>
            ))}
            {STAFF_HOURS.length > 5 ? <SeeAllLink count={STAFF_HOURS.length} /> : null}
          </div>
        </MockCard>

        {/* ── ActivityFeedCard. 6 rows — 5 visible + "See all 6", divider
              between rows (not before the first) ── */}
        <MockCard icon={Clock} iconTone="brand" title="Recent activity">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ACTIVITY.slice(0, 5).map((item, i) => (
              <Fragment key={item.desc}>
                {i > 0 ? <div style={{ height: 1, background: C.borderSubtle }} /> : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <Pill tone={item.tone}>{item.type}</Pill>
                    <span style={{ ...caption, color: C.textMuted }}>{item.time}</span>
                  </div>
                  <span style={{ ...body, color: C.textPrimary }}>{item.desc}</span>
                </div>
              </Fragment>
            ))}
            {ACTIVITY.length > 5 ? <SeeAllLink count={ACTIVITY.length} /> : null}
          </div>
        </MockCard>
      </div>
    </>
  );
}

export default function MobileAppMockup() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 32,
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <Phone active="Home">
        <AdminHomeScreenMockup />
      </Phone>
      <Phone active="Schedule">
        <ScheduleScreen />
      </Phone>
      <Phone active="Requests">
        <RequestsScreen />
      </Phone>
    </div>
  );
}
