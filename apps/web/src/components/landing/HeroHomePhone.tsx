import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  House,
  Undo2,
  User,
  Users,
} from "lucide-react";
import { LandingPhone } from "./LandingPhone";

const FOCUS_AREAS = [
  { name: "Skilled Nursing", filled: 31, needed: 33 },
  { name: "Sheltered Care", filled: 18, needed: 18 },
  { name: "Night Shift", filled: 11, needed: 12 },
];

function percent(filled: number, needed: number) {
  return Math.round((filled / needed) * 100);
}

/**
 * The hero's phone: the app's admin Home in its Team view, drawn the way the
 * app lays it out (week header, My schedule | Team, Coverage, Pending
 * approvals, Overtime watch) with fictional numbers.
 */
export function HeroHomePhone() {
  const filled = FOCUS_AREAS.reduce((sum, area) => sum + area.filled, 0);
  const needed = FOCUS_AREAS.reduce((sum, area) => sum + area.needed, 0);
  const coverage = percent(filled, needed);

  return (
    <LandingPhone>
      <div className="landing-home">
        <div className="landing-home-header">
          <div>
            <div className="landing-home-day">Today</div>
            <div className="landing-home-range">Nov 2 - 8</div>
          </div>
          <div className="landing-home-icons">
            <span>
              <ChevronLeft size={20} />
            </span>
            <span>
              <ChevronRight size={20} />
            </span>
            <span>
              <Undo2 size={18} />
            </span>
            <span className="landing-home-bell">
              <Bell size={20} />
              <i>3</i>
            </span>
          </div>
        </div>
        <div className="landing-home-switch">
          <span>My schedule</span>
          <span data-active>Team</span>
        </div>

        <div className="landing-home-card">
          <div className="landing-home-card-title">
            Coverage <span>See all ›</span>
          </div>
          <div className="landing-home-figure">
            <strong>{coverage}%</strong> covered
          </div>
          <div className="landing-home-meter">
            <span style={{ width: `${coverage}%` }} />
          </div>
          {FOCUS_AREAS.map((area) => {
            const pct = percent(area.filled, area.needed);
            return (
              <div key={area.name} className="landing-home-area">
                <span>{area.name}</span>
                <span className="landing-home-area-count">
                  {area.filled}/{area.needed} <b data-full={pct === 100 || undefined}>{pct}%</b>
                </span>
              </div>
            );
          })}
          <div className="landing-home-stats">
            <span data-tone="danger">
              <strong>{needed - filled}</strong> open gaps
            </span>
            <span data-tone="warning">
              <strong>1</strong> pending approval
            </span>
          </div>
        </div>

        <div className="landing-home-card">
          <div className="landing-home-card-title">
            Pending approvals <span>See all ›</span>
          </div>
          <div className="landing-home-row">
            <span>Sam R.</span>
            <small>
              <b>Swap</b> · Day shift · Nov 8
            </small>
          </div>
        </div>

        <div className="landing-home-card">
          <div className="landing-home-card-title">
            Overtime watch <span>See all ›</span>
          </div>
          <div className="landing-home-row landing-home-row-split">
            <span>
              Morgan K.
              <small>44h total · Skilled Nursing</small>
            </span>
            <span className="landing-home-overtime">
              +4h<small>overtime</small>
            </span>
          </div>
        </div>
      </div>
      <div className="landing-ios-tabbar">
        <span data-active>
          <House size={24} />
          Home
        </span>
        <span>
          <CalendarDays size={24} />
          Schedule
        </span>
        <span>
          <ArrowLeftRight size={24} />
          Requests
        </span>
        <span>
          <Users size={24} />
          People
        </span>
        <span>
          <User size={24} />
          Profile
        </span>
      </div>
    </LandingPhone>
  );
}
