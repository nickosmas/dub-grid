import {
  ArrowUpDown,
  CalendarCog,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { parseSchedulePattern, type PatternCell } from "./landing-demo-logic";

const DAYS = [
  ["Sun", 20],
  ["Mon", 21],
  ["Tue", 22],
  ["Wed", 23],
  ["Thu", 24],
  ["Fri", 25],
  ["Sat", 26],
  ["Sun", 27],
  ["Mon", 28],
  ["Tue", 29],
  ["Wed", 30],
  ["Thu", 1],
  ["Fri", 2],
  ["Sat", 3],
] as const;

type Badge = "lead" | "staff" | "csn3";

// Fictional staff. Codes: D, E, N shifts ("Ds" adds a small suffix), "sE"
// and "nN" carry a certification strip, "vVN" a visiting nurse, "Ofc" office
// time, "X" a day off, "O2"/"O3"/"O4" off for that many days, "-" nothing.
const ROWS: { name: string; detail?: string; badge: Badge; week: string }[] = [
  {
    name: "Margaret Sullivan",
    detail: "DCSN",
    badge: "lead",
    week: "O2 _ Ofc Ofc Ofc Ofc Ofc O2 _ Ofc Ofc Ofc Ofc Ofc",
  },
  {
    name: "Thomas Crawford",
    detail: "Mentor",
    badge: "lead",
    week: "Ds Ofc DM O2 _ Ofc DM Ofc DM DM O2 _ Ds Ofc",
  },
  {
    name: "Carol Henderson",
    detail: "Supv",
    badge: "lead",
    week: "O4 _ _ _ E E Ds Ds Es O2 _ E E Ds",
  },
  {
    name: "Diane Patterson",
    detail: "Supv",
    badge: "lead",
    week: "O2 _ E sE sE E Es sD D O2 _ D sD D",
  },
  {
    name: "Laura Marshall",
    detail: "Mentor, Supv",
    badge: "lead",
    week: "O2 _ Es sE sE E Es E Es O2 _ sE E Es",
  },
  {
    name: "Richard Bennett",
    detail: "Supv",
    badge: "lead",
    week: "X Ds Ds D Ds Ds X Ds D O2 _ Ds D X",
  },
  {
    name: "Susan Fletcher",
    detail: "Supv, Nurse",
    badge: "lead",
    week: "D O2 _ Ds D vVN vVN D Ds O2 _ D vVN vVN",
  },
  {
    name: "William Harper",
    detail: "Supv",
    badge: "lead",
    week: "Es Es E Es Es Es X Es E Es Es O2 _ E",
  },
  {
    name: "Kenneth Crawford",
    detail: "Supv",
    badge: "lead",
    week: "nN O3 _ _ nN nN nN O2 _ nN nN nN O2 _",
  },
  { name: "Nancy Thornton", badge: "lead", week: "X D D D D D X D D X D D D X" },
  { name: "Kevin Donovan", badge: "staff", week: "O2 _ E E O3 _ _ E E O2 _ E E X" },
  { name: "Brian Shepherd", badge: "staff", week: "sE sE sE X sE sE sE sE X sE sE sE O2 _" },
  { name: "Timothy Walsh", badge: "staff", week: "E sE O2 _ Ofc sE sE E O2 _ sE E E Ofc" },
  { name: "Nathan “Nate” Callahan", badge: "staff", week: "O2 _ D E E E E O2 _ D D E E E" },
  { name: "Janet Morrison", badge: "staff", week: "sE E sE sE O2 _ E sE E O2 _ sE E E" },
  { name: "Barbara Trent", badge: "staff", week: "D D O2 _ D D D D D O2 _ D D D" },
  { name: "David Michael Spencer", badge: "csn3", week: "O2 _ vVN vVN vVN O2 _ D D vVN O2 _ D D" },
  { name: "Robert Garrison", badge: "csn3", week: "D sD sD O2 _ D sD D sD O2 _ D sD D" },
];

const BADGE_LABEL: Record<Badge, string> = { lead: "JLCSN", staff: "Staff", csn3: "CSN III" };
const FOCUS_AREAS = ["All", "Skilled Nursing", "Sheltered Care", "Night Shift", "Visiting CSNS"];

function Cell({ cell, startDay }: { cell: PatternCell; startDay: number }) {
  const weekStart = startDay === 7 || undefined;
  const style = cell.span > 1 ? { gridColumn: `span ${cell.span}` } : undefined;
  const content = (() => {
    const { code } = cell;
    if (code === "-") return null;
    if (code === "off") return <span className="hero-sched-off">Off ×{cell.span}</span>;
    if (code === "X") return <span className="hero-sched-off">X</span>;
    if (code === "Ofc") return <span className="hero-sched-chip hero-sched-ofc">Ofc</span>;
    if (code.startsWith("s")) {
      return (
        <span className="hero-sched-chip hero-sched-striped" data-tone="cert">
          <span className="hero-sched-strip">
            S<br />C
          </span>
          {code.slice(1)}
        </span>
      );
    }
    if (code === "nN") {
      return (
        <span className="hero-sched-chip hero-sched-striped" data-tone="night">
          <span className="hero-sched-strip">
            N<br />S
          </span>
          N
        </span>
      );
    }
    if (code === "vVN") {
      return (
        <span className="hero-sched-chip hero-sched-striped" data-tone="visit">
          <span className="hero-sched-strip">
            V<br />C
          </span>
          VN
        </span>
      );
    }
    const kind = code[0] === "D" ? "day" : "evening";
    const suffix = code.slice(1);
    return (
      <span className="hero-sched-chip" data-kind={kind}>
        {code[0]}
        {suffix && <small> · {suffix}</small>}
      </span>
    );
  })();

  return (
    <div className="hero-sched-cell" data-week-start={weekStart} style={style}>
      {content}
    </div>
  );
}

/**
 * The hero's picture of the Schedule: a two-week grid drawn in the app's own
 * style at the size of a full screenshot (2056 x 1169), then scaled to fit,
 * so it reads like a capture without being one.
 */
export function HeroSchedulePreview() {
  return (
    <div className="hero-sched-frame" role="img" aria-label="A two-week staff schedule in DubGrid">
      <div className="hero-sched" aria-hidden="true">
        <div className="hero-sched-toolbar">
          <span className="hero-sched-control hero-sched-icon">
            <ChevronLeft size={18} />
          </span>
          <span className="hero-sched-range">9/20 - 10/3</span>
          <span className="hero-sched-control hero-sched-icon">
            <ChevronRight size={18} />
          </span>
          <span className="hero-sched-control">Today</span>
          <span className="hero-sched-control">
            2 Weeks <ChevronDown size={16} />
          </span>
          <span className="hero-sched-tabs">
            {FOCUS_AREAS.map((area, index) => (
              <span key={area} data-active={index === 0 || undefined}>
                {area}
              </span>
            ))}
          </span>
          <span className="hero-sched-control">
            <ArrowUpDown size={16} /> Sort staff
          </span>
          <span className="hero-sched-search">
            <Search size={16} /> Search staff
          </span>
          <span className="hero-sched-spacer" />
          <span className="hero-sched-control">
            <CalendarCog size={16} /> Schedule Builder
          </span>
          <span className="hero-sched-control">
            <SlidersHorizontal size={16} /> Tools
          </span>
        </div>
        <div className="hero-sched-title">Skilled Nursing</div>
        <div className="hero-sched-grid">
          <div className="hero-sched-head hero-sched-staff-head">Staff</div>
          {DAYS.map(([day, date], index) => (
            <div
              key={`${day}-${date}`}
              className="hero-sched-head"
              data-week-start={index === 7 || undefined}
            >
              <span>{day}</span>
              <strong>{date}</strong>
            </div>
          ))}
          {ROWS.map((row) => {
            let day = 0;
            return (
              <div key={row.name} className="hero-sched-row">
                <div className="hero-sched-person">
                  <span className="hero-sched-name">
                    <strong>{row.name}</strong>
                    {row.detail && <span>{row.detail}</span>}
                  </span>
                  <span className="hero-sched-badge" data-badge={row.badge}>
                    {BADGE_LABEL[row.badge]}
                  </span>
                </div>
                {parseSchedulePattern(row.week, DAYS.length).map((cell, index) => {
                  const startDay = day;
                  day += cell.span;
                  return <Cell key={index} cell={cell} startDay={startDay} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
