"use client";

import { ArrowDownUp, ArrowLeftRight, CalendarDays, CircleCheck, House, User } from "lucide-react";
import { LandingAppIcon, LandingPhone } from "./LandingPhone";
import { useLandingSequence } from "./useLandingSequence";

type ChipTone = "success" | "warning";

const SAM_SHIFT = { day: "Sat, Nov 8", time: "7:00 AM - 3:00 PM" };
const JORDAN_SHIFT = { day: "Thu, Nov 6", time: "7:00 AM - 3:00 PM" };

// Waiting on Jordan, Jordan accepted, manager approved, Jordan told.
const STEPS = [2200, 2300, 900, 3400] as const;

export function SwapDemo() {
  const { ref, step } = useLandingSequence(STEPS);
  const jordanStatus: [string, ChipTone] =
    step === 0
      ? ["Swap request", "success"]
      : step === 3
        ? ["Swap · Approved", "success"]
        : ["Swap · Pending approval", "warning"];
  const managerStatus: [string, ChipTone] =
    step >= 2 ? ["Swap · Approved", "success"] : ["Swap · Pending approval", "warning"];

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Jordan accepts Sam's swap on their phone, a manager approves it on theirs, and Jordan is told it was approved"
      className="landing-demo landing-phones"
    >
      <figure className="landing-phone-figure" aria-hidden="true">
        <LandingPhone dimmed={step === 1 || step === 2}>
          <div className="landing-ios-banner" data-shown={step === 3 || undefined}>
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
            actions={step === 0 ? ["Decline", "Accept"] : null}
            pressed={step === 1}
          />
          <PhoneTabBar />
        </LandingPhone>
        <figcaption>Jordan</figcaption>
      </figure>
      <figure className="landing-phone-figure" aria-hidden="true">
        <LandingPhone dimmed={step === 0}>
          <RequestsHeader
            tabs={["Available", "All", "Mine", "Approval", "History"]}
            active="Approval"
            count={step === 1 ? 1 : null}
          />
          {step === 0 ? (
            <div className="landing-empty-state">
              <CircleCheck size={36} />
              <span>Nothing to approve</span>
            </div>
          ) : (
            <RequestCard
              subtitle="Asked Jordan T. to swap shifts"
              otherLabel="Jordan's shift"
              status={managerStatus}
              actions={step === 1 ? ["Reject", "Approve"] : null}
              pressed={step === 2}
            />
          )}
          <PhoneTabBar />
        </LandingPhone>
        <figcaption>Manager</figcaption>
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
