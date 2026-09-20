# Mobile findings F-04, F-17, F-31

**Type:** Fix (findings F-04, F-17, F-31)

**Status:** verified

## The fixes

- `Screen` gained a `list` mode (FlatList with the same sticky header,
  refresh, padding, insets and scroll handle; children as the header).
- F-04: the People roster, both tabs, renders through it.
- F-31: the Alerts feed renders through it, with "Load more" as the footer.
- F-17: per-day coverage (`daily` on each `coverageBySection` entry) computed
  by a shared `schedule-core` summarizer and shown as a day strip on the
  mobile coverage screen; the other two cited gaps were already closed by
  18b/18c.

## Evidence

- Mobile suite: 147 files / 1206 tests green, including new Screen list-mode
  and CoverageSectionRow tests. schedule-core, mobile-api-core and web mobile
  server suites green. Type-check and lint clean.
- Simulator: People, Alerts and Home > Coverage checked after the
  fast-forward (see commit note).
