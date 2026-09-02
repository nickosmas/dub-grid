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
  mobileIconToneTokens,
  getMobileIconToneColor,
  MOBILE_DECORATIVE_ICON_TONES,
  type MobileIconTone,
  type MobileIconToneName,
} from "./icon-tone";

export {
  getReadableTextColor,
  borderColor,
  toDarkPillColors,
  resolveShiftPillColors,
  visiblePillBorder,
  type ShiftPillColors,
} from "./pill-colors";

export { getHeroGradientCss, heroGradientTokens, type HeroGradientStops } from "./hero-gradient";

export {
  getSoftGradientCss,
  getSoftGradientStops,
  softGradientTokens,
  type SoftGradientKind,
  type SoftGradientStops,
} from "./soft-gradient";

export {
  darkMobileElevationTokens,
  getMobileElevation,
  mobileElevationTokens,
  type MobileElevation,
  type MobileElevationLevel,
} from "./elevation";

export {
  getMobileEasingCurve,
  mobileMotionTokens,
  type MobileDurationName,
  type MobileEasingCurve,
  type MobileEasingName,
  type MobileSpringConfig,
  type MobileSpringName,
} from "./motion";

export { resolveJobChipTone, type JobChipTone, type JobChipToneContext } from "./job-chip-tone";

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

/**
 * Named layout slots for mobile. Kept as-is for existing call sites; new work
 * should reach for `mobileSpacing` below unless one of these names genuinely
 * describes the slot.
 */
export const spacingTokens = {
  screenX: 16,
  /** Vertical rhythm between cards/sections on a mobile screen. */
  sectionGap: 32,
  /**
   * @deprecated Disagrees with the real card gap. `Screen.tsx`'s Card uses
   * `mobileSpacingTokens.md` (12); this 8 is only still read by
   * OrganizationLockedScreen. Migrate that call site and remove.
   */
  cardGap: 8,
} as const;

/**
 * The mobile spacing ramp, in density-independent pixels.
 *
 * `webSpacingTokens` are `"px"` strings that React Native can't consume, so
 * mobile had no scale to reach for and screens hand-rolled numbers instead
 * (ScheduleScreen alone had ~190 raw values against 12 token references).
 * Values match the web ramp one-for-one so the two platforms stay in step.
 */
export const mobileSpacingTokens = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
} as const;

/**
 * Toast fills. Deliberately fixed across themes: a toast is a transient
 * high-contrast overlay, not a themed surface, and it always pairs a saturated
 * fill with `textInverse`. They live here rather than inline in the mobile
 * provider so they're part of the design system like everything else.
 */
export const toastToneTokens = {
  error: { background: "#DC2626", border: "#B91C1C" },
  success: { background: "#16A34A", border: "#166534" },
  info: { background: "#1D4ED8", border: "#1E3A8A" },
  warning: { background: "#D97706", border: "#92400E" },
} as const;

export const radiusTokens = {
  card: 16,
  control: 12,
  pill: 999,
} as const;

/**
 * Radius ramp for mobile surfaces smaller than a card — chips, inputs, inline
 * badges. `radiusTokens` stays the vocabulary for the three named roles.
 */
export const mobileRadiusTokens = {
  sm: 6,
  md: 8,
  lg: 10,
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
  /**
   * Weight lives in `fontFamily` alone - these tokens deliberately carry no
   * `fontWeight`, and adding one back silently breaks Android.
   *
   * DM Sans ships as four separate single-weight files, and `expo-font`
   * registers each one under its own family name at style NORMAL only. Naming a
   * numeric weight next to the family reads as harmless (`DMSans_700Bold` is
   * already 700) but sends Android down a different path: it asks that
   * one-face family for a BOLD face, finds none registered and no
   * `DMSans_700Bold_bold` asset to load, and falls back to the *system* font.
   * The text renders in Roboto, at roughly the right weight, which is why this
   * hid for so long - only anything at 500 and up was affected, since 400
   * resolves to the NORMAL face that is actually there. iOS resolves the family
   * either way, so it looked correct there throughout.
   *
   * To render a token at a different weight, move the family:
   * `mobileTextWeighted(variant, weight)`.
   */
  text: {
    screenTitle: {
      fontFamily: "DMSans_700Bold",
      fontSize: 22,
      lineHeight: 28,
    },
    heroMetric: {
      fontFamily: "DMSans_700Bold",
      fontSize: 24,
      lineHeight: 30,
    },
    sectionTitle: {
      fontFamily: "DMSans_700Bold",
      fontSize: 16,
      lineHeight: 22,
    },
    cardTitle: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 16,
      lineHeight: 22,
    },
    rowTitle: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 15,
      lineHeight: 21,
    },
    body: {
      fontFamily: "DMSans_400Regular",
      fontSize: 14,
      lineHeight: 21,
    },
    bodyStrong: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 14,
      lineHeight: 21,
    },
    meta: {
      fontFamily: "DMSans_400Regular",
      fontSize: 13,
      lineHeight: 18,
    },
    label: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 12,
      lineHeight: 16,
    },
    caption: {
      fontFamily: "DMSans_400Regular",
      fontSize: 12,
      lineHeight: 16,
    },
    badge: {
      fontFamily: "DMSans_700Bold",
      fontSize: 11,
      lineHeight: 14,
    },
    micro: {
      fontFamily: "DMSans_600SemiBold",
      fontSize: 10,
      lineHeight: 12,
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
  background: "#FCFCFC",
  foreground: "#171717",
  card: "#FFFFFF",
  cardForeground: "#171717",
  popover: "#FFFFFF",
  popoverForeground: "#171717",
  primary: lightColorTokens.brand,
  primaryForeground: lightColorTokens.textInverse,
  secondary: "#EEEEEE",
  secondaryForeground: "#262626",
  muted: "#EEEEEE",
  mutedForeground: "#666666",
  accent: "#EEEEEE",
  accentForeground: "#171717",
  destructive: lightColorTokens.danger,
  border: "#E5E5E5",
  input: "#E5E5E5",
  ring: lightColorTokens.brandLight,
  chart1: "oklch(0.87 0 0)",
  chart2: "oklch(0.556 0 0)",
  chart3: "oklch(0.439 0 0)",
  chart4: "oklch(0.371 0 0)",
  chart5: "oklch(0.269 0 0)",
  radius: "0.625rem",
  sidebar: "#FFFFFF",
  sidebarForeground: "#171717",
  sidebarPrimary: lightColorTokens.brand,
  sidebarPrimaryForeground: lightColorTokens.textInverse,
  sidebarAccent: "#E5E5E5",
  sidebarAccentForeground: "#171717",
  sidebarBorder: "#E5E5E5",
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
