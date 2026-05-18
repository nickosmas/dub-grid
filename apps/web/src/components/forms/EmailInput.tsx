"use client";

import { forwardRef, useMemo } from "react";
import { Check, AlertCircle } from "lucide-react";
import { getRequiredStaffEmailError } from "@dubgrid/contracts";

interface EmailInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  /** Skip the validation icon (used when the field is required-only and parent owns the error). */
  hideValidationIcon?: boolean;
}

const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(function EmailInput(
  { value, onChange, hideValidationIcon, className, placeholder = "name@example.com", ...rest },
  ref,
) {
  const validationState = useMemo<"empty" | "valid" | "invalid">(() => {
    if (!value.trim()) return "empty";
    return getRequiredStaffEmailError(value) === null ? "valid" : "invalid";
  }, [value]);

  const showIcon = !hideValidationIcon && validationState !== "empty";

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={ref}
        type="email"
        inputMode="email"
        autoComplete="email"
        className={className ?? "dg-input"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={showIcon ? { paddingRight: 32 } : undefined}
        {...rest}
      />
      {showIcon ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            display: "inline-flex",
            color:
              validationState === "valid"
                ? "var(--color-success, #16a34a)"
                : "var(--color-danger)",
            pointerEvents: "none",
          }}
        >
          {validationState === "valid" ? (
            <Check size={14} strokeWidth={2.4} />
          ) : (
            <AlertCircle size={14} strokeWidth={2.2} />
          )}
        </span>
      ) : null}
    </div>
  );
});

export default EmailInput;
