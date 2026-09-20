"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";

export type LandingScreenshotVariant = {
  src: string;
  width: number;
  height: number;
  aspectRatioClass: string;
};

export type LandingScreenshotAsset = {
  alt: string;
  light: LandingScreenshotVariant;
  dark: LandingScreenshotVariant;
};

export const landingScreenshots = {
  schedule: {
    alt: "Calm Haven's two-week staff schedule in DubGrid",
    light: {
      src: "/landing/screenshots/schedule-grid.png",
      width: 4112,
      height: 2338,
      aspectRatioClass: "aspect-[4112/2338]",
    },
    dark: {
      src: "/landing/screenshots/schedule-grid-dark.png",
      width: 4112,
      height: 2338,
      aspectRatioClass: "aspect-[4112/2338]",
    },
  },
  dashboard: {
    alt: "Calm Haven's scheduling dashboard with coverage and shift summaries",
    light: {
      src: "/landing/screenshots/dashboard.png",
      width: 3120,
      height: 2196,
      aspectRatioClass: "aspect-[3120/2196]",
    },
    dark: {
      src: "/landing/screenshots/dashboard-dark.png",
      width: 3120,
      height: 2196,
      aspectRatioClass: "aspect-[3120/2196]",
    },
  },
  team: {
    alt: "Calm Haven's team directory in DubGrid",
    light: {
      src: "/landing/screenshots/team-directory.png",
      width: 3600,
      height: 2276,
      aspectRatioClass: "aspect-[3600/2276]",
    },
    dark: {
      src: "/landing/screenshots/team-directory-dark.png",
      width: 3600,
      height: 2276,
      aspectRatioClass: "aspect-[3600/2276]",
    },
  },
} satisfies Record<string, LandingScreenshotAsset>;

export function LandingScreenshot({
  asset,
  priority = false,
  sizes,
  className = "",
}: {
  asset: LandingScreenshotAsset;
  priority?: boolean;
  sizes: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const variant = mounted && resolvedTheme === "dark" ? asset.dark : asset.light;

  useEffect(() => setMounted(true), []);

  return (
    <div className={`landing-screenshot ${variant.aspectRatioClass} ${className}`}>
      <Image
        src={variant.src}
        alt={asset.alt}
        width={variant.width}
        height={variant.height}
        priority={priority}
        quality={95}
        sizes={sizes}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
