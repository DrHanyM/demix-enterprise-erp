#!/usr/bin/env python3
"""DeMix station connector. Access source is never modified."""
from __future__ import annotations
import argparse, hashlib, json, logging, platform, shutil, sqlite3, tempfile
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parent
CONFIG_FILE=ROOT/"CONFIG"
PROFILE_FILE=ROOT/"station-profile.json"
QUEUE_FILE=Path(r"D:\DEMIX_SYNC\DATA\SyncQueue.db")
LOG_DIR=Path(r"D:\DEMIX_SYNC\LOGS")
BATCH_SIZE=100

def setup_logging():
    LOG_DIR.mkdir(parents=True,exist_ok=True)
    logging.basicConfig(filename=LOG_DIR/"station-connector.log",level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",encoding="utf-8")

def load_config():
    lines=[x.strip() for x in CONFIG_FILE.read_text(encoding="utf-8-sig").splitlines()
        if x.strip() and not x.lstrip().startswith("#")]
    if len(lines)!=1: raise RuntimeError("CONFIG must contain exactly one non-empty database path line.")
    path=lines[0].strip('"')
    if not (path.startswith("\\\\") or (len(path)>2 and path[1:3]==":\\")):
        raise RuntimeError("CONFIG must contain a UNC path or local absolute path.")
    if not Path(path).is_file(): raise FileNotFoundError("Database path is not reachable: "+path)
    return path

def load_profile():
    p=json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    for k in ("stationCode","endpoint","connectorToken"):
        if not str(p.get(k,"")).strip() or any(x in str(p.get(k,"")) for x in ("REPLACE_","PROVISIONED_","YOUR-PREVIEW")): raise RuntimeError("Missing station profile field: "+k)
    p.setdefault("machineId",platform.node())
    p.setdefault("table","sRecords")
    p.setdefault("columns",{"id":"ID","time":"ScTime","quantity":"Output_vol","job":"Job_No","grade":"Strength","operator":"Operator","customer":"Cust_Nm","project":"Proj_Nm","truck":"Truck_No","driver":"Driver","operationState":"OperationState"})
    p.setdefault("odbcDriver","Microsoft Access Driver (*.mdb, *.accdb)")
    p.setdefault("maxBatchBytes",180000)
    p.setdefault("requestTimeoutSeconds",30)
    return p

def sha256_file(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""): h.update(chunk)
    return h.hexdigest()

def snapshot_database(source_path):
    source=Path(source_path); before=source.stat(); digest=sha256_file(source)
    folder=Path(tempfile.mkdtemp(prefix="demix_station_"))
    snapshot=folder/("source"+(source.suffix or ".mdb"))
    try:
        shutil.copy2(source,snapshot)
        after=source.stat()
        if digest!=sha256_file(snapshot) or digest!=sha256_file(source) or (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):
            raise RuntimeError("Source database changed during copy; retry on next scheduled cycle.")
        return folder,snapshot,digest
    except Exception:
        shutil.rmtree(folder,ignore_errors=True); raise

def quote_identifier(value):
    value=str(value)
    if not value or "]" in value or "\x00" in value: raise ValueError("Invalid Access identifier")
    return "["+value+"]"

def read_rows(source_path,profile,limit=None):
    try: import pyodbc
    except ImportError as exc: raise RuntimeError("pyodbc missing; rerun INSTALL.ps1") from exc
    folder,snapshot,digest=snapshot_database(source_path); connection=None
    try:
        driver=profile["odbcDriver"]
        connection=pyodbc.connect(f"DRIVER={{{driver}}};DBQ={snapshot};ReadOnly=1;",readonly=True,timeout=15)
        cursor=connection.cursor()
        table=quote_identifier(profile["table"])
        if limit is not None:
            if not isinstance(limit,int) or limit<1 or limit>1000: raise ValueError("Validation limit must be between 1 and 1000.")
            cursor.execute(f"SELECT TOP {limit} * FROM "+table)
        else:
            cursor.execute("SELECT * FROM "+table)
        names=[c[0] for c in cursor.description]
        return [dict(zip(names,row)) for row in cursor.fetchall()],digest
    finally:
        if connection is not None: connection.close()
        shutil.rmtree(folder,ignore_errors=True)

def validate_all_rows(source_path,profile):
    """Validate every source row in bounded memory; never opens the queue or sends data."""
    try: import pyodbc
    except ImportError as exc: raise RuntimeError("pyodbc missing; rerun INSTALL.ps1") from exc
    folder,snapshot,digest=snapshot_database(source_path); connection=None
    valid=0; invalid=0; errors={}; total=0
    try:
        driver=profile["odbcDriver"]
        connection=pyodbc.connect(f"DRIVER={{{driver}}};DBQ={snapshot};ReadOnly=1;",readonly=True,timeout=15)
        cursor=connection.cursor()
        cursor.execute("SELECT * FROM "+quote_identifier(profile["table"]))
        names=[c[0] for c in cursor.description]
        while True:
            batch=cursor.fetchmany(500)
            if not batch: break
            for values in batch:
                total+=1
                try:
                    map_row(dict(zip(names,values)),profile["columns"],profile.get("timezone","Africa/Cairo"))
                    valid+=1
                except Exception as exc:
                    invalid+=1
                    key=type(exc).__name__+": "+str(exc)
                    errors[key]=errors.get(key,0)+1
        return {"mode":"validate_all","read":total,"valid":valid,"invalid":invalid,
                "validationErrors":errors,"sourceSha256":digest,"queueWritten":False,"sent":0}
    finally:
        if connection is not None: connection.close()
        shutil.rmtree(folder,ignore_errors=True)

def _js_length(value):
    return len(str(value).encode("utf-16-le"))//2

def validate_server_rows(source_path,profile):
    """Preflight all records against the Convex HTTP/schema contract and batch limits; no queue or network."""
    try: import pyodbc
    except ImportError as exc: raise RuntimeError("pyodbc missing; rerun INSTALL.ps1") from exc
    folder,snapshot,digest=snapshot_database(source_path); connection=None
    valid=0; invalid=0; errors={}; total=0
    batch_count=0; current_records=[]; current_bytes=0; max_batch_bytes=0; largest_record_bytes=0
    max_batch_bytes_limit=int(profile.get("maxBatchBytes",180000))
    station=profile["stationCode"]; machine=profile["machineId"]
    def envelope_size(records):
        envelope={"stationCode":station,"machineId":machine,"batchId":"0"*64,"records":records}
        return len(json.dumps(envelope,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8"))
    def finish_batch():
        nonlocal batch_count,max_batch_bytes,current_records,current_bytes
        if current_records:
            batch_count+=1
            max_batch_bytes=max(max_batch_bytes,current_bytes)
            current_records=[]; current_bytes=0
    try:
        driver=profile["odbcDriver"]
        connection=pyodbc.connect(f"DRIVER={{{driver}}};DBQ={snapshot};ReadOnly=1;",readonly=True,timeout=15)
        cursor=connection.cursor()
        cursor.execute("SELECT * FROM "+quote_identifier(profile["table"]))
        names=[c[0] for c in cursor.description]
        for values in iter(lambda: cursor.fetchmany(500), []):
            for source_row in values:
                total+=1
                try:
                    record=map_row(dict(zip(names,source_row)),profile["columns"],profile.get("timezone","Africa/Cairo"))
                    problems=[]
                    if not record["sourceRecordId"].strip() or _js_length(record["sourceRecordId"])>160: problems.append("INVALID_SOURCE_RECORD_ID")
                    if not record["sourceHash"].strip() or _js_length(record["sourceHash"])>128: problems.append("INVALID_SOURCE_HASH")
                    if not isinstance(record["productionAt"],(int,float)) or not __import__("math").isfinite(record["productionAt"]) or record["productionAt"]<=0: problems.append("INVALID_PRODUCTION_TIMESTAMP")
                    q=record.get("quantity")
                    if q is not None and (not __import__("math").isfinite(q) or q<0 or q>100000): problems.append("INVALID_PRODUCTION_QUANTITY")
                    for key in ("customerName","projectName","jobNo","concreteGrade","operatorName","truckNumber","driverName"):
                        if key in record and _js_length(record[key])>300: problems.append("SOURCE_FIELD_TOO_LONG:"+key)
                    state=record.get("operationState")
                    if state is not None and not __import__("math").isfinite(state): problems.append("INVALID_OPERATION_STATE")
                    raw=record.get("rawSourceData")
                    if raw is not None and (not isinstance(raw,dict)): problems.append("INVALID_RAW_SOURCE_DATA")
                    encoded=json.dumps(record,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8")
                    single_size=envelope_size([record])
                    largest_record_bytes=max(largest_record_bytes,single_size)
                    if single_size>max_batch_bytes_limit: problems.append("SINGLE_RECORD_EXCEEDS_BATCH_BYTE_LIMIT")
                    if problems:
                        invalid+=1
                        for problem in problems: errors[problem]=errors.get(problem,0)+1
                        continue
                    valid+=1
                    candidate=current_records+[record]
                    candidate_size=envelope_size(candidate)
                    if current_records and (len(candidate)>100 or candidate_size>max_batch_bytes_limit):
                        finish_batch()
                        candidate=[record]; candidate_size=single_size
                    current_records=candidate; current_bytes=candidate_size
                except Exception as exc:
                    invalid+=1
                    key=type(exc).__name__+": "+str(exc)
                    errors[key]=errors.get(key,0)+1
        finish_batch()
        return {"mode":"validate_server_contract","read":total,"valid":valid,"invalid":invalid,
                "validationErrors":errors,"estimatedBatches":batch_count,
                "maxBatchBytesObserved":max_batch_bytes,"largestSingleRecordEnvelopeBytes":largest_record_bytes,
                "batchByteLimit":max_batch_bytes_limit,"serverBodyCharacterLimit":256000,
                "sourceSha256":digest,"queueWritten":False,"sent":0}
    finally:
        if connection is not None: connection.close()
        shutil.rmtree(folder,ignore_errors=True)

def epoch_ms(value,timezone_name="Africa/Cairo"):
    from zoneinfo import ZoneInfo
    if value is None: raise ValueError("Production timestamp is empty")
    parsed=value if isinstance(value,datetime) else datetime.fromisoformat(str(value).replace("Z","+00:00"))
    if parsed.tzinfo is None: parsed=parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return int(parsed.timestamp()*1000)

def clean(value):
    if value is None:return None
    value=str(value).strip()
    return value or None

def json_safe(value):
    if value is None or isinstance(value,(str,int,bool)): return value
    if isinstance(value,float): return value if value == value and abs(value) != float("inf") else None
    if isinstance(value,datetime): return value.isoformat()
    if hasattr(value,"isoformat") and callable(value.isoformat): return value.isoformat()
    if isinstance(value,bytes): return {"__bytes_base64__":__import__("base64").b64encode(value).decode("ascii")}
    if isinstance(value,dict): return {str(k):json_safe(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)): return [json_safe(v) for v in value]
    return str(value)

def map_row(row,columns,timezone_name="Africa/Cairo"):
    values={str(k).lower():v for k,v in row.items()}
    def get(alias):
        name=columns.get(alias)
        return values.get(str(name).lower()) if name else None
    source_id=clean(get("id"))
    if source_id is None: raise ValueError("Source row has no configured unique ID")
    quantity=get("quantity")
    operation_state=get("operationState")
    result={"sourceRecordId":source_id,"productionAt":epoch_ms(get("time"),timezone_name),
        "customerName":clean(get("customer")),"projectName":clean(get("project")),
        "jobNo":clean(get("job")),"concreteGrade":clean(get("grade")),
        "quantity":float(quantity) if quantity is not None else None,"operatorName":clean(get("operator")),
        "truckNumber":clean(get("truck")),"driverName":clean(get("driver")),
        "operationState":float(operation_state) if operation_state is not None else None,
        "rawSourceData":{str(k):json_safe(v) for k,v in row.items()}}
    raw=json.dumps(result,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False)
    result["sourceHash"]=hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return {k:v for k,v in result.items() if v is not None}

def open_queue():
    QUEUE_FILE.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(QUEUE_FILE,timeout=30); db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS outbox(
      station TEXT NOT NULL,machine TEXT NOT NULL,source_id TEXT NOT NULL,source_hash TEXT NOT NULL,
      payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',batch_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,queued_at TEXT NOT NULL,sent_at TEXT,PRIMARY KEY(station,machine,source_id))""")
    # Requeue batches interrupted while in-flight; stable batch IDs make retry idempotent.
    db.execute("UPDATE outbox SET status='pending' WHERE status='sending'")
    db.commit(); return db

def enqueue(db,profile,rows):
    count=0; station=profile["stationCode"]; machine=profile["machineId"]
    for row in rows:
        item=map_row(row,profile["columns"],profile.get("timezone","Africa/Cairo"))
        old=db.execute("SELECT source_hash FROM outbox WHERE station=? AND machine=? AND source_id=?",
            (station,machine,item["sourceRecordId"])).fetchone()
        if old and old[0]==item["sourceHash"]: continue
        db.execute("""INSERT INTO outbox(station,machine,source_id,source_hash,payload,status,batch_id,attempts,last_error,queued_at,sent_at)
          VALUES(?,?,?,?,?,'pending',NULL,0,NULL,?,NULL)
          ON CONFLICT(station,machine,source_id) DO UPDATE SET source_hash=excluded.source_hash,payload=excluded.payload,
          status='pending',batch_id=NULL,last_error=NULL,queued_at=excluded.queued_at,sent_at=NULL""",
          (station,machine,item["sourceRecordId"],item["sourceHash"],json.dumps(item,ensure_ascii=False),datetime.now().astimezone().isoformat()))
        count+=1
    db.commit(); return count

def next_batch(db,profile):
    station=profile["stationCode"]; machine=profile["machineId"]
    rows=db.execute("SELECT source_id,source_hash,payload FROM outbox WHERE station=? AND machine=? AND status='pending' ORDER BY queued_at,source_id LIMIT ?",
        (station,machine,BATCH_SIZE)).fetchall()
    if not rows:return None
    max_bytes=int(profile.get("maxBatchBytes",180000))
    records=[]; selected=[]
    for row in rows:
        candidate=records+[json.loads(row[2])]
        envelope={"stationCode":station,"machineId":machine,"batchId":"0"*64,"records":candidate}
        size=len(json.dumps(envelope,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8"))
        if size>max_bytes:
            if not records: raise RuntimeError("A single source record exceeds the configured safe batch byte limit.")
            break
        records=candidate; selected.append(row)
    material="|".join(r[0]+":"+r[1] for r in selected)
    batch=hashlib.sha256((station+"|"+machine+"|"+material).encode()).hexdigest()
    db.executemany("UPDATE outbox SET status='sending',batch_id=? WHERE station=? AND machine=? AND source_id=?",
        [(batch,station,machine,r[0]) for r in selected]); db.commit()
    return batch,records,[r[0] for r in selected]

def send_pending(db,profile):
    sent=0; station=profile["stationCode"]; machine=profile["machineId"]
    while True:
        item=next_batch(db,profile)
        if item is None:break
        batch,records,ids=item
        try:
            body=json.dumps({"stationCode":station,"machineId":machine,"batchId":batch,"records":records},ensure_ascii=False).encode()
            request=Request(profile["endpoint"].rstrip("/"),data=body,headers={"Authorization":"Bearer "+profile["connectorToken"],"Content-Type":"application/json"},method="POST")
            with urlopen(request,timeout=int(profile["requestTimeoutSeconds"])) as response:
                result=json.loads(response.read().decode())
                if response.status!=200 or not result.get("success"):raise RuntimeError("Server did not acknowledge batch")
            now=datetime.now().astimezone().isoformat()
            db.executemany("UPDATE outbox SET status='sent',sent_at=?,last_error=NULL WHERE station=? AND machine=? AND source_id=? AND batch_id=?",
                [(now,station,machine,x,batch) for x in ids]); db.commit(); sent+=len(ids)
        except Exception as exc:
            db.executemany("UPDATE outbox SET status='pending',attempts=attempts+1,last_error=? WHERE station=? AND machine=? AND source_id=? AND batch_id=?",
                [(str(exc)[:500],station,machine,x,batch) for x in ids]); db.commit()
            logging.exception("Send failed; records retained for retry"); break
    return sent


def send_preview_first_batch(source_path,profile,limit=100):
    """Send only the first byte-bounded batch directly; bypasses SQLite/outbox."""
    from urllib.parse import urlparse
    endpoint=profile["endpoint"].rstrip("/")
    parsed=urlparse(endpoint)
    if parsed.scheme!="https" or parsed.hostname!="savory-hyena-978.ap-southeast-2.convex.site" or parsed.path!="/station-sync":
        raise RuntimeError("PREVIEW_ENDPOINT_MISMATCH: refusing to send anywhere except the approved Preview station-sync endpoint.")
    if not profile.get("connectorToken"):
        raise RuntimeError("Missing station connector credential.")
    if limit!=100:
        raise ValueError("The one-time Preview test reads at most the first 100 source rows.")
    rows,digest=read_rows(source_path,profile,limit=limit)
    if not rows:
        raise RuntimeError("No source rows found; nothing was sent.")
    station=profile["stationCode"]; machine=profile["machineId"]
    max_bytes=int(profile.get("maxBatchBytes",180000))
    if max_bytes<1024 or max_bytes>180000:
        raise RuntimeError("Configured batch byte limit is outside the approved safe range.")
    records=[]
    def make_body(candidate,batch_id):
        payload={"stationCode":station,"machineId":machine,"batchId":batch_id,"records":candidate}
        return json.dumps(payload,ensure_ascii=False,separators=(",",":"),allow_nan=False).encode("utf-8")
    # Select a contiguous prefix only. Never skip an oversized row and send later rows.
    for row in rows:
        record=map_row(row,profile["columns"],profile.get("timezone","Africa/Cairo"))
        if not record["sourceRecordId"].strip() or _js_length(record["sourceRecordId"])>160:
            raise RuntimeError("INVALID_SOURCE_RECORD_ID; nothing was sent.")
        if not record["sourceHash"].strip() or _js_length(record["sourceHash"])>128:
            raise RuntimeError("INVALID_SOURCE_HASH; nothing was sent.")
        if not isinstance(record["productionAt"],(int,float)) or not __import__("math").isfinite(record["productionAt"]) or record["productionAt"]<=0:
            raise RuntimeError("INVALID_PRODUCTION_TIMESTAMP; nothing was sent.")
        q=record.get("quantity")
        if q is not None and (not __import__("math").isfinite(q) or q<0 or q>100000):
            raise RuntimeError("INVALID_PRODUCTION_QUANTITY; nothing was sent.")
        for key in ("customerName","projectName","jobNo","concreteGrade","operatorName","truckNumber","driverName"):
            if key in record and _js_length(record[key])>300:
                raise RuntimeError("SOURCE_FIELD_TOO_LONG; nothing was sent.")
        state=record.get("operationState")
        if state is not None and not __import__("math").isfinite(state):
            raise RuntimeError("INVALID_OPERATION_STATE; nothing was sent.")
        raw=record.get("rawSourceData")
        if raw is not None and not isinstance(raw,dict):
            raise RuntimeError("INVALID_RAW_SOURCE_DATA; nothing was sent.")
        candidate=records+[record]
        # Batch ID is fixed-width, so a zero-filled placeholder gives exact envelope sizing.
        candidate_body=make_body(candidate,"0"*64)
        if len(candidate)>100 or len(candidate_body)>max_bytes or len(candidate_body)>256000:
            if not records:
                raise RuntimeError("FIRST_RECORD_EXCEEDS_SAFE_BATCH_LIMIT; nothing was sent.")
            break
        records=candidate
    if not records:
        raise RuntimeError("No records fit within the safe batch limit; nothing was sent.")
    material="|".join(r["sourceRecordId"]+":"+r["sourceHash"] for r in records)
    batch_id=hashlib.sha256((station+"|"+machine+"|"+material).encode("utf-8")).hexdigest()
    body=make_body(records,batch_id)
    if len(body)>max_bytes or len(body)>256000:
        raise RuntimeError("FINAL_BATCH_SIZE_CHECK_FAILED; nothing was sent.")
    request=Request(endpoint,data=body,headers={
        "Authorization":"Bearer "+profile["connectorToken"],
        "Content-Type":"application/json"
    },method="POST")
    try:
        with urlopen(request,timeout=int(profile.get("requestTimeoutSeconds",30))) as response:
            response_body=response.read().decode("utf-8")
            result=json.loads(response_body) if response_body else {}
            if response.status!=200 or not result.get("success"):
                raise RuntimeError("Preview did not acknowledge the batch.")
    except Exception:
        logging.exception("One-time Preview batch send failed; no automatic retry was attempted.")
        raise
    return {"mode":"preview_one_batch","sourceRowsInspected":len(rows),
            "sent":len(records),"remainingFromInspectedRows":len(rows)-len(records),
            "queueWritten":False,"queueRead":False,"batchesSent":1,
            "response":result,"payloadBytes":len(body),"batchByteLimit":max_bytes,
            "sourceSha256":digest,"batchId":batch_id,"endpointHost":parsed.hostname}

def run_once(validate_only=False,limit=None,validate_all=False,validate_server=False,send_preview=False):
    setup_logging(); source=load_config(); profile=load_profile()
    if send_preview:
        return send_preview_first_batch(source,profile,limit=100)
    if validate_server:
        return validate_server_rows(source,profile)
    if validate_all:
        return validate_all_rows(source,profile)
    if validate_only and limit is None:
        raise ValueError("--validate-only requires an explicit --limit (1..1000).")
    rows,digest=read_rows(source,profile,limit if validate_only else None)
    if validate_only:
        valid=0; invalid=0; errors={}
        for row in rows:
            try:
                map_row(row,profile["columns"],profile.get("timezone","Africa/Cairo"))
                valid+=1
            except Exception as exc:
                invalid+=1
                key=type(exc).__name__+": "+str(exc)
                errors[key]=errors.get(key,0)+1
        return {"mode":"validate_only","read":len(rows),"valid":valid,"invalid":invalid,
                "validationErrors":errors,"sourceSha256":digest,"queueWritten":False,"sent":0}
    db=open_queue()
    try:
        added=enqueue(db,profile,rows); sent=send_pending(db,profile)
        result={"read":len(rows),"queued":added,"sent":sent}
        logging.info("Sync completed %s source_sha256=%s",result,digest); return result
    finally: db.close()

if __name__=="__main__":
    parser=argparse.ArgumentParser(description="DeMix station connector")
    parser.add_argument("--validate-only",action="store_true",
                        help="Read a bounded sample and validate mapping without writing the queue or sending data.")
    parser.add_argument("--limit",type=int,
                        help="Required with --validate-only; number of source rows to inspect (1..1000).")
    parser.add_argument("--validate-all",action="store_true",
                        help="Validate every source row in bounded memory without queue writes or network sends.")
    parser.add_argument("--send-preview-first-100",action="store_true",
                        help="Send exactly one 100-record batch to the hard-locked Preview endpoint; bypasses the SQLite queue.")
    parser.add_argument("--validate-server-contract",action="store_true",
                        help="Preflight every row against server validators and estimate safe batch sizes; no queue or network.")
    args=parser.parse_args()
    if args.send_preview_first_100 and (args.validate_server_contract or args.validate_only or args.validate_all or args.limit is not None):
        parser.error("--send-preview-first-100 cannot be combined with validation flags or --limit.")
    if args.validate_server_contract and (args.validate_only or args.validate_all or args.limit is not None):
        parser.error("--validate-server-contract cannot be combined with other validation flags.")
    if args.validate_all and (args.validate_only or args.limit is not None):
        parser.error("--validate-all cannot be combined with --validate-only or --limit.")
    try:
        print(json.dumps(run_once(validate_only=args.validate_only,limit=args.limit,
                                  validate_all=args.validate_all,
                                  validate_server=args.validate_server_contract,
                                  send_preview=args.send_preview_first_100),ensure_ascii=False))
    except Exception:
        setup_logging(); logging.exception("Sync cycle failed"); raise
