import { OnboardingDeviceFrame } from "./OnboardingDeviceFrame";

/** The My schedule screen with today's shift on duty (`schedule/screens/ScheduleScreen.tsx`). */
export function IllustrationUpcomingShift() {
  return (
    <OnboardingDeviceFrame
      light={require("../../../../../assets/images/onboarding/upcoming-shift.png")}
      dark={require("../../../../../assets/images/onboarding/upcoming-shift-dark.png")}
      stillHeight={933}
    />
  );
}
