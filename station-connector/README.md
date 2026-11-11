# DEMIX Station Connector — package revision

## Station operator: one setting only

Edit the only non-empty line in CONFIG with the full database path and file name, for example:

    \\192.168.10.1\\folderName\\DB name.mdb

Do not enter the path in any other file. station-profile.json is generated for the selected station and contains its identity, server endpoint, and credential. The station operator does not edit it.

## Seven-minute schedule

INSTALL.ps1 registers Windows Task Scheduler task DEMIX_PRODUCTION_SYNC. It runs at Windows startup and repeats every 7 minutes, as SYSTEM even when no operator is logged in. IgnoreNew prevents overlapping executions. Failed sends remain in the local SQLite outbox for the next run. Because SYSTEM reaches a UNC share using the computer account, the network share and NTFS permissions must grant the station computer account read access; otherwise use an approved service account configured in Task Scheduler.

The interval can be changed later in Task Scheduler. It controls station reading/sending only. The server handles each received batch immediately. The connector reads the source on the seven-minute cycle; it does not yet infer mixer completion from a sensor or a guessed status field. Before enabling it, verify on the Al-Warraqsh PC that the source row is written only after the mixer has finished loading. If the Access application exposes a reliable completion/status field instead, configure and test that exact field before filtering records.

## Delivery and source safety

- The original Access file is copied to a local temporary snapshot; ODBC opens only the snapshot with ReadOnly=1.
- Source SHA-256 and file metadata are checked around the copy. A changing source aborts the cycle.
- Local durable queue: D:\DEMIX_SYNC\\DATA\\SyncQueue.db.
- New and changed rows are detected by content hash, without assuming source ID is numeric or sequential.
- Local and server deduplication identity is station + machine + source record ID.
- A record is marked sent only after a successful server acknowledgement. Failed sends remain pending and retry.
- Imported records remain separate from manually entered production records. No inventory deduction or automatic posting occurs.

## Package files

CONFIG: one operator-edited database path line.
station-profile.json: generated per station; contains protected connector credentials.
connector.py: one-shot read, queue, and send cycle.
PUCH.PS1: Task Scheduler entry point.
INSTALL.ps1: dependency, ACL and scheduled-task installer.
Queue folders are created automatically under D:\DEMIX_SYNC.

## Pre-production gate

Do not enable the task against a live station until the Al-Warraqsh database path, ODBC driver, actual table/column names, source ID uniqueness, and the moment the mixer-load row is written have been checked. This repository update does not provision a real station credential, deploy Convex, or test the live station.
