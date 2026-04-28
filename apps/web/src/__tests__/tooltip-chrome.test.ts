import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"
import { createWebCssVariables } from "@dubgrid/design-tokens"

function resolveRepoRoot(): string {
  const cwd = process.cwd()

  if (existsSync(resolve(cwd, "apps/web/src"))) {
    return cwd
  }

  return resolve(cwd, "../..")
}

function resolveWebSource(path: string): string {
  return resolve(resolveRepoRoot(), "apps/web/src", path)
}

const tooltipPrimitive = readFileSync(
  resolveWebSource("components/ui/tooltip.tsx"),
  "utf-8"
)
const globalsCss = readFileSync(resolveWebSource("app/globals.css"), "utf-8")
const webCssVariables = createWebCssVariables()
const chartTooltipStyles = readFileSync(
  resolveWebSource("components/dashboard/chartTooltipStyles.ts"),
  "utf-8"
)
const analyticsCharts = readFileSync(
  resolveWebSource("components/dashboard/AnalyticsCharts.tsx"),
  "utf-8"
)
const trendsCard = readFileSync(
  resolveWebSource("components/dashboard/TrendsCard.tsx"),
  "utf-8"
)

describe("tooltip chrome", () => {
  it("uses an elevated white surface for shared hover tooltips", () => {
    expect(tooltipPrimitive).toContain('@base-ui/react/tooltip')
    expect(tooltipPrimitive).toContain('delay={delay}')
    expect(tooltipPrimitive).toContain('sideOffset = 4')
    expect(tooltipPrimitive).toContain("bg-[var(--color-surface)]")
    expect(tooltipPrimitive).toContain("text-[var(--color-text-primary)]")
    expect(tooltipPrimitive).toContain("shadow-[var(--tooltip-shadow)]")
    expect(tooltipPrimitive).toContain("z-[11000]")
    expect(webCssVariables["--tooltip-shadow"]).toBe("0 0 18px rgba(15, 23, 42, 0.14), 0 0 36px rgba(15, 23, 42, 0.1)")
    expect(tooltipPrimitive).not.toContain("border-[var(--color-border-light)]")
  })

  it("uses the shadcn base tooltip arrow so the pointer tip is rendered", () => {
    expect(globalsCss).not.toContain("--tooltip-pointer-size: 10px;")
    expect(globalsCss).not.toContain(".dg-tooltip::before")
    expect(globalsCss).not.toContain(".dg-tooltip::after")
    expect(tooltipPrimitive).toContain("TooltipPrimitive.Arrow")
    expect(tooltipPrimitive).toContain("rotate-45")
    expect(tooltipPrimitive).toContain("fill-[var(--color-surface)]")
  })

  it("reuses the elevated white hover treatment for chart tooltips", () => {
    expect(chartTooltipStyles).toContain('backgroundColor: "var(--color-surface)"')
    expect(chartTooltipStyles).toContain('boxShadow: "var(--tooltip-shadow)"')
    expect(chartTooltipStyles).toContain("zIndex: 11000")
    expect(chartTooltipStyles).not.toContain('border: "1px solid var(--color-border-light)"')
    expect(analyticsCharts).toContain("contentStyle={chartTooltipContentStyle}")
    expect(analyticsCharts).toContain("wrapperStyle={chartTooltipWrapperStyle}")
    expect(trendsCard).toContain("contentStyle={chartTooltipContentStyle}")
    expect(trendsCard).toContain("wrapperStyle={chartTooltipWrapperStyle}")
  })
})
