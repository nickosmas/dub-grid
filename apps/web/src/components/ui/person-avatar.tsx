"use client";

import { useTheme } from "next-themes";
import { getAvatarTone, getAvatarTypography, resolveAvatarSeed } from "@dubgrid/design-tokens";
import { getInitials } from "@/lib/utils";

interface PersonAvatarProps {
  /** Seeds the tint, so a person reads the same color everywhere. */
  person: { id: string; userId?: string | null };
  name: string;
  size?: number;
}

/** A person's initials on their own tint, as slide-over headers show them. */
export function PersonAvatar({ person, name, size = 44 }: PersonAvatarProps) {
  const { resolvedTheme } = useTheme();
  const tone = getAvatarTone(resolveAvatarSeed(person), resolvedTheme === "dark");
  return (
    <div
      aria-hidden="true"
      style={{
        ...getAvatarTypography(size),
        width: size,
        height: size,
        borderRadius: "50%",
        background: tone.backgroundColor,
        border: `1px solid ${tone.borderColor}`,
        color: tone.textColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {getInitials(name)}
    </div>
  );
}
