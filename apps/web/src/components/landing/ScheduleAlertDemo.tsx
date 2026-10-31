"use client";

import { LandingAppIcon, LandingPhone } from "./LandingPhone";
import { useLandingSequence } from "./useLandingSequence";

// Quiet lock screen, then the alert arrives.
const STEPS = [2000, 3600] as const;

export function ScheduleAlertDemo() {
  const { ref, step } = useLandingSequence(STEPS);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Jordan's lock screen shows an alert that their schedule for Tuesday changed"
      className="landing-demo landing-phones"
    >
      <div aria-hidden="true">
        <LandingPhone variant="lock">
          <span className="landing-lock-date">Monday, November 3</span>
          <span className="landing-lock-time">9:41</span>
          <div className="landing-lock-alert" data-shown={step === 1 || undefined}>
            <span className="landing-ios-banner-head">
              <LandingAppIcon />
              <strong>DubGrid</strong>
              <span className="landing-ios-banner-time">now</span>
            </span>
            <strong>Your schedule for Tue, Nov 4 changed</strong>
            <span>New: Evening 3:00 PM - 11:00 PM</span>
          </div>
        </LandingPhone>
      </div>
    </div>
  );
}
