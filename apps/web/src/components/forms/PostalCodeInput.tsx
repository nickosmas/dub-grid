"use client";

import { forwardRef } from "react";

export function formatUsPostalCode(raw: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

interface PostalCodeInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
}

const PostalCodeInput = forwardRef<HTMLInputElement, PostalCodeInputProps>(function PostalCodeInput(
  { value, onChange, className, placeholder = "94103", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="postal-code"
      className={className ?? "dg-input"}
      value={formatUsPostalCode(value)}
      onChange={(event) => onChange(formatUsPostalCode(event.target.value))}
      placeholder={placeholder}
      maxLength={10}
      {...rest}
    />
  );
});

export default PostalCodeInput;
