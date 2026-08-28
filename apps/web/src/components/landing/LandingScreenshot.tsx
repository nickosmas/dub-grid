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
      src: "/landing/screenshots/schedule-grid-latest.png",
      width: 4112,
      height: 2402,
      aspectRatioClass: "aspect-[4112/2402]",
    },
    dark: {
      src: "/landing/screenshots/schedule-grid-dark-latest.png",
      width: 4112,
      height: 2400,
      aspectRatioClass: "aspect-[4112/2400]",
    },
  },
  dashboard: {
    alt: "Calm Haven's scheduling dashboard with coverage and shift summaries",
    light: {
      src: "/landing/screenshots/dashboard-latest.png",
      width: 4112,
      height: 2402,
      aspectRatioClass: "aspect-[4112/2402]",
    },
    dark: {
      src: "/landing/screenshots/dashboard-dark.png",
      width: 4112,
      height: 2398,
      aspectRatioClass: "aspect-[4112/2398]",
    },
  },
  team: {
    alt: "Calm Haven's team directory in DubGrid",
    light: {
      src: "/landing/screenshots/team-directory-provided.png",
      width: 4112,
      height: 2404,
      aspectRatioClass: "aspect-[4112/2404]",
    },
    dark: {
      src: "/landing/screenshots/team-directory-dark.png",
      width: 4112,
      height: 2400,
      aspectRatioClass: "aspect-[4112/2400]",
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
