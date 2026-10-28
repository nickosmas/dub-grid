"use client";

import { Moon } from "lucide-react";
import { usePermissions } from "@/hooks";
import { Banner } from "@/components/ui/Banner";

export default function InactiveAccountBanner() {
  const { isInactive } = usePermissions();

  if (!isInactive) return null;

  // A calm notice, not a warning: being away isn't something to fix.
  return (
    <Banner icon={Moon} layout="bar" role="status" tone="info">
      You&apos;re away.
    </Banner>
  );
}
