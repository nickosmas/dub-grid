"use client";

import { Eye } from "lucide-react";
import { usePermissions, setUserViewActive } from "@/hooks";
import { Button } from "@/components/Button";
import { Banner } from "@/components/ui/Banner";

export default function UserViewBanner() {
  const { isUserViewActive } = usePermissions();

  if (!isUserViewActive) return null;

  return (
    <Banner
      icon={Eye}
      layout="bar"
      tone="info"
      action={
        <Button
          onClick={() => setUserViewActive(false)}
          className="dg-btn dg-btn-secondary dg-btn-sm"
        >
          Exit
        </Button>
      }
    >
      Viewing as regular user
    </Banner>
  );
}
