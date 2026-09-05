import { ChevronRight } from "lucide-react";
/* ── Staff view mockup ────────────────────────────────────────────────────
   Mirrors the Members directory under /people. Real components:
   apps/web/src/components/StaffView.tsx + staff/MembersSection + the row
   markup in staff/StaffTableRow.tsx. Columns shown: # / checkbox, Name +
   avatar (email subtitle), Status pill, Focus Areas (neutral StatusPills,
   no color dots), Certification (plain text), Account (tonal StatusPill).
   ── */

import { getAvatarTone } from "@dubgrid/design-tokens";

/* ── Focus areas from Calm Haven seed ── */
const FOCUS_AREAS = ["Skilled Nursing", "Sheltered Care", "Night Shift", "Visiting CSNS"];

type Tone = "success" | "warning" | "danger" | "neutral";

/* ── StatusPill tone palette — mirrors components/ui/status-pill.tsx ── */
const TONES: Record<Tone, { bg: string; text: string; border: string }> = {
  success: {
    bg: "var(--dg-color-success-bg)",
    text: "var(--dg-color-success-text)",
    border: "var(--dg-color-success-border)",
  },
  warning: {
    bg: "var(--dg-color-warning-bg)",
    text: "var(--dg-color-warning-text)",
    border: "var(--dg-color-warning-border)",
  },
  danger: {
    bg: "var(--dg-color-danger-bg)",
    text: "var(--dg-color-danger-text)",
    border: "var(--dg-color-danger-border)",
  },
  neutral: {
    bg: "var(--dg-color-bg-secondary)",
    text: "var(--dg-color-text-secondary)",
    border: "var(--dg-color-border-light)",
  },
};

function StatusPill({
  tone = "neutral",
  children,
  dot,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
}) {
  const vars = TONES[tone];
  const showDot = dot ?? tone !== "neutral";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: "var(--dg-radius-sm)",
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 500,
        background: vars.bg,
        color: vars.text,
        border: `1px solid ${vars.border}`,
        whiteSpace: "nowrap" as const,
        lineHeight: 1.4,
      }}
    >
      {showDot && (
        <span
          aria-hidden="true"
          style={{
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: vars.text,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

type Person = {
  rank: number;
  name: string;
  email: string;
  initials: string;
  /** Seed into the shared avatar palette, chosen so the six rows spread. */
  avatarSeed: string;
  focusAreas: number[];
  cert: string;
  account: { label: string; tone: Tone };
};

const STAFF: Person[] = [
  {
    rank: 1,
    name: "Margaret Sullivan",
    email: "margaret.sullivan@calmhaven.test",
    initials: "MS",
    avatarSeed: "staff-3",
    focusAreas: [0],
    cert: "JLCSN",
    account: { label: "Linked", tone: "success" },
  },
  {
    rank: 2,
    name: "Carol Henderson",
    email: "carol.henderson@calmhaven.test",
    initials: "CH",
    avatarSeed: "staff-1",
    focusAreas: [0, 1],
    cert: "JLCSN",
    account: { label: "Linked", tone: "success" },
  },
  {
    rank: 3,
    name: "Evelyn Hartwell",
    email: "evelyn.hartwell@calmhaven.test",
    initials: "EH",
    avatarSeed: "staff-16",
    focusAreas: [0, 1, 2],
    cert: "JLCSN",
    account: { label: "Linked", tone: "success" },
  },
  {
    rank: 4,
    name: "Kevin Donovan",
    email: "kevin.donovan@calmhaven.test",
    initials: "KD",
    avatarSeed: "staff-7",
    focusAreas: [0],
    cert: "STAFF",
    account: { label: "Invited", tone: "warning" },
  },
  {
    rank: 5,
    name: "Hannah Stratton",
    email: "hannah.stratton@calmhaven.test",
    initials: "HS",
    avatarSeed: "staff-5",
    focusAreas: [2],
    cert: "JLCSN",
    account: { label: "Linked", tone: "success" },
  },
  {
    rank: 6,
    name: "Marilyn Davenport",
    email: "marilyn.davenport@calmhaven.test",
    initials: "MD",
    avatarSeed: "staff-2",
    focusAreas: [3],
    cert: "JLCSN",
    account: { label: "Not invited", tone: "neutral" },
  },
];

const HEADER_COLS = ["Name", "Status", "Focus Areas", "Certification", "Account"];

// 100px (#/checkbox) + Name + Status (110px) + Focus Areas + Certification + Account + chevron (40px)
const GRID_TEMPLATE = "100px 1.4fr 110px 1.5fr 0.9fr 1fr 40px";

export default function StaffViewMockup() {
  return (
    <div
      style={{
        background: "var(--dg-color-surface)",
        borderRadius: "var(--dg-radius-xl)",
        border: "1px solid var(--dg-color-border)",
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {/* Tabs bar — counts mirror MembersSection tab labels */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "var(--dg-color-bg)",
          borderBottom: "1px solid var(--dg-color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {[
            { label: "Active", count: 6, active: true },
            { label: "Inactive", count: 1, active: false },
            { label: "Removed", count: 0, active: false },
          ].map((tab) => (
            <span
              key={tab.label}
              style={{
                padding: "12px 14px",
                fontSize: 13,
                fontWeight: tab.active ? 600 : 500,
                color: tab.active ? "var(--dg-color-text-primary)" : "var(--dg-color-text-muted)",
                borderBottom: tab.active
                  ? "2px solid var(--dg-color-text-primary)"
                  : "2px solid transparent",
                cursor: "default",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  height: 18,
                  minWidth: 18,
                  borderRadius: "var(--dg-radius-lg)",
                  padding: "0 6px",
                  background: "var(--dg-color-bg-secondary)",
                  color: "var(--dg-color-text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {tab.count}
              </span>
            </span>
          ))}
        </div>

        {/* Search — matches dg-input radius (6px) */}
        <div style={{ position: "relative", width: 180 }}>
          <svg
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--dg-color-text-faint)",
            }}
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <div
            style={{
              height: 32,
              borderRadius: "var(--dg-radius-sm)",
              border: "1px solid var(--dg-color-border)",
              background: "var(--dg-color-surface)",
              paddingLeft: 32,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--dg-color-text-faint)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Search&hellip;
          </div>
        </div>
      </div>

      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_TEMPLATE,
          padding: "12px 24px",
          background: "var(--dg-color-bg)",
          borderBottom: "1px solid var(--dg-color-border-light)",
        }}
      >
        {/* Rank/checkbox column header — empty (placeholder for # and checkbox) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            fontWeight: 700,
            color: "var(--dg-color-text-subtle)",
            letterSpacing: "0.06em",
            textTransform: "uppercase" as const,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              border: "1.5px solid var(--dg-color-border)",
              background: "var(--dg-color-surface)",
              flexShrink: 0,
            }}
          />
          <span>#</span>
        </div>
        {HEADER_COLS.map((col) => (
          <span
            key={col}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--dg-color-text-subtle)",
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              display: "flex",
              alignItems: "center",
            }}
          >
            {col}
          </span>
        ))}
        <div />
      </div>

      {/* Rows */}
      {STAFF.map((person, idx) => {
        const avatarTone = getAvatarTone(person.avatarSeed);
        return (
          <div
            key={person.name}
            style={{
              display: "grid",
              gridTemplateColumns: GRID_TEMPLATE,
              alignItems: "center",
              padding: "12px 24px",
              borderTop: idx > 0 ? "1px solid var(--dg-color-border-light)" : undefined,
            }}
          >
            {/* # rank + checkbox */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--dg-color-text-faint)",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: "1.5px solid var(--dg-color-border)",
                  background: "var(--dg-color-surface)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums" as const,
                }}
              >
                #{person.rank}
              </span>
            </div>

            {/* Name + avatar + email subtitle */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  background: avatarTone.backgroundColor,
                  color: avatarTone.textColor,
                  border: `1px solid ${avatarTone.borderColor}`,
                  flexShrink: 0,
                }}
              >
                {person.initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--dg-color-text-primary)",
                    lineHeight: 1.3,
                    whiteSpace: "nowrap" as const,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {person.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--dg-color-text-muted)",
                    marginTop: 2,
                    whiteSpace: "nowrap" as const,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {person.email}
                </div>
              </div>
            </div>

            {/* Status — always Active in mockup */}
            <div>
              <StatusPill tone="success">Active</StatusPill>
            </div>

            {/* Focus areas — neutral pills capped at 2 + "+N more" overflow */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(() => {
                const visible = person.focusAreas.slice(0, 2);
                const overflow = person.focusAreas.slice(2);
                return (
                  <>
                    {visible.map((faIdx) => (
                      <StatusPill key={faIdx} tone="neutral">
                        {FOCUS_AREAS[faIdx]}
                      </StatusPill>
                    ))}
                    {overflow.length > 0 && (
                      <StatusPill tone="neutral">+{overflow.length} more</StatusPill>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Certification — plain text (no badge), muted */}
            <div>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--dg-color-text-muted)",
                  whiteSpace: "nowrap" as const,
                }}
              >
                {person.cert}
              </span>
            </div>

            {/* Account — tonal StatusPill with dot */}
            <div>
              <StatusPill tone={person.account.tone}>{person.account.label}</StatusPill>
            </div>

            {/* Chevron */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--dg-color-text-faint)",
              }}
            >
              <ChevronRight size={14} strokeWidth={2.5} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
