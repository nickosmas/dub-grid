"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/Button";

interface PasswordInputProps {
  id?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  showPassword: boolean;
  onToggle: () => void;
  ariaDescribedBy?: string;
  autoComplete?: string;
  minLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  style?: React.CSSProperties;
  /**
   * Overrides the default `dg-auth-input` styling with the supplied class
   * (e.g. "dg-input" for in-app form fields). `dg-standalone-input` is still
   * applied for iOS zoom prevention when overriding.
   */
  className?: string;
}

export function PasswordInput({
  id,
  placeholder,
  value,
  onChange,
  showPassword,
  onToggle,
  ariaDescribedBy,
  autoComplete = "new-password",
  minLength = 10,
  disabled,
  autoFocus,
  inputRef,
  style,
  className,
}: PasswordInputProps) {
  const mergedStyle = { ...style, paddingRight: 48 };

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        ref={inputRef}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        className={className ? `${className} dg-standalone-input` : "dg-auth-input"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-describedby={ariaDescribedBy}
        style={mergedStyle}
      />
      <Button
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
      </Button>
    </div>
  );
}
