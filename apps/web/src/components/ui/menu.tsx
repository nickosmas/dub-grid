"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

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

function Menu<Payload = unknown>({
  modal = false,
  ...props
}: MenuPrimitive.Root.Props<Payload>) {
  return <MenuPrimitive.Root data-slot="menu" modal={modal} {...props} />
}

const MenuArrow = React.forwardRef<HTMLDivElement, MenuPrimitive.Arrow.Props>(
  function MenuArrow({ className, render, style, ...props }, ref) {
    return (
      <MenuPrimitive.Arrow
        ref={ref}
        data-slot="menu-arrow"
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

type MenuContentProps = MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
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
      MenuPrimitive.Positioner.State,
      string
    >
    showArrow?: boolean
    arrowClassName?: MaybeStateValue<MenuPrimitive.Arrow.State, string>
  }

const MenuContent = React.forwardRef<HTMLDivElement, MenuContentProps>(
  function MenuContent(
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
      side = "bottom",
      sideOffset = 0,
      showArrow = false,
      ...props
    },
    ref
  ) {
    return (
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
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
        >
          <MenuPrimitive.Popup
            ref={ref}
            data-slot="menu-content"
            className={(state) =>
              cn(
                "dg-menu origin-(--transform-origin) data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                resolveStateValue(className, state)
              )
            }
            {...props}
          >
            {children}
            {showArrow ? <MenuArrow className={arrowClassName} /> : null}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    )
  }
)

function MenuItem({
  className,
  render,
  ...props
}: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      nativeButton
      render={render ?? <button type="button" />}
      className={(state) =>
        cn(
          "dg-menu-item",
          state.highlighted && "bg-[var(--color-bg-secondary)]",
          state.disabled && "pointer-events-none opacity-50",
          resolveStateValue(className, state)
        )
      }
      {...props}
    />
  )
}

export { Menu, MenuArrow, MenuContent, MenuItem }
