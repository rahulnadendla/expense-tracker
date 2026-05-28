# Release Notes

## 2026-05-28

### Added
- Implemented event-driven parsing via `/api/parse-invoices/event` with shared-secret authorization.
- Added freshness status model and guarded app-load fallback flow (`shouldAutoParseOnLoad`) to reduce blocking sync behavior.
- Added dismissible freshness banner behavior with session persistence and auto-restore when pending backlog reappears.
- Added Vercel cron configuration for daily reconciliation fallback.

### Changed
- Updated parser trigger architecture to: event-driven primary, daily cron fallback, app-load stale guardrail.
- Increased parser batch processing behavior to 20 invoices per run and updated docs/setup guidance.
- Improved parse endpoint source semantics by separating `manual` and `auto_on_load` sources.

### Security
- Hardened parse trigger endpoints with source validation, non-manual secret enforcement, and stricter event payload checks.
- Restricted parsing GET execution path to cron source and added interactive request origin/rate controls.

### Docs
- Updated `README.md` and `SETUP.md` with webhook setup steps, new env vars (`PARSE_TRIGGER_SECRET`, `CRON_SECRET`), and freshness troubleshooting guidance.

## 2026-04-12

### Fixed
- Aligned Admin monthly reconciliation metrics to use one consistent invoice cohort for the selected month.
- Updated "Orders Created", category split totals, and freshness signals to derive from orders linked to that cohort.
- Fixed "Last parsed invoice" to pick the latest parsed entry within the selected month's invoice cohort, removing stale/misaligned values.
