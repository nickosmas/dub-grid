import { OnboardingDeviceFrame } from "./OnboardingDeviceFrame";

/** The Requests tab's Available list with an open shift to volunteer for (`shift-requests/screens/RequestsScreen.tsx`). */
export function IllustrationSwapPreview() {
  return (
    <OnboardingDeviceFrame
      light={require("../../../../../assets/images/onboarding/cover-shifts.png")}
      dark={require("../../../../../assets/images/onboarding/cover-shifts-dark.png")}
      stillHeight={933}
    />
  );
}
