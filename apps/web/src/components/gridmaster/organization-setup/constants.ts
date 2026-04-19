export const STEPS = [
  { key: "details", label: "Details" },
  { key: "super-admin", label: "Super Admin" },
  { key: "decision", label: "" },
  { key: "config", label: "Config" },
  { key: "employees", label: "Employees" },
  { key: "invitations", label: "Invitations" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export const COLOR_PRESETS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
  "#F97316",
  "#6366F1",
  "#14B8A6",
  "#E11D48",
  "#0EA5E9",
  "#A855F7",
  "#22C55E",
];
