# Shared Station Master for HR and Production

The `stations` table is the single source of truth for station identity and display name across the ERP.

## Existing HR integration verified
- Employee records reference `stationId` (a foreign key to `stations`).
- Employee creation validates that the selected station exists and is active, and checks that it agrees with the selected department's station when the department is station-scoped.
- The HR employee screen loads the station list from `api.stations.listStations` and displays the station name by resolving the employee's `stationId`.
- Attendance setup resolves each employee's station name through the same station record. It does not maintain a separate HR station-name list.
- Departments and shifts also support `stationId`.
- Production records reference the same `stations` table.

## Data integrity rules
- Persist `stationId`, not a copied station name, in HR and production records.
- Renaming a station changes its master name only; historical employee, attendance, and production references remain connected.
- Deactivate rather than delete stations with dependent records.
- Station IDs remain stable for the lifetime of the record.

## Station administrators
The schema already has `userStations` and station-scoped authorization via `requireStationPermission`. The per-station administrator assignment screen and station-scoped HR write permissions still need implementation before station administrators can independently submit attendance or manage HR records. Do not grant central permissions to station users as a shortcut.
