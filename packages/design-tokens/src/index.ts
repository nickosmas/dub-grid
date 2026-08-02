export {
  BRAND_ANIMATED_LOGO_SIZE,
  ANIMATED_LOGO_OPACITY_MIN,
  ANIMATED_LOGO_OPACITY_MAX,
  ANIMATED_LOGO_DURATION_MIN_S,
  ANIMATED_LOGO_DURATION_MAX_S,
  ANIMATED_LOGO_DELAY_MAX_S,
  generateAnimatedLogoTimings,
  type AnimatedLogoTiming,
} from "./animated-logo";

export {
  getAvatarTone,
  getAvatarGradientTone,
  type AvatarTone,
  type AvatarGradientTone,
} from "./avatar-tone";

export {
  getReadableTextColor,
  borderColor,
  toDarkPillColors,
  resolveShiftPillColors,
  visiblePillBorder,
  type ShiftPillColors,
} from "./pill-colors";

export const lightColorTokens = {
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
  brandLight: "#3B82F6",
  brandSoft: "#EFF6FF",
  brandBorder: "#BFDBFE",
  // Active-item highlight for the navbar tabs and app sidebars: gray rather
  // than `brandSoft`, paired with `textPrimary` instead of brand blue.
  // Sits half a step between `surfaceSecondary` (slate-100, also the hover
  // background — the active state has to stay distinguishable from it) and
  // `borderSubtle` (slate-200), and carries the same slate tint as the rest
  // of the light ramp rather than being a pure neutral.
  navActiveBg: "#E7ECF2",
  success: "#16A34A",
  successText: "#166534",
  successSoft: "#F0FDF4",
  successBorder: "#BBF7D0",
  warning: "#F59E0B",
  warningText: "#92400E",
  warningSoft: "#FFFBEB",
  warningBorder: "#FDE68A",
  danger: "#EF4444",
  dangerText: "#B91C1C",
  dangerSoft: "#FEF2F2",
  dangerBorder: "#FECACA",
  shadow: "rgba(15, 23, 42, 0.08)",
  shadowStrong: "rgba(15, 23, 42, 0.14)",
  placeholderText: "#94A3B8",
  inputBackground: "#F1F5F9",
  inputBackgroundFocused: "#FFFFFF",
  inputBackgroundError: "#FEF2F2",
  inputBorder: "#E2E8F0",
  inputBorderFocused: "#3B82F6",
  inputBorderError: "#FCA5A5",
  inputFocusRing: "rgba(59, 130, 246, 0.18)",
  rippleNeutral: "rgba(15, 23, 42, 0.06)",
  ripplePrimary: "rgba(255, 255, 255, 0.18)",
  rippleDanger: "rgba(239, 68, 68, 0.18)",
  // Background for a "filled dark control" (e.g. an active segmented-control
  // button). Kept distinct from textPrimary so dark mode can point this at a
  // fixed dark neutral without also flipping body text to near-black.
  controlPrimary: "#0F172A",
  controlPrimaryHover: "#1E293B",
  // Text/icon color for content placed on a --color-brand or --color-brand-light
  // fill (e.g. .dg-btn-primary).
  onBrandText: "#FFFFFF",
  // Button/chip surface for controls placed on a brand-colored backdrop (e.g.
  // .dg-btn-on-brand-solid on the landing page's CTA band). Fixed white in
  // both themes — unlike --color-surface, which inverts to near-black in dark
  // mode and would kill the button's contrast against the (still-blue) backdrop.
  onBrandSurface: "#FFFFFF",
} as const;

export type ColorTokens = Record<keyof typeof lightColorTokens, string>;

// Dark theme. `background` is very close to black with just a whisper of
// blue tint, per product direction — deliberately kept darker than `surface`
// (below) so cards/rows still read as clearly "raised" against the page.
const darkBrandSoft = "#152238";
export const darkColorTokens: ColorTokens = {
  background: "#02070F",
  surface: "#121214",
  surfaceSecondary: "#1C1C1F",
  surfaceMuted: "#0A0A0B",
  border: "#2E2E33",
  borderSubtle: "#2A2A2F",
  textPrimary: "#F1F1F3",
  textSecondary: "#D4D4D8",
  textMuted: "#A1A1AA",
  textSubtle: "#9797A0",
  textInverse: "#FFFFFF",
  brand: "#2075FF",
  brandLight: "#4A9BFF",
  brandSoft: darkBrandSoft,
  brandBorder: "#1E3A5F",
  // Dark counterpart: lifted above `surface` rather than dropped below it,
  // and on the same zinc ramp as `surfaceSecondary`/`borderSubtle`/`border`
  // (all R=G with B a few points higher). The light value would be near-white
  // here, and its near-black text unreadable.
  navActiveBg: "#26262B",
  success: "#22C55E",
  successText: "#4ADE80",
  successSoft: "#122118",
  successBorder: "#1E4029",
  warning: "#F59E0B",
  warningText: "#FBBF24",
  warningSoft: "#241C0B",
  warningBorder: "#3F2F10",
  danger: "#EF4444",
  dangerText: "#FF5C5C",
  dangerSoft: "#2A1414",
  dangerBorder: "#4A1F1F",
  shadow: "rgba(0, 0, 0, 0.55)",
  shadowStrong: "rgba(0, 0, 0, 0.75)",
  placeholderText: "#71717A",
  inputBackground: "#1C1C1F",
  inputBackgroundFocused: "#121214",
  inputBackgroundError: "#2A1414",
  inputBorder: "#2E2E33",
  inputBorderFocused: "#4A9BFF",
  inputBorderError: "#7F1D1D",
  inputFocusRing: "rgba(74, 155, 255, 0.25)",
  rippleNeutral: "rgba(255, 255, 255, 0.06)",
  ripplePrimary: "rgba(255, 255, 255, 0.18)",
  rippleDanger: "rgba(248, 113, 113, 0.18)",
  // Inverted from light mode: the filled-control bg is a light-on-black chip
  // here, so this stays a fixed dark neutral rather than following textPrimary.
  controlPrimary: "#26262B",
  controlPrimaryHover: "#323238",
  onBrandText: "#FFFFFF",
  onBrandSurface: "#FFFFFF",
} as const;

/** @deprecated Use `lightColorTokens` (or the theme-aware helpers) directly — this alias exists only for back-compat with existing static imports. */
export const colorTokens = lightColorTokens;

export const spacingTokens = {
  screenX: 16,
  sectionGap: 16,
  cardGap: 8,
} as const;

export const radiusTokens = {
  card: 16,
  control: 12,
  pill: 999,
} as const;

export const webSpacingTokens = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "32px",
  "4xl": "40px",
  "5xl": "48px",
} as const;

export const webRadiusTokens = {
  sm: "6px",
  md: "8px",
  lg: "10px",
  xl: "12px",
  tabShell: "var(--dg-radius-md)",
  tabShellPad: "2px",
  tabInner: "calc(var(--dg-tab-shell-radius) - var(--dg-tab-shell-pad))",
} as const;

export const typographyTokens = {
  fontSize: {
    pageTitle: "32px",
    sectionTitle: "24px",
    cardTitle: "20px",
    heading: "18px",
    title: "16px",
    body: "15px",
    bodySm: "14px",
    label: "13px",
    caption: "12px",
    footnote: "11px",
    badge: "10px",
    micro: "9px",
  },
  lineHeight: {
    tight: "1.1",
    normal: "1.4",
    loose: "1.6",
  },
} as const;

export const mobileTypographyTokens = {
  fontFamily: {
    base: "DMSans_400Regular",
    regular: "DMSans_400Regular",
    medium: "DMSans_500Medium",
    semibold: "DMSans_600SemiBold",
    bold: "DMSans_700Bold",
  },
  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  text: {
    screenTitle: {
      fontFamily: "DMSans_700Bold",
      fontSize: 22,
      lineHeight: 28,
      fontWeight: "700",
    },
    heroMetric: {
      fontFamily: "DMSans_700Bold",
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "700",
    },
    sectionTitle: {
      fontFamily: "DMSans_700Bold",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
    },
    cardTitle: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "600",
    },
    rowTitle: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "600",
    },
    body: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "400",
    },
    bodyStrong: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "600",
    },
    meta: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "400",
    },
    label: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
    },
    caption: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400",
    },
    badge: {
      fontFamily: "DMSans_700Bold",
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "700",
    },
    micro: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "600",
    },
  },
} as const;

export const shadowTokens = {
  raised: "0 1px 4px rgba(0, 0, 0, 0.06)",
  float: "0 4px 16px rgba(0, 0, 0, 0.10)",
  menu: "0 8px 24px rgba(0, 0, 0, 0.10), 0 2px 6px rgba(0, 0, 0, 0.06)",
  modal: "0 12px 48px rgba(0, 0, 0, 0.18)",
  panel: "-8px 0 40px rgba(0, 0, 0, 0.14)",
  drag: "0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)",
  tooltip: "0 0 18px rgba(15, 23, 42, 0.14), 0 0 36px rgba(15, 23, 42, 0.1)",
} as const;

// A black shadow is nearly invisible against a black page — dark mode uses
// deeper/higher-alpha shadows for surfaces that truly float (modal/panel/
// tooltip); card/menu-level elevation additionally gets a hairline border in
// globals.css since shadow alone won't read reliably on near-black surfaces.
export const darkShadowTokens: Record<keyof typeof shadowTokens, string> = {
  raised: "0 1px 4px rgba(0, 0, 0, 0.6)",
  float: "0 4px 16px rgba(0, 0, 0, 0.7)",
  menu: "0 8px 24px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.5)",
  modal: "0 12px 48px rgba(0, 0, 0, 0.85)",
  panel: "-8px 0 40px rgba(0, 0, 0, 0.8)",
  drag: "0 8px 24px rgba(0, 0, 0, 0.75), 0 2px 6px rgba(0, 0, 0, 0.5)",
  tooltip: "0 0 18px rgba(0, 0, 0, 0.6), 0 0 36px rgba(0, 0, 0, 0.5)",
} as const;

export const webLayoutTokens = {
  headerHeight: "56px",
  toolbarHeight: "38px",
  gridNameColumn: "220px",
  gridCellHeight: "52px",
  gridColumnMin: "72px",
} as const;

export const webResponsiveTokens = {
  tablet: {
    gridNameColumn: "180px",
    gridColumnMin: "64px",
  },
  smallDesktop: {
    pageTitle: "28px",
    sectionTitle: "22px",
  },
  mobile: {
    toolbarHeight: "var(--dg-btn-h-lg)",
    pageTitle: "26px",
    sectionTitle: "20px",
    cardTitle: "18px",
    heading: "16px",
    title: "15px",
    badge: "11px",
    micro: "10px",
    gridNameColumn: "160px",
  },
} as const;

export const buttonTokens = {
  radius: webRadiusTokens.sm,
  height: "38px",
  heightSm: "34px",
  heightXs: "30px",
  heightLg: "44px",
  paddingX: "16px",
  paddingXSm: "14px",
  paddingXXs: "10px",
  gap: "8px",
  iconSize: "14px",
} as const;

export const motionTokens = {
  fast: "150ms",
  standard: "200ms",
} as const;

export const overlayTokens = {
  background: "rgba(10, 20, 40, 0.45)",
  blur: "0px",
} as const;

export const stateEffectTokens = {
  focusRing: "rgba(59, 130, 246, 0.15)",
  dangerRing: "rgba(239, 68, 68, 0.12)",
  lockedBackground: "rgba(37, 99, 235, 0.08)",
  onDarkMuted: "rgba(255, 255, 255, 0.5)",
  onDarkSubtle: "rgba(255, 255, 255, 0.6)",
  onDarkSecondary: "rgba(255, 255, 255, 0.75)",
  onDarkDescription: "rgba(255, 255, 255, 0.82)",
  onDarkControl: "rgba(255, 255, 255, 0.18)",
  onDarkControlHover: "rgba(255, 255, 255, 0.35)",
  onDarkControlBorder: "rgba(255, 255, 255, 0.28)",
} as const;

export const toastTokens = {
  successBackground: colorTokens.success,
  successBorder: "#166534",
  errorBackground: "#DC2626",
  errorBorder: "#B91C1C",
  infoBackground: "#1D4ED8",
  infoBorder: "#1E3A8A",
  warningBackground: "#D97706",
  warningBorder: "#92400E",
} as const;

export const lightShadcnTokens = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  card: "oklch(1 0 0)",
  cardForeground: "oklch(0.145 0 0)",
  popover: "oklch(1 0 0)",
  popoverForeground: "oklch(0.145 0 0)",
  primary: lightColorTokens.brand,
  primaryForeground: lightColorTokens.textInverse,
  secondary: "oklch(0.97 0 0)",
  secondaryForeground: "oklch(0.205 0 0)",
  muted: "oklch(0.97 0 0)",
  mutedForeground: "oklch(0.556 0 0)",
  accent: "oklch(0.97 0 0)",
  accentForeground: "oklch(0.205 0 0)",
  destructive: lightColorTokens.danger,
  border: "oklch(0.922 0 0)",
  input: "oklch(0.922 0 0)",
  ring: lightColorTokens.brandLight,
  chart1: "oklch(0.87 0 0)",
  chart2: "oklch(0.556 0 0)",
  chart3: "oklch(0.439 0 0)",
  chart4: "oklch(0.371 0 0)",
  chart5: "oklch(0.269 0 0)",
  radius: "0.625rem",
  sidebar: "oklch(1 0 0)",
  sidebarForeground: "oklch(0.145 0 0)",
  sidebarPrimary: lightColorTokens.brand,
  sidebarPrimaryForeground: lightColorTokens.textInverse,
  sidebarAccent: lightColorTokens.navActiveBg,
  sidebarAccentForeground: lightColorTokens.textPrimary,
  sidebarBorder: "oklch(0.922 0 0)",
  sidebarRing: lightColorTokens.brandLight,
} as const;

/** @deprecated Use `lightShadcnTokens` — this alias exists only for back-compat with existing static imports. */
export const shadcnTokens = lightShadcnTokens;

// Follows shadcn/ui's own documented dark-theme convention (near-black
// background, low-chroma card/muted/accent surfaces) rather than inventing
// new oklch values from scratch; `background` is pushed to true black to
// match `darkColorTokens.background`.
export const darkShadcnTokens: Record<keyof typeof lightShadcnTokens, string> = {
  background: "oklch(0 0 0)",
  foreground: "oklch(0.97 0 0)",
  card: "oklch(0.09 0 0)",
  cardForeground: "oklch(0.97 0 0)",
  popover: "oklch(0.09 0 0)",
  popoverForeground: "oklch(0.97 0 0)",
  primary: darkColorTokens.brand,
  primaryForeground: darkColorTokens.textInverse,
  secondary: "oklch(0.17 0 0)",
  secondaryForeground: "oklch(0.97 0 0)",
  muted: "oklch(0.17 0 0)",
  mutedForeground: "oklch(0.65 0 0)",
  accent: "oklch(0.17 0 0)",
  accentForeground: "oklch(0.97 0 0)",
  destructive: darkColorTokens.danger,
  border: "oklch(1 0 0 / 12%)",
  input: "oklch(1 0 0 / 16%)",
  ring: darkColorTokens.brandLight,
  chart1: "oklch(0.55 0 0)",
  chart2: "oklch(0.65 0 0)",
  chart3: "oklch(0.75 0 0)",
  chart4: "oklch(0.85 0 0)",
  chart5: "oklch(0.92 0 0)",
  radius: "0.625rem",
  // Matches darkColorTokens.surface exactly — the shadcn <Sidebar> primitive's
  // own `bg-sidebar` default class wins the cascade over any `bg-[var(--color-surface)]`
  // className callers pass, so this token (not the caller's override) is what
  // actually controls the rendered color.
  sidebar: darkColorTokens.surface,
  sidebarForeground: "oklch(0.97 0 0)",
  sidebarPrimary: darkColorTokens.brand,
  sidebarPrimaryForeground: darkColorTokens.textInverse,
  sidebarAccent: darkColorTokens.navActiveBg,
  sidebarAccentForeground: darkColorTokens.textPrimary,
  sidebarBorder: "oklch(1 0 0 / 12%)",
  sidebarRing: darkColorTokens.brandLight,
} as const;

export const webThemeTokens = {
  font: {
    "--font-sans": "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
    "--font-mono": "var(--font-dm-mono), 'DM Mono', monospace",
  },
  colors: {
    "--color-bg": "var(--dg-color-bg)",
    "--color-surface": "var(--dg-color-surface)",
    "--color-bg-secondary": "var(--dg-color-bg-secondary)",
    "--color-row-alt": "var(--dg-color-row-alt)",
    "--color-row-hover": "var(--dg-color-row-hover)",
    "--color-border": "var(--dg-color-border)",
    "--color-border-light": "var(--dg-color-border-light)",
    "--color-border-focus": "var(--dg-color-border-focus)",
    "--color-text-primary": "var(--dg-color-text-primary)",
    "--color-text-secondary": "var(--dg-color-text-secondary)",
    "--color-text-muted": "var(--dg-color-text-muted)",
    "--color-text-subtle": "var(--dg-color-text-subtle)",
    "--color-text-faint": "var(--dg-color-text-faint)",
    "--color-text-inverse": "var(--dg-color-text-inverse)",
    "--color-brand": "var(--dg-color-brand)",
    "--color-brand-light": "var(--dg-color-brand-light)",
    "--color-brand-bg": "var(--dg-color-brand-bg)",
    "--color-brand-border": "var(--dg-color-brand-border)",
    "--color-nav-active-bg": "var(--dg-color-nav-active-bg)",
    "--color-primary": "var(--dg-color-primary)",
    "--color-link": "var(--dg-color-link)",
    "--color-accent-text": "var(--dg-color-accent-text)",
    "--color-control-primary": "var(--dg-color-control-primary)",
    "--color-control-primary-hover": "var(--dg-color-control-primary-hover)",
    "--color-control-primary-text": "var(--dg-color-control-primary-text)",
    "--color-control-active-bg": "var(--dg-color-control-active-bg)",
    "--color-control-active-border": "var(--dg-color-control-active-border)",
    "--color-control-active-text": "var(--dg-color-control-active-text)",
    "--color-control-active-hover": "var(--dg-color-control-active-hover)",
    "--color-success": "var(--dg-color-success)",
    "--color-success-bg": "var(--dg-color-success-bg)",
    "--color-success-text": "var(--dg-color-success-text)",
    "--color-success-border": "var(--dg-color-success-border)",
    "--color-warning": "var(--dg-color-warning)",
    "--color-warning-bg": "var(--dg-color-warning-bg)",
    "--color-warning-text": "var(--dg-color-warning-text)",
    "--color-warning-border": "var(--dg-color-warning-border)",
    "--color-danger": "var(--dg-color-danger)",
    "--color-danger-bg": "var(--dg-color-danger-bg)",
    "--color-danger-text": "var(--dg-color-danger-text)",
    "--color-danger-border": "var(--dg-color-danger-border)",
    "--color-danger-dark": "var(--dg-color-danger-dark)",
    "--color-info": "var(--dg-color-info)",
    "--color-info-bg": "var(--dg-color-info-bg)",
    "--color-info-text": "var(--dg-color-info-text)",
    "--color-info-border": "var(--dg-color-info-border)",
    "--color-dark": "var(--dg-color-dark)",
    "--color-dark-elevated": "var(--dg-color-dark-elevated)",
    "--color-today-bg": "var(--dg-color-today-bg)",
    "--color-today-text": "var(--dg-color-today-text)",
    "--color-today-border": "var(--dg-color-today-border)",
  },
} as const;

export function borderColorFromText(textHex: string, opacity = 0.35): string {
  const trimmed = textHex.trim();
  const normalized = /^#[0-9a-f]{6}$/i.test(trimmed)
    ? trimmed
    : /^#[0-9a-f]{3}$/i.test(trimmed)
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : null;

  if (!normalized) {
    return colorTokens.border;
  }

  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);

  return `rgba(${r},${g},${b},${opacity})`;
}

const mobileNavigationFonts = {
  regular: {
    fontFamily: "DMSans_400Regular",
    fontWeight: "400",
  },
  medium: {
    fontFamily: "DMSans_500Medium",
    fontWeight: "500",
  },
  bold: {
    fontFamily: "DMSans_600SemiBold",
    fontWeight: "600",
  },
  heavy: {
    fontFamily: "DMSans_700Bold",
    fontWeight: "700",
  },
} as const;

export function getMobileNavigationTheme(isDark: boolean) {
  const tokens = isDark ? darkColorTokens : lightColorTokens;
  return {
    dark: isDark,
    colors: {
      primary: tokens.brand,
      background: tokens.background,
      card: tokens.surface,
      text: tokens.textPrimary,
      border: tokens.borderSubtle,
      notification: tokens.danger,
    },
    fonts: mobileNavigationFonts,
  } as const;
}

/** @deprecated Use `getMobileNavigationTheme(isDark)` — this alias exists only for back-compat with existing static imports and always resolves to the light theme. */
export const mobileNavigationTheme = getMobileNavigationTheme(false);

export type WebTheme = "light" | "dark";

// Values that differ between the light and dark themes: color, shadow, and
// shadcn tokens, plus a handful of one-off literals (text-faint, today-*,
// info-text, danger-dark, and three ad hoc shadow values) that were
// hardcoded alongside `colorTokens`-derived values in the original flat map.
// `--dg-color-dark` / `--dg-color-dark-elevated` are deliberately NOT here —
// they represent fixed "always dark" chrome (see `stateEffectTokens.onDark*`),
// not the page theme, and live in `createStaticWebCssVariables` instead.
// Shared by the login/onboarding shells' dark-mode background — see the
// `--dg-color-auth-shell-bg` / `--dg-color-onboarding-shell-bg` entries below.
const darkVerticalShellGradient =
  "linear-gradient(to bottom, #000000 0%, #000000 40%, #040E33 100%)";

// Landing page's marketing CTA band ("Done with the spreadsheet?" — see
// apps/web/src/app/page.tsx). Light mode keeps a flat brand-blue fill; dark
// mode swaps to the same deep navy → app-blue sweep as the mobile app's
// on-duty hero card gradient (MobileAppMockup.tsx / ScheduleScreen.tsx's
// ME_HERO_CARD_GRADIENT_DARK) instead of reusing the unchanged light-mode
// blue, so the band reads as dark-mode-native rather than a light panel
// pasted onto a dark page.
const darkCtaShellGradient = "linear-gradient(to top right, #0A1442 0%, #1D3AA0 55%, #2075FF 100%)";

function themedWebCssVariables(theme: WebTheme): Record<string, string> {
  const tokens = theme === "dark" ? darkColorTokens : lightColorTokens;
  const shadows = theme === "dark" ? darkShadowTokens : shadowTokens;
  const shadcn = theme === "dark" ? darkShadcnTokens : lightShadcnTokens;
  const textFaint = theme === "dark" ? "#5B5B63" : "#718096";
  const todayText = theme === "dark" ? "#93C5FD" : "#1D4ED8";
  const todayBorder = theme === "dark" ? "#2C5282" : "#93C5FD";
  const infoText = theme === "dark" ? "#93C5FD" : "#1D4ED8";
  const dangerDark = theme === "dark" ? "#DC2626" : "#991B1B";

  const colorVars: Record<string, string> = {
    "--dg-color-bg": tokens.background,
    "--dg-color-surface": tokens.surface,
    "--dg-color-bg-secondary": tokens.surfaceSecondary,
    "--dg-color-row-alt": tokens.surfaceMuted,
    "--dg-color-row-hover": tokens.surfaceSecondary,
    "--dg-color-border": tokens.border,
    "--dg-color-border-light": tokens.borderSubtle,
    "--dg-color-border-focus": tokens.brandLight,
    "--dg-color-text-primary": tokens.textPrimary,
    "--dg-color-text-secondary": tokens.textSecondary,
    "--dg-color-text-muted": tokens.textMuted,
    "--dg-color-text-subtle": tokens.textSubtle,
    "--dg-color-text-faint": textFaint,
    "--dg-color-text-inverse": tokens.textInverse,
    "--dg-color-on-brand-text": tokens.onBrandText,
    "--dg-color-on-brand-surface": tokens.onBrandSurface,
    "--dg-color-brand": tokens.brand,
    "--dg-color-brand-light": tokens.brandLight,
    "--dg-color-brand-bg": tokens.brandSoft,
    "--dg-color-brand-border": tokens.brandBorder,
    "--dg-color-nav-active-bg": tokens.navActiveBg,
    "--dg-color-primary": tokens.brand,
    "--dg-color-link": tokens.brand,
    "--dg-color-accent-text": tokens.brand,
    "--dg-color-control-primary": tokens.controlPrimary,
    "--dg-color-control-primary-hover": tokens.controlPrimaryHover,
    "--dg-color-control-primary-text": tokens.textInverse,
    "--dg-color-control-active-bg": tokens.surfaceSecondary,
    "--dg-color-control-active-border": tokens.border,
    "--dg-color-control-active-text": tokens.textPrimary,
    "--dg-color-control-active-hover": tokens.borderSubtle,
    "--dg-color-success": tokens.success,
    "--dg-color-success-bg": tokens.successSoft,
    "--dg-color-success-text": tokens.successText,
    "--dg-color-success-border": tokens.successBorder,
    "--dg-color-warning": tokens.warning,
    "--dg-color-warning-bg": tokens.warningSoft,
    "--dg-color-warning-text": tokens.warningText,
    "--dg-color-warning-border": tokens.warningBorder,
    "--dg-color-danger": tokens.danger,
    "--dg-color-danger-bg": tokens.dangerSoft,
    "--dg-color-danger-text": tokens.dangerText,
    "--dg-color-danger-border": tokens.dangerBorder,
    "--dg-color-danger-dark": dangerDark,
    "--dg-color-info": tokens.brandLight,
    "--dg-color-info-bg": tokens.brandSoft,
    "--dg-color-info-text": infoText,
    "--dg-color-info-border": tokens.brandBorder,
    "--dg-color-today-bg": tokens.brandSoft,
    "--dg-color-today-text": todayText,
    "--dg-color-today-border": todayBorder,
    "--dg-color-shadow": tokens.shadow,
    "--dg-color-shadow-strong": tokens.shadowStrong,
    // Strong grid dividers (schedule header's bottom rule, week-split line):
    // need to read as a heavier line than the regular day dividers in both
    // themes, but `--color-dark` (fixed near-black chrome) is invisible
    // against dark mode's near-black surfaces, so this tracks the theme
    // instead.
    "--dg-color-grid-divider-strong": theme === "dark" ? tokens.textMuted : tokens.textPrimary,
    // Recurring-shifts table header's bottom rule (see
    // RecurringScheduleSection.tsx): same fixed-`--color-dark`-is-invisible
    // problem as the grid divider above, but this one needs full white in
    // dark mode specifically to stand out against the header row.
    "--dg-color-table-divider-strong": theme === "dark" ? "#FFFFFF" : tokens.textPrimary,
    // Full-page background behind the login/onboarding auth card (see
    // .dg-auth-shell) and the onboarding wizard shell (see WizardShell.tsx):
    // a black-to-vibrant-blue top-to-bottom sweep in dark mode instead of a
    // flat surface fill, echoing the brand blue without competing with the
    // card. Held at pure black through the first 40% so the sweep reads as a
    // slow build into blue rather than an even 0-to-100 fade. Light mode
    // keeps each shell's existing (non-vibrant) fill.
    "--dg-color-auth-shell-bg": theme === "dark" ? darkVerticalShellGradient : tokens.surface,
    "--dg-color-onboarding-shell-bg":
      theme === "dark"
        ? darkVerticalShellGradient
        : `linear-gradient(to bottom, ${tokens.background} 0%, ${tokens.brandSoft} 100%)`,
    "--dg-color-cta-shell-bg": theme === "dark" ? darkCtaShellGradient : tokens.brand,
  };

  const colorAliasVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colorVars)) {
    colorAliasVars[key.replace(/^--dg-color-/, "--color-")] = value;
  }

  return {
    ...colorVars,
    ...colorAliasVars,
    "--shadow-raised": shadows.raised,
    "--shadow-float": shadows.float,
    "--shadow-menu": shadows.menu,
    "--shadow-modal": shadows.modal,
    "--shadow-panel": shadows.panel,
    "--shadow-drag": shadows.drag,
    "--tooltip-shadow": shadows.tooltip,
    "--dg-shadow-sidebar-toggle":
      theme === "dark" ? "0 1px 4px rgba(0, 0, 0, 0.5)" : "0 1px 4px rgba(0,0,0,0.08)",
    "--dg-shadow-staff-detail":
      theme === "dark"
        ? "0 8px 40px rgba(0, 0, 0, 0.7), 0 2px 12px rgba(0, 0, 0, 0.5)"
        : "0 8px 40px rgba(0, 0, 0, 0.16), 0 2px 12px rgba(0, 0, 0, 0.08)",
    "--dg-shadow-auth-card":
      theme === "dark" ? "0 2px 16px rgba(0, 0, 0, 0.5)" : "0 2px 16px rgba(0, 0, 0, 0.07)",
    "--background": shadcn.background,
    "--foreground": shadcn.foreground,
    "--card": shadcn.card,
    "--card-foreground": shadcn.cardForeground,
    "--popover": shadcn.popover,
    "--popover-foreground": shadcn.popoverForeground,
    "--primary": shadcn.primary,
    "--primary-foreground": shadcn.primaryForeground,
    "--secondary": shadcn.secondary,
    "--secondary-foreground": shadcn.secondaryForeground,
    "--muted": shadcn.muted,
    "--muted-foreground": shadcn.mutedForeground,
    "--accent": shadcn.accent,
    "--accent-foreground": shadcn.accentForeground,
    "--destructive": shadcn.destructive,
    "--border": shadcn.border,
    "--input": shadcn.input,
    "--ring": shadcn.ring,
    "--chart-1": shadcn.chart1,
    "--chart-2": shadcn.chart2,
    "--chart-3": shadcn.chart3,
    "--chart-4": shadcn.chart4,
    "--chart-5": shadcn.chart5,
    "--radius": shadcn.radius,
    "--sidebar": shadcn.sidebar,
    "--sidebar-foreground": shadcn.sidebarForeground,
    "--sidebar-primary": shadcn.sidebarPrimary,
    "--sidebar-primary-foreground": shadcn.sidebarPrimaryForeground,
    "--sidebar-accent": shadcn.sidebarAccent,
    "--sidebar-accent-foreground": shadcn.sidebarAccentForeground,
    "--sidebar-border": shadcn.sidebarBorder,
    "--sidebar-ring": shadcn.sidebarRing,
  };
}

// Values that are identical in both themes — spacing, typography, radius,
// motion, layout dimensions, plus the "always dark" chrome colors and the
// on-dark/toast/overlay state-effect tokens (see `themedWebCssVariables` for
// why those specific color-named tokens stay fixed instead of following the
// active theme). Safe to inject once as a static inline style.
export function createStaticWebCssVariables(): Record<string, string> {
  return {
    "--dg-color-dark": lightColorTokens.textPrimary,
    "--dg-color-dark-elevated": lightColorTokens.textSecondary,
    "--color-dark": lightColorTokens.textPrimary,
    "--color-dark-elevated": lightColorTokens.textSecondary,
    "--header-height": webLayoutTokens.headerHeight,
    "--dg-toolbar-h": webLayoutTokens.toolbarHeight,
    "--dg-btn-radius": buttonTokens.radius,
    "--dg-btn-h": buttonTokens.height,
    "--dg-btn-h-sm": buttonTokens.heightSm,
    "--dg-btn-h-xs": buttonTokens.heightXs,
    "--dg-btn-h-lg": buttonTokens.heightLg,
    "--dg-btn-px": buttonTokens.paddingX,
    "--dg-btn-px-sm": buttonTokens.paddingXSm,
    "--dg-btn-px-xs": buttonTokens.paddingXXs,
    "--dg-btn-gap": buttonTokens.gap,
    "--dg-btn-icon": buttonTokens.iconSize,
    "--dg-fs-page-title": typographyTokens.fontSize.pageTitle,
    "--dg-fs-section-title": typographyTokens.fontSize.sectionTitle,
    "--dg-fs-card-title": typographyTokens.fontSize.cardTitle,
    "--dg-fs-heading": typographyTokens.fontSize.heading,
    "--dg-fs-title": typographyTokens.fontSize.title,
    "--dg-fs-body": typographyTokens.fontSize.body,
    "--dg-fs-body-sm": typographyTokens.fontSize.bodySm,
    "--dg-fs-label": typographyTokens.fontSize.label,
    "--dg-fs-caption": typographyTokens.fontSize.caption,
    "--dg-fs-footnote": typographyTokens.fontSize.footnote,
    "--dg-fs-badge": typographyTokens.fontSize.badge,
    "--dg-fs-micro": typographyTokens.fontSize.micro,
    "--dg-space-xs": webSpacingTokens.xs,
    "--dg-space-sm": webSpacingTokens.sm,
    "--dg-space-md": webSpacingTokens.md,
    "--dg-space-lg": webSpacingTokens.lg,
    "--dg-space-xl": webSpacingTokens.xl,
    "--dg-space-2xl": webSpacingTokens["2xl"],
    "--dg-space-3xl": webSpacingTokens["3xl"],
    "--dg-space-4xl": webSpacingTokens["4xl"],
    "--dg-space-5xl": webSpacingTokens["5xl"],
    "--dg-lh-tight": typographyTokens.lineHeight.tight,
    "--dg-lh-normal": typographyTokens.lineHeight.normal,
    "--dg-lh-loose": typographyTokens.lineHeight.loose,
    "--dg-grid-name-col": webLayoutTokens.gridNameColumn,
    "--dg-grid-cell-height": webLayoutTokens.gridCellHeight,
    "--dg-grid-col-min": webLayoutTokens.gridColumnMin,
    "--dg-grid-name-col-tablet": webResponsiveTokens.tablet.gridNameColumn,
    "--dg-grid-col-min-tablet": webResponsiveTokens.tablet.gridColumnMin,
    "--dg-fs-page-title-small-desktop": webResponsiveTokens.smallDesktop.pageTitle,
    "--dg-fs-section-title-small-desktop": webResponsiveTokens.smallDesktop.sectionTitle,
    "--dg-toolbar-h-mobile": webResponsiveTokens.mobile.toolbarHeight,
    "--dg-fs-page-title-mobile": webResponsiveTokens.mobile.pageTitle,
    "--dg-fs-section-title-mobile": webResponsiveTokens.mobile.sectionTitle,
    "--dg-fs-card-title-mobile": webResponsiveTokens.mobile.cardTitle,
    "--dg-fs-heading-mobile": webResponsiveTokens.mobile.heading,
    "--dg-fs-title-mobile": webResponsiveTokens.mobile.title,
    "--dg-fs-badge-mobile": webResponsiveTokens.mobile.badge,
    "--dg-fs-micro-mobile": webResponsiveTokens.mobile.micro,
    "--dg-grid-name-col-mobile": webResponsiveTokens.mobile.gridNameColumn,
    "--tooltip-font-size": "var(--dg-fs-label)",
    "--tooltip-border-radius": "var(--dg-radius-sm)",
    "--dg-duration-fast": motionTokens.fast,
    "--dg-duration-standard": motionTokens.standard,
    "--dg-radius-sm": webRadiusTokens.sm,
    "--dg-radius-md": webRadiusTokens.md,
    "--dg-radius-lg": webRadiusTokens.lg,
    "--dg-radius-xl": webRadiusTokens.xl,
    "--dg-tab-shell-radius": webRadiusTokens.tabShell,
    "--dg-tab-shell-pad": webRadiusTokens.tabShellPad,
    "--dg-tab-inner-radius": webRadiusTokens.tabInner,
    "--dg-overlay": overlayTokens.background,
    "--dg-overlay-blur": overlayTokens.blur,
    "--dg-focus-ring": stateEffectTokens.focusRing,
    "--dg-danger-ring": stateEffectTokens.dangerRing,
    "--dg-locked-bg": stateEffectTokens.lockedBackground,
    "--dg-on-dark-muted": stateEffectTokens.onDarkMuted,
    "--dg-on-dark-subtle": stateEffectTokens.onDarkSubtle,
    "--dg-on-dark-secondary": stateEffectTokens.onDarkSecondary,
    "--dg-on-dark-description": stateEffectTokens.onDarkDescription,
    "--dg-on-dark-control": stateEffectTokens.onDarkControl,
    "--dg-on-dark-control-hover": stateEffectTokens.onDarkControlHover,
    "--dg-on-dark-control-border": stateEffectTokens.onDarkControlBorder,
    "--dg-toast-success-bg": toastTokens.successBackground,
    "--dg-toast-success-border": toastTokens.successBorder,
    "--dg-toast-error-bg": toastTokens.errorBackground,
    "--dg-toast-error-border": toastTokens.errorBorder,
    "--dg-toast-info-bg": toastTokens.infoBackground,
    "--dg-toast-info-border": toastTokens.infoBorder,
    "--dg-toast-warning-bg": toastTokens.warningBackground,
    "--dg-toast-warning-border": toastTokens.warningBorder,
  };
}

/**
 * Full flat CSS var map for a given theme (static + themed merged) —
 * preserves the pre-dark-mode `createWebCssVariables()` contract (no-arg
 * call defaults to light) for existing consumers like `tokens.test.ts`.
 */
export function createWebCssVariables(theme: WebTheme = "light"): Record<string, string> {
  return {
    ...createStaticWebCssVariables(),
    ...themedWebCssVariables(theme),
  };
}

/**
 * Generates `:root { ... } .dark { ... } .dg-force-light { ... }` CSS text
 * for the themed subset of variables, meant to be injected as a `<style>`
 * tag in `apps/web/src/app/layout.tsx` alongside `createStaticWebCssVariables()`
 * applied once as a static inline style on `<html>`.
 *
 * `.dg-force-light` re-pins every themed var back to its light value —
 * apply it to a subtree (e.g. the public marketing page) that must always
 * render light regardless of the visitor's system/selected theme. Custom
 * properties resolve by nearest ancestor definition, so this wins over an
 * inherited `.dark` on `<html>` without needing extra specificity.
 *
 * The trailing `@media print` block re-pins the same vars to light for
 * every printed page and browser print-preview, regardless of the active
 * theme — printed output should never come out dark-mode-styled. It's
 * appended last so, at equal specificity, source order lets it win over
 * `.dark` whenever the media query matches.
 */
export function createThemedCssText(): string {
  const toDeclarations = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join("\n");

  const lightDeclarations = toDeclarations(themedWebCssVariables("light"));

  return `:root {\n${lightDeclarations}\n}\n\n.dark {\n${toDeclarations(themedWebCssVariables("dark"))}\n}\n\n.dg-force-light {\n${lightDeclarations}\n}\n\n@media print {\n  :root,\n  .dark {\n${lightDeclarations}\n  }\n}\n`;
}
