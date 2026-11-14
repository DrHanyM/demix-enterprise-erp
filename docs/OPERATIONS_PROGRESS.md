# DEMIX Operations — release and verification log

This file is the persistent checkpoint for the operations work. Continue from this branch and this checklist; do not restart or replace the HR foundation.

## Current source of truth

- Repository: https://github.com/DrHanyM/demix-enterprise-erp
- Working branch: `feature/operations-modules`
- Latest application-code commit verified in Preview: `ad6290d735e730d9ac4ff1f9c0aef010d2830bf3`
- Stable branch Preview link: https://demix-enterprise-erp-git-feature-opera-85d323-hany-m-abdelmonem.vercel.app
- Verified Preview deployment: https://demix-enterprise-1tt6fhx28-hany-m-abdelmonem.vercel.app
- Preview deployment ID: `dpl_5H1HLgwDnjXeQ6g1bHHgVwwxXvsv`
- Preview state: READY; Next.js compilation and TypeScript completed; route `/stations/tools` appears in the build output.
- No Production deployment was performed.

## Screens and navigation

- Existing HR, payroll, finance, production and station-management routes were not replaced.
- Existing `/stations` page remains the station master screen; a link to the new tools page was added.
- Added `/stations/tools` for selecting an existing active station, issuing a station-specific connector token, downloading its profile and CONFIG, and viewing the server's last sync status.
- Added navigation from the dashboard and system settings.
- Existing six station codes and records are not recreated or edited by this change.

## Agreed station behavior

- Operator edits only the single non-empty line in `CONFIG`: full UNC/local database path plus filename.
- Example: `\\192.168.10.1\folderName\DB name.mdb`
- Task Scheduler task name: `DEMIX_PRODUCTION_SYNC`.
- Schedule: at Windows startup and every 7 minutes; configurable later in Windows Task Scheduler.
- Server processes each received batch immediately; seven minutes is the station polling/sending interval, not a server processing delay.
- Access source is never written to. Connector snapshots the source and opens only the snapshot read-only.
- Local durable queue: `D:\DEMIX_SYNC\DATA\SyncQueue.db`.
- Retry until acknowledged; dedupe key: station + machine + source record ID.
- Imported records remain separate from manual production records. No inventory deduction or automatic posting.

## Implemented in source

- [x] Connector reads the one-line CONFIG.
- [x] Local SQLite outbox, retry, duplicate detection and changed-row detection.
- [x] Machine ID included in station batch payload.
- [x] Server schema and ingest code include machine-aware deduplication.
- [x] Windows Task Scheduler installer configured for 7-minute interval and startup.
- [x] Station tools UI and dashboard/settings links.
- [x] Per-station token issuance stores only SHA-256 token hash; old token is replaced on rotation.
- [x] HTTP endpoint authenticates the per-station token and checks the station code.
- [x] Vercel Preview web build READY for commit `ad6290d`; TypeScript completed.
- [x] Station tools screen guards token issuance and status queries until the Convex Preview backend is deployed; no unusable station key can be issued prematurely.
- [x] GitHub Actions connector test run #18 succeeded: https://github.com/DrHanyM/demix-enterprise-erp/actions/runs/42977196386

## Remaining gates — do not skip

- [ ] Deploy the updated Convex schema/functions to the intended **Preview/staging** Convex deployment. The Vercel Preview build above deliberately did not run `convex deploy`; it only built the web app.
- [ ] After that backend deployment, set `NEXT_PUBLIC_STATION_SYNC_ENABLED=true` in Vercel Preview and redeploy the Preview branch.
- [ ] Verify the preview's Clerk authorization and that a central administrator with `system.stations.manage` can open the tools page.
- [ ] Verify token issuance and one-time profile download against the deployed Preview Convex backend.
- [ ] Inspect the actual Al-Warraqsh Access schema on a safe copy: table names, columns, source-ID uniqueness, and whether the production row is written only after mixer loading completes.
- [ ] Verify UNC share access under the actual scheduled-task account; Windows SYSTEM may not have permissions to a NAS/workgroup share.
- [ ] Run connector tests on a safe copy and test offline/retry/acknowledgement without touching the live database.
- [ ] Only after approval, conduct a supervised end-to-end test from the Al-Warraqsh PC.
- [ ] Do not merge to the HR branch or deploy Production without explicit approval.

## Verification links

- Branch: https://github.com/DrHanyM/demix-enterprise-erp/tree/feature/operations-modules
- Latest preview deployment: https://demix-enterprise-5yh23se8a-hany-m-abdelmonem.vercel.app
- GitHub Actions: https://github.com/DrHanyM/demix-enterprise-erp/actions
- Station connector tests workflow: https://github.com/DrHanyM/demix-enterprise-erp/actions/workflows/station-connector-tests.yml

Update this checkpoint after every implementation, test, correction, and deployment. Never mark a gate complete unless it has been verified.


## 2026-11-14 — Production analysis and station comparison follow-up

- [x] Production analysis can load all remaining pages in the selected station/date range before reporting or exporting, rather than silently treating the first 500 rows as the complete result.
- [x] Full CSV export is enabled only after the selected result set is fully loaded.
- [x] Added a local-comparison JSON export containing station code, source record ID, and original raw source fields; the Access database is not uploaded.
- [x] Material analysis now preserves and displays the source fields MBZ, CLZ, JDZ, XDZ, HSL (GL slots), and HGL (WJ slots). Only NAM_WJA1 and NAM_WJA2 retain the agreed Admix1/Admix2 labels; no unconfirmed material-field meanings are inferred.
- [x] Corrected the local comparison command to run `py .\\compare_db.py`.
- [x] Local comparison now matches by source ID first and falls back to the agreed composite identity: ScTime + customer + project + Output_vol. Ambiguous duplicate composite keys are not auto-matched.
- [x] Station sync check response now reports whether rawSourceData exists, matching the connector's reconciliation contract.
- [x] GitHub Actions Station Connector Tests passed for the comparison-tool update: https://github.com/DrHanyM/demix-enterprise-erp/actions/runs/43556252407
- [ ] Verify the Vercel Preview build for the production-analysis page changes.
- [ ] After the current station upload completes, deploy the stationSync check-response change to the intended Convex Preview deployment and verify repeat-run skip behavior.
- [ ] Test the JSON export and local DB.MDB comparison on the station PC. No Production deployment.
