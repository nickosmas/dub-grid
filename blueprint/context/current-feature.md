# Improve landing screenshot fidelity and device framing

**Type:** Fix

**Status:** ready for pull request

## Problem

Landing-page web screenshots look softer than their supplied sources and lack
the visual framing that makes them read as product devices.

## Fix

Keep the supplied screenshots at high enough encoded resolution for their
rendered sizes, render them without avoidable browser downscaling, and add a
landing-only theme-aware bezel. The bezel is white in light mode and gray in
dark mode. Preserve the existing screenshot selection, layout, and responsive
behavior.

## Build steps

1. [x] Inspect the source and rendered image sizing, then replace any
       undersized or over-compressed landing screenshot assets.

   Done when: each rendered web screenshot uses an appropriately sized source
   without visible compression or enlargement artifacts.

2. [x] Add a themed device bezel to landing web screenshots and cover it in the
       existing landing browser tests.

   Done when: web screenshots have a white bezel in light mode and a gray bezel
   in dark mode without layout shift or horizontal overflow.

3. [ ] Create a `dev` to `main` pull request containing the retained landing
       work and this visual fix.

   Done when: the PR compares `dev` against `main` and includes every commit on
   `dev` that is not yet in `main`.

## Verify

- Run the focused landing Playwright tests at desktop and mobile widths.
- Inspect the rendered landing page in both themes.
- Run the web type check and production build.
