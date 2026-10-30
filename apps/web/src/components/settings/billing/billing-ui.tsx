import type { ReactNode } from "react";
import {
  AlarmClock,
  Armchair,
  CalendarDays,
  CircleCheck,
  CalendarX,
  Clock,
  CreditCard,
  Database,
  Hourglass,
  Info,
  Lock,
  Pause,
  ReceiptText,
  ShieldOff,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import type { BillingIconKey, BillingStatTone } from "@/features/billing/overview";
import { billingToneColors, type BillingToneColors } from "@/features/billing/trial-status";
import { sectionHeaderStyle, sectionStyle } from "@/lib/styles";

export const BILLING_ICONS: Record<BillingIconKey, LucideIcon> = {
  pending: Hourglass,
  paused: Pause,
  locked: Lock,
  suspended: ShieldOff,
  card: CreditCard,
  alarm: AlarmClock,
  "calendar-x": CalendarX,
  info: Info,
  users: Users,
  seat: Armchair,
  clock: Clock,
  calendar: CalendarDays,
  receipt: ReceiptText,
  data: Database,
  check: CircleCheck,
  "user-plus": UserPlus,
  "user-minus": UserMinus,
};

const NEUTRAL: BillingToneColors = {
  bg: "var(--dg-color-surface-alt)",
  border: "var(--dg-color-border)",
  text: "var(--dg-color-text-secondary)",
};

export function toneColors(tone: BillingStatTone): BillingToneColors {
  return tone === "neutral" ? NEUTRAL : billingToneColors(tone);
}

export function IconTile({
  icon,
  tone,
  size = 40,
}: {
  icon: BillingIconKey;
  tone: BillingStatTone;
  size?: number;
}) {
  const Icon = BILLING_ICONS[icon];
  const colors = toneColors(tone);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size > 48 ? 24 : "var(--dg-radius-lg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.bg,
        color: colors.text,
        flexShrink: 0,
      }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.7} />
    </span>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: BillingStatTone }) {
  const colors = toneColors(tone);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "0 9px",
        borderRadius: "9999px",
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.text,
        fontSize: "var(--dg-fs-caption)",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function BillingBanner({
  tone,
  icon,
  children,
}: {
  tone: BillingStatTone;
  icon: BillingIconKey;
  children: ReactNode;
}) {
  return (
    <Banner
      tone={tone === "neutral" ? "info" : tone}
      icon={BILLING_ICONS[icon]}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </Banner>
  );
}

/** Tabs that fill the row in equal parts on a phone and size to their labels beside a title. */
export const EVEN_TABS = "w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none";

export function BillingCard({
  icon,
  title,
  headingId,
  aside,
  children,
  footer,
}: {
  icon: BillingIconKey;
  title: string;
  headingId: string;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const Icon = BILLING_ICONS[icon];
  return (
    <section aria-labelledby={headingId} style={{ ...sectionStyle, width: "100%" }}>
      <div
        style={{
          ...sectionHeaderStyle,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span id={headingId} style={{ flex: 1, minWidth: 0 }}>
          {title}
        </span>
        {aside}
      </div>
      {children}
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </section>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return (
    <div className="dg-footer-bar flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
      {children}
    </div>
  );
}

export function FooterNote({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        flex: 1,
        minWidth: 0,
        color: "var(--dg-color-text-muted)",
        fontSize: "var(--dg-fs-caption)",
        lineHeight: 1.45,
      }}
    >
      {children}
    </span>
  );
}

/** Peer buttons at one width: the full row on a phone, side by side beside the note on wider screens. */
export function FooterActions({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-full shrink-0 auto-cols-fr grid-flow-col gap-2 sm:w-auto [&_.dg-btn]:w-full [&_.dg-btn]:justify-center">
      {children}
    </div>
  );
}

/** A ring that fills by `fraction`; the number and unit sit inside, the caption below. */
export function ProgressRing({
  value,
  unit,
  caption,
  fraction,
  color,
  size = 120,
}: {
  value: string;
  unit?: string;
  caption: string;
  fraction: number;
  color: string;
  size?: number;
}) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * Math.min(1, Math.max(fraction, 0.02));
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        width: size + 8,
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${value}${unit ? ` ${unit}` : ""}: ${caption}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--dg-color-surface-alt)"
          strokeWidth={9}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y={unit ? size / 2 + 2 : size / 2 + 10}
          textAnchor="middle"
          className="dg-tabular-nums"
          style={{ fontSize: 30, fontWeight: 700, fill: "var(--dg-color-text-primary)" }}
        >
          {value}
        </text>
        {unit ? (
          <text
            x="50%"
            y={size / 2 + 21}
            textAnchor="middle"
            style={{ fontSize: 12, fontWeight: 500, fill: "var(--dg-color-text-muted)" }}
          >
            {unit}
          </text>
        ) : null}
      </svg>
      <span
        style={{
          fontSize: "var(--dg-fs-caption)",
          fontWeight: 500,
          color: "var(--dg-color-text-muted)",
          textAlign: "center",
          lineHeight: 1.35,
        }}
      >
        {caption}
      </span>
    </div>
  );
}
