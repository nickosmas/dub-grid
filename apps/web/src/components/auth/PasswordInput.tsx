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
  className,
}: PasswordInputProps) {
  return (
    <div className="dg-password-input">
      <input
        id={id}
        ref={inputRef}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        className={
          className
            ? `${className} dg-standalone-input dg-password-input__field`
            : "dg-auth-input dg-password-input__field"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-describedby={ariaDescribedBy}
      />
      <Button
        type="button"
        onClick={onToggle}
        className="dg-password-input__toggle"
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </Button>
    </div>
  );
}
