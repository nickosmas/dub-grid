import { Button } from "@/components/Button";
interface ExpandButtonProps {
  onClick: () => void;
  label?: string;
}

export default function ExpandButton({ onClick, label = "Expand" }: ExpandButtonProps) {
  return (
    <Button
      onClick={onClick}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: "var(--dg-btn-radius)",
        border: "none",
        background: "transparent",
        color: "var(--dg-color-text-secondary)",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.15s, color 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        // Same neutral hover as `.dg-close-btn` in globals.css: this is the other
        // quiet icon affordance sitting in a panel header, so it should not read
        // as a brand-tinted action.
        e.currentTarget.style.background =
          "color-mix(in srgb, var(--dg-color-text-primary) 12%, transparent)";
        e.currentTarget.style.color = "var(--dg-color-text-primary)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--dg-color-text-secondary)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Button>
  );
}
