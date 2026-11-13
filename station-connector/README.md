# DEMIX Station Connector — package revision

## Station operator: one setting only

Edit the only non-empty line in CONFIG with the full database path and file name, for example:

    \\192.168.10.1\folderName\DB name.mdb

Do not enter the path in any other file. station-profile.json is generated from **Tools > Stations & Sync** after selecting an existing station. It contains the station identity, server endpoint, and its independent connector token. The server stores only the token hash. The station operator does not edit this file. Rotating the station token invalidates the previous token.

## Seven-minute schedule

INSTALL.ps1 registers Windows Task Scheduler task DEMIX_PRODUCTION_SYNC. It runs at Windows startup and repeats every 7 minutes, as SYSTEM even when no operator is logged in. IgnoreNew prevents overlapping executions. Failed sends remain in the local SQLite outbox for the next run. Because SYSTEM reaches a UNC share using the computer account, the network share and NTFS permissions must grant the station computer account read access; otherwise use an approved service account configured in Task Scheduler.

The interval can be changed later in Task Scheduler. It controls station reading/sending only. The server handles each received batch immediately. The connector reads the source on the seven-minute cycle; it does not yet infer mixer completion from a sensor or a guessed status field. Before enabling it, verify on the Al-Warraqsh PC that the source row is written only after the mixer has finished loading. If the Access application exposes a reliable completion/status field instead, configure and test that exact field before filtering records.

## Delivery and source safety

- The original Access file is copied to a local temporary snapshot; ODBC opens only the snapshot with ReadOnly=1.
- Source SHA-256 and file metadata are checked around the copy. A changing source aborts the cycle.
- Local durable queue: D:\DEMIX_SYNC\DATA\SyncQueue.db.
- New and changed rows are detected by a SHA-256 hash of the **entire source row**, including material columns and operational fields; a change to GL/FL/WJ/Shui is resent even when production quantity is unchanged.
- Local and server deduplication identity is station + machine + source record ID. The connector token is station-specific; it is not a shared company-wide token.
- Every original Access column is preserved in the imported record's rawSourceData payload. Truck_No and OperationState are also mapped to searchable typed fields. GL/FL/WJ/Shui remain verbatim source values; no units or inventory meanings are assumed until an authorized mapping is configured.
- Batch payloads are dynamically split to remain below a 220 KB safety ceiling. Records are marked sent only after the server acknowledges the full batch count.
- A record is marked sent only after a successful server acknowledgement. Failed sends remain pending and retry.
- Imported records remain separate from manually entered production records. No inventory deduction or automatic posting occurs.

## Continue the previously tested 51-of-100 Preview import

- Keep the existing station-profile.json and its token. Do not issue a replacement token for this continuation.
- Set the single CONFIG line to the local DB.MDB path used for the earlier test. The connector opens a verified temporary copy in read-only mode.
- Replace only connector.py with this current file; keep the existing profile and station identity.
- Run `python .\\connector.py --send-preview-first-100`. It examines source rows 1-100, checks their IDs and hashes against the selected station's Preview records, and sends only rows not already present or whose source hash changed. If the prior 51 records are still present with matching hashes, this resumes with the remaining 49 rows from that same window.
- The command is restricted to the approved Preview host, uses a 180 KB payload ceiling, verifies the server acknowledgement, and does not write to the SQLite outbox.
- For the next source window (rows 101-200), run `python .\\connector.py --send-preview-next-100`. Do not use the unrestricted scheduled-sync command when the intention is to send only one selected 100-row window.

## Local DB.MDB comparison against Preview

- Keep the existing station-profile.json and token from the 51-record test.
- Run `python .\\connector.py --compare-preview` from the connector folder and choose the local DB.MDB in the file picker.
- The tool opens a temporary copy in Access Read Only mode, fetches the station's paginated DeMix raw-record manifest through the station token, compares every original source column locally, and writes CSV/JSON reports beside the selected DB.MDB.
- Only the read-only comparison request/response travels over HTTPS. The DB.MDB file and its raw rows are never uploaded; the original database is never modified.
- This command does not send or update production rows. Use the explicit `--send-preview-first-100` / `--send-preview-next-100` commands for controlled upload batches.

## Local DB.MDB comparison (no database upload)

1. In DeMix, open Operations > Production Analysis, clear the date filters, select the required station, and load all result pages until the screen says all results are loaded.
2. Download the DeMix comparison JSON from that screen.
3. Run `python .\\compare_db.py` from this connector folder. Select DB.MDB and then the downloaded DeMix JSON when prompted.
4. The comparison reads a verified local snapshot of DB.MDB in Read Only mode and creates CSV and JSON reports beside the selected export. The Access database is not sent to Vercel or Convex and is never modified.
5. Comparison keys are the original ID within the station. The report classifies matched, DB-only, DeMix-only, different fields, and duplicate IDs.

## Historical DB backfill and reconciliation

- Keep the original DB.MDB/Access file read-only; the connector copies a stable snapshot before opening it with read-only ODBC.
- The local SQLite outbox is durable. An interrupted send is retried, and server batch IDs plus station/machine/source IDs prevent duplicate inserts.
- For the historical backfill, compare the source row count with the server's received/inserted/updated counters after all pending batches are acknowledged. Do not clear the outbox before reconciliation.
- Before enabling the seven-minute scheduled task, verify the actual table/column names, source ID uniqueness, source write-completion point, ODBC driver, and UNC permissions under the task account.

## Package files

CONFIG: one operator-edited database path line.
station-profile.json: generated per station; contains protected connector credentials.
connector.py: one-shot read, queue, and send cycle.
PUCH.PS1: Task Scheduler entry point.
INSTALL.ps1: dependency, ACL and scheduled-task installer.
Queue folders are created automatically under D:\DEMIX_SYNC.

## Pre-production gate

Do not enable the task against a live station until the Al-Warraqsh database path, ODBC driver, actual table/column names, source ID uniqueness, and the moment the mixer-load row is written have been checked. The UI can issue a per-station token, but the new Convex schema and authentication functions must be deployed to the intended Convex environment before token issuance and live ingestion can work. The preview web build does not deploy Convex. No live station credential has been issued and no live Access database has been read.
