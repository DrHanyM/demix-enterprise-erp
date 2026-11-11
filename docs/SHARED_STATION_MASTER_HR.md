# Shared Station Master: HR and Operations Integration

## Source of truth
The `stations` table is the single company-wide station master. Do not create a second HR-only station list or store editable station-name copies in HR records.

## HR data model requirements
Every station-scoped HR record must reference `stationId: Id<"stations">`:
- employee's primary work station;
- attendance and departure records;
- shifts and schedules;
- leave, mission, overtime, and disciplinary records;
- station-level HR reports and approvals.

Display `stations.name` by resolving the referenced station ID. A station rename must not rewrite historical HR or production records.

## Station administrator accounts
A station administrator is an ordinary authenticated user linked through `userStations` to exactly the station(s) they are authorized to administer, with an active role whose scope is `station`. Use `requireStationPermission(ctx, stationId, permissionCode)` for station-scoped operations. Never trust a station ID supplied by the browser without this authorization check.

Central HR administrators may receive central permissions separately. A station administrator must not inherit access to another station.

## Shared lookup
- `api.stations.listActiveStations` is the authenticated lookup for HR and operational screens.
- `api.stations.listStations` remains restricted to central users with `system.stations.manage`.
- HR selectors should use the shared lookup and persist the selected station ID, not the displayed name.

## Data retention
Station IDs are stable. Renaming a station changes only its master record. Deactivation is preferred over deletion. Existing employee, attendance, leave, disciplinary, production, and audit references must remain intact.

## Current implementation boundary
The repository currently has the station master, user-to-station assignment table, and station-scoped authorization helper. The HR dashboard still contains demonstration metrics; full employee, attendance, and station-administrator assignment workflows are not yet implemented. Do not represent demo metrics as live HR data.
