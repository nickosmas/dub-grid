"use client";

import { ArrowDownUp, ArrowLeftRight, CalendarDays, CircleCheck, House, User } from "lucide-react";
import { LandingAppIcon, LandingPhone } from "./LandingPhone";
import { useLandingSequence } from "./useLandingSequence";

type ChipTone = "success" | "warning";

const SAM_SHIFT = { day: "Sat, Nov 8", time: "7:00 AM - 3:00 PM" };
const JORDAN_SHIFT = { day: "Thu, Nov 6", time: "7:00 AM - 3:00 PM" };

// One story in order: Sam has asked, Jordan accepts, the manager sees it and
// approves, then Jordan and Sam both hear it went through.
const STEPS = [2400, 1600, 2000, 1000, 4000] as const;

export function SwapDemo() {
  const { ref, step } = useLandingSequence(STEPS);
  const accepted = step >= 1;
  const approved = step >= 3;
  const told = step === 4;
  const jordanStatus: [string, ChipTone] = !accepted
    ? ["Swap request", "success"]
    : told
      ? ["Swap · Approved", "success"]
      : ["Swap · Pending approval", "warning"];
  const managerStatus: [string, ChipTone] = approved
    ? ["Swap · Approved", "success"]
    : ["Swap · Pending approval", "warning"];

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Jordan accepts Sam's swap, a manager approves it, and Jordan and Sam are both told it was approved"
      className="landing-demo landing-phones"
    >
      <figure className="landing-phone-figure" aria-hidden="true">
        <LandingPhone dimmed={step === 2 || step === 3}>
          <div className="landing-ios-banner" data-shown={told || undefined}>
            <span className="landing-ios-banner-head">
              <LandingAppIcon />
              <strong>Swap approved</strong>
              <span className="landing-ios-banner-time">now</span>
            </span>
            <span>The swap with Sam R. was approved.</span>
          </div>
          <RequestsHeader tabs={["Available", "Mine", "History"]} active="Mine" />
          <RequestCard
            subtitle="Asked you to swap shifts"
            otherLabel="Your shift"
            status={jordanStatus}
            actions={accepted ? null : ["Decline", "Accept"]}
            pressed={step === 1}
          />
          <PhoneTabBar />
        </LandingPhone>
        <figcaption>Jordan</figcaption>
      </figure>
      <figure className="landing-phone-figure" aria-hidden="true">
        <LandingPhone dimmed={step < 2 || told}>
          <RequestsHeader
            tabs={["Available", "All", "Mine", "Approval", "History"]}
            active="Approval"
            count={accepted && !approved ? 1 : null}
          />
          {accepted ? (
            <RequestCard
              subtitle="Asked Jordan T. to swap shifts"
              otherLabel="Jordan's shift"
              status={managerStatus}
              actions={approved ? null : ["Reject", "Approve"]}
              pressed={step === 3}
            />
          ) : (
            <div className="landing-empty-state">
              <CircleCheck size={36} />
              <span>Nothing to approve</span>
            </div>
          )}
          <PhoneTabBar />
        </LandingPhone>
        <figcaption>Manager</figcaption>
      </figure>
      <figure className="landing-phone-figure" aria-hidden="true">
        <LandingPhone variant="lock" dimmed={!told}>
          <span className="landing-lock-date">Tuesday, November 4</span>
          <span className="landing-lock-time">9:41</span>
          <div className="landing-lock-alert" data-shown={told || undefined}>
            <span className="landing-ios-banner-head">
              <LandingAppIcon />
              <strong>DubGrid</strong>
              <span className="landing-ios-banner-time">now</span>
            </span>
            <strong>Your swap request was approved</strong>
            <span>You now work Thu, Nov 6, 7:00 AM - 3:00 PM.</span>
          </div>
        </LandingPhone>
        <figcaption>Sam</figcaption>
      </figure>
    </div>
  );
}

function RequestsHeader({
  tabs,
  active,
  count = 1,
}: {
  tabs: string[];
  active: string;
  count?: number | null;
}) {
  return (
    <>
      <div className="landing-ios-title">Requests</div>
      <div className="landing-ios-tabs">
        {tabs.map((tab) => (
          <span key={tab} className="landing-ios-tab" data-active={tab === active || undefined}>
            {tab}
            {tab === active && count ? (
              <span className="landing-ios-tab-count">{count}</span>
            ) : null}
          </span>
        ))}
      </div>
    </>
  );
}

function ShiftPanel({
  person,
  shift,
  seam,
}: {
  person: string;
  shift: { day: string; time: string };
  seam: "below" | "above";
}) {
  return (
    <div className="landing-shift-panel" data-seam={seam}>
      <span className="landing-shift-panel-person">{person}</span>
      <span className="landing-shift-panel-title">Day</span>
      <span className="landing-shift-panel-context">East</span>
      <span className="landing-shift-panel-when">
        {shift.day} · {shift.time}
      </span>
    </div>
  );
}

function RequestCard({
  subtitle,
  otherLabel,
  status,
  actions,
  pressed,
}: {
  subtitle: string;
  otherLabel: string;
  status: [string, ChipTone];
  actions: [string, string] | null;
  pressed: boolean;
}) {
  return (
    <div className="landing-request-card">
      <div className="landing-request-head">
        <span className="landing-request-title">Sam R.</span>
        <span className="landing-status-chip" data-tone={status[1]}>
          {status[0]}
        </span>
      </div>
      <span className="landing-request-subtitle">{subtitle}</span>
      <ShiftPanel person="Sam's shift" shift={SAM_SHIFT} seam="below" />
      <span className="landing-swap-seam">
        <span className="landing-swap-disc">
          <ArrowDownUp size={16} />
        </span>
      </span>
      <ShiftPanel person={otherLabel} shift={JORDAN_SHIFT} seam="above" />
      {actions && (
        <span className="landing-request-actions">
          <span className="landing-ios-button">{actions[0]}</span>
          <span className="landing-ios-button" data-primary data-pressed={pressed || undefined}>
            {actions[1]}
          </span>
        </span>
      )}
    </div>
  );
}

function PhoneTabBar() {
  return (
    <div className="landing-ios-tabbar">
      <span>
        <House size={24} />
        Home
      </span>
      <span>
        <CalendarDays size={24} />
        Schedule
      </span>
      <span data-active>
        <ArrowLeftRight size={24} />
        Requests
      </span>
      <span>
        <User size={24} />
        Profile
      </span>
    </div>
  );
}
