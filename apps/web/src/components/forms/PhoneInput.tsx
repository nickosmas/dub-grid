"use client";

import { forwardRef } from "react";

export function formatUsPhone(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const trimmed = local.slice(0, 10);

  const area = trimmed.slice(0, 3);
  const exchange = trimmed.slice(3, 6);
  const line = trimmed.slice(6, 10);

  if (trimmed.length === 0) return "";
  if (trimmed.length < 4) return `(${area}`;
  if (trimmed.length < 7) return `(${area}) ${exchange}`;
  return `(${area}) ${exchange}-${line}`;
}

interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
}

const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, className, placeholder = "(415) 555-0100", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      className={className ?? "dg-input"}
      value={formatUsPhone(value)}
      onChange={(event) => onChange(formatUsPhone(event.target.value))}
      placeholder={placeholder}
      maxLength={20}
      {...rest}
    />
  );
});

export default PhoneInput;
