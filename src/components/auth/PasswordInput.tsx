"use client";

import { Eye, EyeOff } from "lucide-react";

interface PasswordInputProps {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  showPassword: boolean;
  onToggle: () => void;
  ariaDescribedBy?: string;
  autoComplete?: string;
  minLength?: number;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const defaultInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border-light)",
  borderRadius: "12px",
  fontSize: "var(--dg-fs-body)",
  color: "var(--color-text-primary)",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box",
};

export function PasswordInput({
  placeholder,
  value,
  onChange,
  showPassword,
  onToggle,
  ariaDescribedBy,
  autoComplete = "new-password",
  minLength = 10,
  disabled,
  style,
}: PasswordInputProps) {
  const mergedStyle = { ...defaultInputStyle, ...style, paddingRight: 48 };

  return (
    <div style={{ position: "relative" }}>
      <input
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        className="dg-standalone-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        style={mergedStyle}
      />
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          color: "var(--color-text-subtle)",
          display: "flex",
          alignItems: "center",
        }}
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
