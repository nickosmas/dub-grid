"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

type MaybeStateValue<State, Value> =
  | Value
  | ((state: State) => Value | undefined)
  | undefined

function resolveStateValue<State, Value>(
  value: MaybeStateValue<State, Value>,
  state: State
): Value | undefined {
  return typeof value === "function"
    ? (value as (state: State) => Value | undefined)(state)
    : value
}

const arrowBaseClassName =
  "z-50 pointer-events-none origin-center data-[side=bottom]:-top-[9px] data-[side=left]:-right-[9px] data-[side=left]:rotate-90 data-[side=right]:-left-[9px] data-[side=right]:-rotate-90 data-[side=top]:-bottom-[9px] data-[side=top]:rotate-180"

const arrowBaseStyle = {
  display: "block",
  height: 16,
  width: 16,
} satisfies React.CSSProperties

const defaultArrowRender = (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      display: "block",
      width: "100%",
      height: "100%",
    }}
  >
    <path d="M1.5 9.5L8 2.5L14.5 9.5V16H1.5Z" fill="var(--color-surface)" />
    <path
      d="M1.5 9.5L8 2.5L14.5 9.5"
      stroke="var(--color-border)"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
)

function Popover<Payload = unknown>({
  ...props
}: PopoverPrimitive.Root.Props<Payload>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

const PopoverArrow = React.forwardRef<HTMLDivElement, PopoverPrimitive.Arrow.Props>(
  function PopoverArrow({ className, render, style, ...props }, ref) {
    return (
      <PopoverPrimitive.Arrow
        ref={ref}
        data-slot="popover-arrow"
        className={(state) =>
          cn(arrowBaseClassName, resolveStateValue(className, state))
        }
        render={render ?? defaultArrowRender}
        style={(state) => ({
          ...arrowBaseStyle,
          ...resolveStateValue(style, state),
        })}
        {...props}
      />
    )
  }
)

type PopoverContentProps = PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "anchor"
    | "arrowPadding"
    | "collisionAvoidance"
    | "collisionPadding"
    | "positionMethod"
    | "side"
    | "sideOffset"
  > & {
    positionerClassName?: MaybeStateValue<
      PopoverPrimitive.Positioner.State,
      string
    >
    positionerStyle?: MaybeStateValue<
      PopoverPrimitive.Positioner.State,
      React.CSSProperties
    >
    showArrow?: boolean
    arrowClassName?: MaybeStateValue<PopoverPrimitive.Arrow.State, string>
  }

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  function PopoverContent(
    {
      align = "center",
      alignOffset = 0,
      anchor,
      arrowClassName,
      arrowPadding = 12,
      children,
      className,
      collisionAvoidance,
      collisionPadding = 8,
      positionMethod,
      positionerClassName,
      positionerStyle,
      side = "bottom",
      sideOffset = 0,
      showArrow = false,
      ...props
    },
    ref
  ) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchor}
          align={align}
          alignOffset={alignOffset}
          arrowPadding={arrowPadding}
          collisionAvoidance={collisionAvoidance}
          collisionPadding={collisionPadding}
          positionMethod={positionMethod}
          side={side}
          sideOffset={sideOffset}
          className={(state) =>
            cn("isolate z-50", resolveStateValue(positionerClassName, state))
          }
          style={(state) => ({
            zIndex: 10002,
            ...resolveStateValue(positionerStyle, state),
          })}
        >
          <PopoverPrimitive.Popup
            ref={ref}
            data-slot="popover-content"
            className={(state) =>
              cn(
                "origin-(--transform-origin) data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                resolveStateValue(className, state)
              )
            }
            {...props}
          >
            {children}
            {showArrow ? <PopoverArrow className={arrowClassName} /> : null}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    )
  }
)

export { Popover, PopoverArrow, PopoverContent }
