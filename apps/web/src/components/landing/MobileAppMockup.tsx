/* ── Mobile companion app mockup ──────────────────────────────────────
   Pixel-faithful reproduction of the real DubGrid mobile app, built at the
   native iPhone 17 Pro Max logical resolution (440 × 956 pt) and rendered
   through a single `transform: scale()` so every interior value stays the
   exact React Native unit. Sources:
     · packages/design-tokens/src/index.ts         . Colour / type / radius
     · apps/mobile/src/shared/components/Screen.tsx . Screen wrapper
     · apps/mobile/src/shared/components/Button.tsx . Buttons
     · apps/mobile/app/(tabs)/_layout.tsx           . Bottom tab bar
     · apps/mobile/src/features/schedule/screens/ScheduleScreen.tsx
     · apps/mobile/src/features/shift-requests/screens/RequestsScreen.tsx
   Phone 1. "My Schedule" (Me) with an in-progress (On Duty) hero shift.
   Phone 2. The shift-requests "Available" tab. Calm Haven seed data. ── */

import {
  User,
  Calendar,
  ArrowLeftRight,
  Users,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  Bell,
  MapPin,
  Clock,
} from "lucide-react";

/* ── colorTokens (design-tokens) ── */
const C = {
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceSecondary: "#F1F5F9",
  surfaceMuted: "#FAFBFC",
  border: "#CBD5E1",
  borderSubtle: "#E2E8F0",
  textPrimary: "#0F172A",
  textSecondary: "#1E293B",
  textMuted: "#475569",
  textSubtle: "#64748B",
  textInverse: "#FFFFFF",
  brand: "#2563EB",
  brandSoft: "#EFF6FF",
  brandBorder: "#BFDBFE",
  danger: "#EF4444",
  shadow: "rgba(15, 23, 42, 0.08)",
};

/* ── mobileTypographyTokens.text — { fontSize, lineHeight, fontWeight } ── */
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
  { label: "Me", Icon: User },
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
              <Icon
                size={28}
                color={on ? C.brand : C.textSubtle}
                strokeWidth={on ? 2.4 : 2}
              />
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
      <span style={{ fontSize: 17, fontWeight: 600, color: C.textPrimary }}>
        9:41
      </span>
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

/* ── Phone frame — native iPhone 17 Pro Max, rendered through transform: scale ── */
function Phone({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
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
          background: "#0A0A0C",
          padding: BEZEL,
          boxShadow:
            "0 30px 80px rgba(15,23,42,0.28), 0 6px 18px rgba(15,23,42,0.14)",
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
];

function ScheduleScreen() {
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
            <span style={{ ...bodyStrong, color: C.textSecondary }}>
              May 12 – 18
            </span>
          </div>
          {/* meWeekNavigatorActions */}
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
          >
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
        {/* ── MeHeroCard. Status "active" (on duty / in progress) ── */}
        <div
          style={{
            background: "#2946C7",
            borderRadius: 24,
            paddingLeft: 18,
            paddingRight: 18,
            paddingTop: 18,
            paddingBottom: 18,
            boxShadow: "0 14px 28px rgba(37, 99, 235, 0.3)",
          }}
        >
          {/* meHeroContent: gap 11 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {/* meHeroHeader: row, alignItems flex-end, justify space-between, gap 12 */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
              }}
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
                <span style={{ ...label, color: "rgba(255, 255, 255, 0.72)" }}>
                  WED
                </span>
                <span style={{ ...heroMetric, color: C.textInverse }}>14</span>
              </div>
            </div>

            {/* meHeroTitleRow → meHeroTitle */}
            <div
              style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}
            >
              <span style={{ ...heroMetric, color: C.textInverse }}>
                Day Shift
              </span>
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

            {/* meHeroRoleRow → MeTypePill → JobPill (compact). "Mentor" job chip */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 8,
                  border: "1px solid #FED7AA",
                  background: "#FFF7ED",
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
                    color: "#B45309",
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
                <span style={{ ...sectionTitle, color: C.textInverse }}>
                  7:00 AM – 3:30 PM
                </span>
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
              My Week
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
              <span style={{ ...bodyStrong, color: C.brand }}>
                30h this week
              </span>
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
                    <span style={{ ...micro, fontSize: 11, color: C.textSubtle }}>
                      {r.weekday}
                    </span>
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
                          <span style={{ ...bodyStrong, color: C.textSubtle }}>
                            {r.time}
                          </span>
                        </div>
                      </div>
                      {/* upcomingShiftArea */}
                      <span style={{ ...rowTitle, color: C.textSecondary }}>
                        {r.area}
                      </span>
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

const REQ_TABS = [
  { label: "Available", count: 2, active: true },
  { label: "Mine", count: 1, active: false },
  { label: "History", count: 3, active: false },
];

const OPEN_SHIFTS = [
  {
    title: "Day Shift",
    time: "7:00 AM – 3:30 PM",
    area: "Skilled Nursing",
    needed: "1 teammate needed",
  },
  {
    title: "Evening Shift",
    time: "3:00 PM – 11:00 PM",
    area: "Sheltered Care",
    needed: "2 teammates needed",
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
              {/* tabBadge */}
              <div
                style={{
                  minWidth: 20,
                  paddingLeft: 6,
                  paddingRight: 6,
                  paddingTop: 3,
                  paddingBottom: 3,
                  borderRadius: 999,
                  background: t.active
                    ? "rgba(255, 255, 255, 0.22)"
                    : C.surfaceSecondary,
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
            </div>
          ))}
        </div>

        {/* section: gap 10 → dateGroup: gap 10 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          {/* dateGroupLabel: bodyStrong, textMuted */}
          <span style={{ ...bodyStrong, color: C.textMuted }}>
            Saturday, May 17
          </span>
          {/* dateGroupItems: gap 10 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {OPEN_SHIFTS.map((s) => (
              <div
                key={s.title}
                /* requestCard + openShiftCard: bg surface, radius 16, border 1
                   borderSubtle, padding 18, gap 12, shadow (h8 r18) */
                style={{
                  background: C.surface,
                  borderRadius: 16,
                  border: `1px solid ${C.borderSubtle}`,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  boxShadow: `0 8px 18px ${C.shadow}`,
                }}
              >
                {/* requestHeaderRow: row, justify space-between, align flex-start, gap 12 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
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
                    <span style={{ ...sectionTitle, color: C.textPrimary }}>
                      {s.title}
                    </span>
                    {/* shiftTitleTimeText: rowTitle → fontWeight 500, textMuted */}
                    <span
                      style={{ ...rowTitle, fontWeight: 500, color: C.textMuted }}
                    >
                      {s.time}
                    </span>
                  </div>
                  {/* statusChip */}
                  <div
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${C.border}`,
                      background: C.surfaceSecondary,
                      paddingLeft: 10,
                      paddingRight: 10,
                      paddingTop: 6,
                      paddingBottom: 6,
                      alignSelf: "flex-start",
                    }}
                  >
                    {/* statusChipText: caption → fontWeight 600, textSecondary */}
                    <span
                      style={{
                        ...caption,
                        fontWeight: 600,
                        color: C.textSecondary,
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
                  <span style={{ ...rowTitle, color: C.textSecondary }}>
                    {s.area}
                  </span>
                </div>

                {/* metaText: body, textMuted */}
                <span style={{ ...body, color: C.textMuted }}>{s.needed}</span>

                {/* actions → Button compact tone="secondary" */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                    }}
                  >
                    {/* label: bodyStrong, labelSecondary color brand */}
                    <span style={{ ...bodyStrong, color: C.brand }}>
                      Volunteer
                    </span>
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
      <Phone active="Me">
        <ScheduleScreen />
      </Phone>
      <Phone active="Requests">
        <RequestsScreen />
      </Phone>
    </div>
  );
}
