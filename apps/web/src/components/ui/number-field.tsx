"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { cn } from "@/lib/utils";

type NativeProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "step" | "inputMode" | "pattern"
>;

type SharedProps = NativeProps & {
  min?: number;
  max?: number;
  /** Arrow-key increment. */
  step?: number;
  /** Select the whole value on focus so typing replaces it. Default true. */
  selectOnFocus?: boolean;
};

type RequiredProps = SharedProps & {
  nullable?: false;
  value: number;
  onChange: (value: number) => void;
  /**
   * Committed when the field is left blank. Without it a blank field restores
   * the value it had before editing, so clearing can never silently zero a
   * setting that has a meaningful current value.
   */
  emptyValue?: number;
};

type NullableProps = SharedProps & {
  nullable: true;
  value: number | null;
  onChange: (value: number | null) => void;
  emptyValue?: never;
};

export type NumberFieldProps = RequiredProps | NullableProps;

function clamp(value: number, min: number | undefined, max: number | undefined) {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

function format(value: number | null) {
  return value === null ? "" : String(value);
}

/**
 * Integer entry that never fights the typist.
 *
 * A native `type="number"` bound to numeric state cannot be emptied: the
 * first backspace yields `""`, the parent coerces it to `0`, and the field
 * re-renders with a `0` the user did not type. It also takes `e`, `+`, `-`
 * and `.`, changes value under the scroll wheel, and accepts any letters in
 * Firefox. This is a text input with the numeric keypad and a digit filter,
 * holding its own draft so the value can be cleared and retyped freely. The
 * parent is updated on every keystroke that parses, and the draft is
 * normalized (clamped, leading zeros dropped) when the field is left.
 */
export function NumberField(props: NumberFieldProps) {
  const {
    value,
    onChange,
    min,
    max,
    step = 1,
    selectOnFocus = true,
    nullable = false,
    emptyValue,
    className,
    onFocus,
    onBlur,
    onKeyDown,
    onMouseDown,
    onMouseUp,
    disabled,
    readOnly,
    ...rest
  } = props;

  const [draft, setDraft] = useState(() => format(value));
  // The last value this field handed to the parent. A prop change that does
  // not match it came from outside (a Discard, a reload) and must replace the
  // draft; one that does match is our own echo and must not, or clearing the
  // field would immediately re-fill it.
  const emitted = useRef<number | null>(value);
  const focusedByPointer = useRef(false);
  const selectOnNextMouseUp = useRef(false);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(format(value));
    }
  }, [value]);

  // A blank draft on a required field keeps the last committed number in
  // `emitted`, which is what blur restores.
  const emit = (next: number | null) => {
    if (next === null) {
      if (nullable && emitted.current !== null) {
        emitted.current = null;
        (onChange as (v: number | null) => void)(null);
      }
      return;
    }
    if (next === emitted.current) return;
    emitted.current = next;
    (onChange as (v: number) => void)(next);
  };

  const parse = (text: string) => {
    if (text === "") return null;
    return clamp(parseInt(text, 10), min, max);
  };

  const commit = () => {
    const parsed = parse(draft);
    if (parsed !== null) {
      emit(parsed);
      setDraft(format(parsed));
      return;
    }
    if (nullable) {
      emit(null);
      return;
    }
    if (emptyValue !== undefined) {
      emit(clamp(emptyValue, min, max));
      setDraft(format(emitted.current));
      return;
    }
    setDraft(format(emitted.current));
  };

  const stepBy = (direction: 1 | -1) => {
    const base = parse(draft) ?? emitted.current ?? min ?? 0;
    const next = clamp(base + direction * step, min, max);
    emit(next);
    setDraft(format(next));
  };

  const handleMouseDown = (event: MouseEvent<HTMLInputElement>) => {
    focusedByPointer.current = document.activeElement !== event.currentTarget;
    onMouseDown?.(event);
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    if (selectOnFocus) {
      event.currentTarget.select();
      // A mouse click focuses, then its mouseup collapses the selection to a
      // caret. Swallow that one mouseup so the click behaves like Tab.
      selectOnNextMouseUp.current = focusedByPointer.current;
    }
    focusedByPointer.current = false;
    onFocus?.(event);
  };

  const handleMouseUp = (event: MouseEvent<HTMLInputElement>) => {
    if (selectOnNextMouseUp.current) {
      selectOnNextMouseUp.current = false;
      event.preventDefault();
    }
    onMouseUp?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    selectOnNextMouseUp.current = false;
    commit();
    onBlur?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || readOnly) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      stepBy(-1);
    } else if (event.key === "Enter") {
      commit();
    }
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      role="spinbutton"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? undefined}
      className={cn("dg-input dg-input-number", className)}
      value={draft}
      disabled={disabled}
      readOnly={readOnly}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "");
        setDraft(digits);
        emit(parse(digits));
      }}
      onFocus={handleFocus}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
