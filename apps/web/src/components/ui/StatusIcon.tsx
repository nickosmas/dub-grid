import {
  AlarmClock,
  Plane,
  CalendarCheck,
  CalendarCog,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  CalendarX,
  CalendarX2,
  CreditCard,
  FilePen,
  FileWarning,
  FlaskConical,
  MonitorSmartphone,
  Pause,
  ShieldOff,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  UserSearch,
  CircleCheck,
  CircleCheckBig,
  CircleX,
  Clock,
  Eye,
  Hourglass,
  Info,
  Lock,
  Mail,
  MailX,
  Moon,
  ShieldAlert,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import type { StatusIconTone } from "@dubgrid/design-tokens";

/**
 * A Lucide shape drawn solid: `fill` paths in the icon colour, `stroke` paths
 * as lines in the icon colour, and `cut` marks (lines) and `cutFill` shapes in
 * the colour behind the icon, so they read as holes.
 */
type SolidGlyph = { fill: string[]; stroke?: string[]; cut?: string[]; cutFill?: string[] };

const CIRCLE = "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z";
const MAIL = "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const MAIL_FLAP = "m21 7.5-8.47 5.4a1 1 0 0 1-1.06 0L3 7.5";
const CALENDAR = "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";
const PAGE = "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z";
const PERSON_HEAD = "M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z";
const PERSON_BODY = "M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2z";

function calendar(...marks: string[]): SolidGlyph {
  return { fill: [CALENDAR], stroke: ["M8 2v4", "M16 2v4"], cut: ["M2 10h20", ...marks] };
}

function person(...marks: string[]): SolidGlyph {
  return { fill: [PERSON_HEAD, PERSON_BODY], stroke: marks };
}

const TONE_GLYPHS: Record<StatusIconTone, SolidGlyph> = {
  success: { fill: [CIRCLE], cut: ["m8.5 12 2.5 2.5 4.5-5"] },
  warning: {
    fill: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"],
    cut: ["M12 9.5v3.5", "M12 17h.01"],
  },
  info: { fill: [CIRCLE], cut: ["M12 16v-4", "M12 8h.01"] },
  danger: {
    fill: [
      "M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",
    ],
    cut: ["M12 7.5v5", "M12 16.5h.01"],
  },
};

// Own icons with a natural solid form. Any other own icon sits in a tone circle,
// so an icon drawn in a ring needs an entry here, or it shows a ring in a disc.
const SOLID_GLYPHS = new Map<LucideIcon, SolidGlyph>([
  [
    Plane,
    {
      fill: [
        "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
      ],
    },
  ],
  [CalendarCheck, calendar("m9 16 2 2 4-4")],
  [CalendarRange, calendar("M17 14h-6", "M13 18H7", "M7 14h.01", "M17 18h.01")],
  [
    CalendarDays,
    calendar("M8 14h.01", "M12 14h.01", "M16 14h.01", "M8 18h.01", "M12 18h.01", "M16 18h.01"),
  ],
  [CalendarX, calendar("m14 14-4 4", "m10 14 4 4")],
  [CalendarX2, calendar("m14 14-4 4", "m10 14 4 4")],
  [CalendarCog, calendar("M12 16a2 2 0 1 0 0 .01")],
  [CalendarOff, calendar("m4 4 16 16")],
  [
    Trash2,
    {
      fill: ["M5 6h14v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"],
      stroke: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
      cut: ["M10 11v6", "M14 11v6"],
    },
  ],
  [
    CreditCard,
    {
      fill: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"],
      cut: ["M1 10h22", "M6 15h4"],
    },
  ],
  [
    Pause,
    {
      fill: [
        "M6 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
        "M15 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
      ],
    },
  ],
  [FileWarning, { fill: [PAGE], cut: ["M12 10v4", "M12 17.5h.01"] }],
  [FilePen, { fill: [PAGE], cut: ["m8.5 17.5 6-6"] }],
  [
    FlaskConical,
    {
      fill: [
        "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2z",
      ],
      stroke: ["M8.5 2h7"],
      cut: ["M6.5 15h11"],
    },
  ],
  [
    ShieldOff,
    {
      fill: [
        "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      ],
      cut: ["m4 4 16 16"],
    },
  ],
  [
    MonitorSmartphone,
    {
      fill: [
        "M4 4h12a2 2 0 0 1 2 2v2h-2a2 2 0 0 0-2 2v5H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
        "M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z",
      ],
      stroke: ["M9 15v4", "M6.5 19h5"],
    },
  ],
  [UserPlus, person("M19 8v6", "M22 11h-6")],
  [UserMinus, person("M22 11h-6")],
  [UserCheck, person("m16 11 2 2 4-4")],
  [
    UserSearch,
    {
      fill: ["M10 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z", "M3 21v-2a4 4 0 0 1 4-4h4v6z"],
      stroke: ["M17 14a3 3 0 1 0 0 6a3 3 0 1 0 0-6z", "m21 21-1.9-1.9"],
    },
  ],
  [CircleCheck, TONE_GLYPHS.success],
  [CircleCheckBig, TONE_GLYPHS.success],
  [Info, TONE_GLYPHS.info],
  [CircleX, { fill: [CIRCLE], cut: ["m15 9-6 6", "m9 9 6 6"] }],
  [
    AlarmClock,
    {
      fill: ["M12 5a8 8 0 1 0 0 16a8 8 0 1 0 0-16z"],
      stroke: ["M5 3 2 6", "m22 6-3-3", "M6.38 18.7 4 21", "M17.64 18.67 20 21"],
      cut: ["M12 9v4l2 2"],
    },
  ],
  [
    Lock,
    {
      fill: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z"],
      stroke: ["M7 11V7a5 5 0 0 1 10 0v4"],
    },
  ],
  [
    Hourglass,
    {
      fill: [
        "M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22z",
        "M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2z",
      ],
      stroke: ["M5 22h14", "M5 2h14"],
    },
  ],
  [Clock, { fill: [CIRCLE], cut: ["M12 6.5V12l3.5 2"] }],
  [Mail, { fill: [MAIL], cut: [MAIL_FLAP] }],
  [
    MailX,
    {
      fill: ["M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9z"],
      stroke: ["m17 17 4 4", "m21 17-4 4"],
      cut: [MAIL_FLAP],
    },
  ],
  [Moon, { fill: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"] }],
  [
    VenetianMask,
    {
      fill: [
        "M2 12a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V7h-5a8 8 0 0 0-5 2 8 8 0 0 0-5-2H2Z",
      ],
      cutFill: ["M6 11c1.5 0 3 .5 3 2-2 0-3 0-3-2Z", "M18 11c-1.5 0-3 .5-3 2 2 0 3 0 3-2Z"],
    },
  ],
  [
    Eye,
    {
      fill: [
        "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
      ],
      cutFill: ["M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z"],
    },
  ],
  [
    ShieldAlert,
    {
      fill: [
        "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
      ],
      cut: ["M12 8v4", "M12 16h.01"],
    },
  ],
]);

export interface StatusIconProps {
  tone: StatusIconTone;
  /** An own icon in place of the tone's shape. */
  icon?: LucideIcon;
  size: number;
  /**
   * Sets `color` (the icon) and `--dg-icon-cut` (the colour behind it, which
   * its marks are drawn in).
   */
  className?: string;
}

/** A tone or own icon drawn solid, with its marks cut out to the background. */
export function StatusIcon({ tone, icon, size, className }: StatusIconProps) {
  const solid = icon ? SOLID_GLYPHS.get(icon) : TONE_GLYPHS[tone];

  if (icon && !solid) {
    const Glyph = icon;
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d={CIRCLE} fill="currentColor" />
        <Glyph
          x={5.25}
          y={5.25}
          width={13.5}
          height={13.5}
          strokeWidth={2.4}
          className="text-[var(--dg-icon-cut)]"
        />
      </svg>
    );
  }

  const glyph = solid ?? TONE_GLYPHS[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`overflow-visible ${className ?? ""}`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph.fill.map((d) => (
        <path key={d} d={d} fill="currentColor" stroke="currentColor" strokeWidth={2} />
      ))}
      {glyph.stroke?.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth={2} />
      ))}
      {glyph.cut?.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeWidth={2.25}
          className="stroke-[var(--dg-icon-cut)]"
        />
      ))}
      {glyph.cutFill?.map((d) => (
        <path
          key={d}
          d={d}
          strokeWidth={0.5}
          className="fill-[var(--dg-icon-cut)] stroke-[var(--dg-icon-cut)]"
        />
      ))}
    </svg>
  );
}
