# Release Notes

## 2026-04-12

### Fixed
- Aligned Admin monthly reconciliation metrics to use one consistent invoice cohort for the selected month.
- Updated "Orders Created", category split totals, and freshness signals to derive from orders linked to that cohort.
- Fixed "Last parsed invoice" to pick the latest parsed entry within the selected month's invoice cohort, removing stale/misaligned values.
