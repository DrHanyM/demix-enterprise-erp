# DeMix Station Connector (read-only)

This first connector release reads the Access source and sends new production rows to the Convex `/station-sync` endpoint. It does not update, insert, delete, compact, or repair the MDB.

## Source mapping

Reads only `sRecords` columns: `id, sctime, output_vol, job_no, strength, operator, CUST_NM, PROJ_NM`.
The checkpoint advances only after all batches are acknowledged. If a request fails, the same source rows are replayed; the server deduplicates by station + source record ID and batch ID.

## Installation (Windows)

1. Install Python 3.11+ and the Microsoft Access Database Engine ODBC driver matching Python bitness.
2. Run `py -m pip install -r requirements.txt`.
3. Copy `station-connector.example.json` to `station-connector.json` and set the correct station code, local MDB path, Convex site URL, and a long random token. Never commit the real config or token.
4. Configure the Convex deployment environment variable `STATION_CONNECTOR_TOKEN` to the same secret, then deploy the Convex functions to the Preview deployment only.
5. Test first with a copy of the MDB or a read-only test account and verify source file modification time/hash does not change.
6. Run `py connector.py`. Configure Windows Task Scheduler to start it at boot and restart on failure after initial acceptance tests.

Install one connector per station PC/database. Do not copy one station's code to another station.

## Safety / operational notes

- ODBC connection uses `ReadOnly=1`; SQL is SELECT-only.
- Never run this against a live station until its exact column names, data types, ODBC driver, and source ID behavior have been verified.
- The current checkpoint strategy assumes `sRecords.id` is a monotonically increasing numeric key. Verify that per station before enabling automatic polling.
- Batch size is at most 100; a poll reads at most 1000 new rows.
- Source rows are stored in a dedicated import table, separate from manually entered `productionRecords`. This avoids falsely attributing machine data to an HR user. UI reconciliation and production reporting integration are a later step.
- Store the connector token securely; do not send it in chat or commit it to Git.
