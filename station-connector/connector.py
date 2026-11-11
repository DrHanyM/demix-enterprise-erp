#!/usr/bin/env python3
"""Read-only DeMix Access station connector. Never writes to the MDB file."""
from __future__ import annotations
import hashlib, json, logging, os, time, uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
LOCAL_TZ = ZoneInfo(os.environ.get('DEMIX_STATION_TIMEZONE', 'Africa/Cairo'))
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "station-connector.json"
STATE = ROOT / "checkpoint.json"
LOG = ROOT / "station-connector.log"
logging.basicConfig(filename=LOG, level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

def load_json(path: Path, default):
    if not path.exists(): return default
    return json.loads(path.read_text(encoding="utf-8"))

def save_json(path: Path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)

def epoch_ms(value):
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=LOCAL_TZ)
        return int(dt.timestamp() * 1000)
    if isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None: parsed = parsed.replace(tzinfo=LOCAL_TZ)
        return int(parsed.timestamp() * 1000)
    raise ValueError("Unsupported sctime value")

def clean(value):
    if value is None: return None
    result = str(value).strip()
    return result or None

def map_row(row):
    source_id, stamp, quantity, job, strength, operator, customer, project = row
    source_id = str(source_id).strip()
    mapped = {
        "sourceRecordId": source_id,
        "productionAt": epoch_ms(stamp),
        "customerName": clean(customer),
        "projectName": clean(project),
        "jobNo": clean(job),
        "concreteGrade": clean(strength),
        "quantity": float(quantity) if quantity is not None else None,
        "operatorName": clean(operator),
    }
    canonical = json.dumps(mapped, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    mapped["sourceHash"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {k: v for k, v in mapped.items() if v is not None}

def post_batch(config, records):
    body = json.dumps({
        "stationCode": config["station_code"],
        "batchId": str(uuid.uuid4()),
        "records": records,
    }, ensure_ascii=False).encode("utf-8")
    request = Request(config["convex_site_url"].rstrip("/") + "/station-sync", data=body,
                      headers={"Authorization": "Bearer " + config["connector_token"],
                               "Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=int(config.get("request_timeout_seconds", 30))) as response:
        result = json.loads(response.read().decode("utf-8"))
        if response.status != 200 or not result.get("success"):
            raise RuntimeError("Server rejected batch: " + str(result))
        return result

def connect(config):
    try:
        import pyodbc
    except ImportError as exc:
        raise SystemExit("Missing dependency pyodbc. Run: py -m pip install pyodbc") from exc
    db_path = str(Path(config["database_path"]).resolve())
    if not Path(db_path).is_file(): raise FileNotFoundError("MDB not found: " + db_path)
    driver = config.get("odbc_driver", "Microsoft Access Driver (*.mdb, *.accdb)")
    # ReadOnly=1 and SELECT-only SQL are intentional safety controls.
    connection_string = f"DRIVER={{{driver}}};DBQ={db_path};ReadOnly=1;"
    return pyodbc.connect(connection_string, readonly=True, timeout=10)

def sync_once(config):
    state = load_json(STATE, {"last_id": 0})
    last_id = int(state.get("last_id", 0))
    connection = connect(config)
    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT TOP 1000 [id], [sctime], [output_vol], [job_no], [strength], [operator], [CUST_NM], [PROJ_NM] "
            "FROM [sRecords] WHERE [id] > ? ORDER BY [id] ASC", last_id
        )
        rows = cursor.fetchall()
    finally:
        connection.close()
    if not rows:
        logging.info("No new records. checkpoint=%s", last_id)
        return 0
    mapped = [map_row(row) for row in rows]
    for offset in range(0, len(mapped), 100):
        result = post_batch(config, mapped[offset:offset + 100])
        logging.info("Batch accepted: %s", result)
    # Advance only after every batch was acknowledged. Failed sends replay safely.
    new_last_id = max(int(row[0]) for row in rows)
    save_json(STATE, {"last_id": new_last_id, "updated_at": datetime.now(timezone.utc).isoformat()})
    return len(rows)

def main():
    config = load_json(CONFIG, {})
    required = ["station_code", "database_path", "convex_site_url", "connector_token"]
    missing = [key for key in required if not config.get(key) or "REPLACE_" in str(config.get(key))]
    if missing: raise SystemExit("Configure these fields in station-connector.json: " + ", ".join(missing))
    interval = max(15, int(config.get("poll_interval_seconds", 60)))
    logging.info("Connector started for %s; database is read-only", config["station_code"])
    while True:
        try:
            count = sync_once(config)
            logging.info("Cycle completed; records=%s", count)
        except Exception as exc:
            logging.exception("Sync cycle failed: %s", exc)
        time.sleep(interval)

if __name__ == "__main__":
    main()
