export const mobileColors = {
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
  success: "#16A34A",
  successSoft: "#F0FDF4",
  successBorder: "#BBF7D0",
  warning: "#F59E0B",
  warningSoft: "#FFFBEB",
  warningBorder: "#FDE68A",
  danger: "#EF4444",
  dangerSoft: "#FEF2F2",
  dangerBorder: "#FECACA",
  shadow: "rgba(15, 23, 42, 0.08)",
  shadowStrong: "rgba(15, 23, 42, 0.14)",
} as const;

export const mobileSpacing = {
  screenX: 20,
  sectionGap: 18,
  cardGap: 12,
} as const;

export const mobileRadii = {
  card: 24,
  control: 18,
  pill: 999,
} as const;

export const dubGridNavigationTheme = {
  dark: false,
  colors: {
    primary: mobileColors.brand,
    background: mobileColors.background,
    card: mobileColors.surface,
    text: mobileColors.textPrimary,
    border: mobileColors.borderSubtle,
    notification: mobileColors.danger,
  },
  fonts: {
    regular: {
      fontFamily: "System",
      fontWeight: "400",
    },
    medium: {
      fontFamily: "System",
      fontWeight: "500",
    },
    bold: {
      fontFamily: "System",
      fontWeight: "600",
    },
    heavy: {
      fontFamily: "System",
      fontWeight: "700",
    },
  },
} as const;
