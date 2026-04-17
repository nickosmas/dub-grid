interface ExpandButtonProps {
  onClick: () => void;
  label?: string;
}

export default function ExpandButton({ onClick, label = "Expand" }: ExpandButtonProps) {
  return (
    <button
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
        color: "var(--color-text-secondary)",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.15s, color 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-brand-bg)";
        e.currentTarget.style.color = "var(--color-brand)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--color-text-secondary)";
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
    </button>
  );
}
