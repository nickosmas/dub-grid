"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";

export type LandingPhoneScreen = "home" | "schedule" | "requests";

// iPhone 17 Pro captures (402 x 874 points), stored at 2x: the frame renders
// them at 278px, so 3x sources only cost repository bytes.
const SCREEN_WIDTH = 804;
const SCREEN_HEIGHT = 1748;

export const landingPhoneScreens: Record<
  LandingPhoneScreen,
  { alt: string; light: string; dark: string }
> = {
  home: {
    alt: "The DubGrid mobile Home tab with this week's shifts and coverage for Calm Haven",
    light: "/landing/screenshots/mobile-home.png",
    dark: "/landing/screenshots/mobile-home-dark.png",
  },
  schedule: {
    alt: "The DubGrid mobile Schedule tab showing who is on the Day Shift in Skilled Nursing",
    light: "/landing/screenshots/mobile-schedule.png",
    dark: "/landing/screenshots/mobile-schedule-dark.png",
  },
  requests: {
    alt: "The DubGrid mobile Requests tab listing open shifts available to pick up",
    light: "/landing/screenshots/mobile-requests.png",
    dark: "/landing/screenshots/mobile-requests-dark.png",
  },
};

export function LandingPhone({
  screen,
  decorative = false,
  priority = false,
}: {
  screen: LandingPhoneScreen;
  /** Hidden from assistive tech when a sibling already carries the meaning. */
  decorative?: boolean;
  priority?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const asset = landingPhoneScreens[screen];
  const src = mounted && resolvedTheme === "dark" ? asset.dark : asset.light;

  useEffect(() => setMounted(true), []);

  return (
    <div className="landing-phone" aria-hidden={decorative || undefined}>
      <Image
        src={src}
        alt={decorative ? "" : asset.alt}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        priority={priority}
        quality={95}
        sizes="278px"
        className="landing-phone-screen"
      />
    </div>
  );
}
