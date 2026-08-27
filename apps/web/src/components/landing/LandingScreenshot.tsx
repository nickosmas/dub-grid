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
      src: "/landing/screenshots/schedule-grid-latest.webp",
      width: 2400,
      height: 1402,
      aspectRatioClass: "aspect-[1200/701]",
    },
    dark: {
      src: "/landing/screenshots/schedule-grid-dark-latest.webp",
      width: 2400,
      height: 1401,
      aspectRatioClass: "aspect-[2400/1401]",
    },
  },
  dashboard: {
    alt: "Calm Haven's scheduling dashboard with coverage and shift summaries",
    light: {
      src: "/landing/screenshots/dashboard-latest.webp",
      width: 2400,
      height: 1402,
      aspectRatioClass: "aspect-[1200/701]",
    },
    dark: {
      src: "/landing/screenshots/dashboard-dark.webp",
      width: 2400,
      height: 1400,
      aspectRatioClass: "aspect-[12/7]",
    },
  },
  team: {
    alt: "Calm Haven's team directory in DubGrid",
    light: {
      src: "/landing/screenshots/team-directory-provided.webp",
      width: 2400,
      height: 1403,
      aspectRatioClass: "aspect-[2400/1403]",
    },
    dark: {
      src: "/landing/screenshots/team-directory-dark.webp",
      width: 2400,
      height: 1401,
      aspectRatioClass: "aspect-[2400/1401]",
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
        sizes={sizes}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
