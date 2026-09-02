"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/Button";

export function ScrollCueButton({
  direction,
  label,
  onClick,
}: {
  direction: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const Icon = direction === "left" ? ArrowLeft : ArrowRight;

  return (
    <Button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        padding: 0,
        borderRadius: "50%",
        border: "1px solid var(--dg-color-border)",
        background: "var(--dg-color-bg)",
        color: "var(--dg-color-text-secondary)",
        boxShadow: "var(--shadow-raised)",
        cursor: "pointer",
      }}
    >
      <Icon size={16} aria-hidden="true" />
    </Button>
  );
}
