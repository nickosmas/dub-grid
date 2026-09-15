# Fix: Remove dashboard trends and empty-card noise

**Type:** Fix
**Status:** verified

## Goal

Remove the regular dashboard Trends experience from web and mobile, and omit
empty summary cards on mobile while preserving the established web card order.

## Build steps

- [x] Remove the web Dashboard Trends action, comparison modal, supporting
      calculation, and obsolete props/types without affecting platform-admin
      analytics.
- [x] Make mobile dashboard summary cards render only when they have meaningful
      content, while retaining the dashboard-level no-data state.
- [x] Preserve the existing web dashboard card order.
- [x] Add focused regression coverage and run the applicable web and mobile
      verification.

## Out of scope

- Gridmaster platform analytics, including Platform Activity Trends.
- Changes to dashboard calculations, authorization, or API response shapes.
