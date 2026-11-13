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
