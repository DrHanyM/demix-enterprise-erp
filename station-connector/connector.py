#!/usr/bin/env python3
"""DeMix station connector. Access source is never modified."""
from __future__ import annotations
import argparse, hashlib, json, logging, math, platform, shutil, sqlite3, tempfile
from datetime import date, datetime, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlsplit

ROOT=Path(__file__).resolve().parent
CONFIG_FILE=ROOT/"CONFIG"
PROFILE_FILE=ROOT/"station-profile.json"
QUEUE_FILE=Path(r"D:\DEMIX_SYNC\DATA\SyncQueue.db")
LOG_DIR=Path(r"D:\DEMIX_SYNC\LOGS")
BATCH_SIZE=100
MAX_BATCH_BYTES=220_000

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
    p.setdefault("columns",{})
    default_columns={"id":"id","time":"sctime","quantity":"output_vol","job":"job_no","grade":"strength",
        "operator":"operator","driver":"Driver","customer":"CUST_NM","project":"PROJ_NM","truck":"Truck_No",
        "operationState":"OperationState","gl":"GL","fl":"FL","wj":"WJ","shui":"Shui"}
    for key,value in default_columns.items(): p["columns"].setdefault(key,value)
    p.setdefault("odbcDriver","Microsoft Access Driver (*.mdb, *.accdb)")
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

def read_rows(source_path,profile):
    try: import pyodbc
    except ImportError as exc: raise RuntimeError("pyodbc missing; rerun INSTALL.ps1") from exc
    folder,snapshot,digest=snapshot_database(source_path); connection=None
    try:
        driver=profile["odbcDriver"]
        connection=pyodbc.connect(f"DRIVER={{{driver}}};DBQ={snapshot};ReadOnly=1;",readonly=True,timeout=15)
        cursor=connection.cursor(); cursor.execute("SELECT * FROM "+quote_identifier(profile["table"]))
        names=[c[0] for c in cursor.description]
        return [dict(zip(names,row)) for row in cursor.fetchall()],digest
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
    if isinstance(value,float) and not math.isfinite(value): return str(value)
    if value is None or isinstance(value,(str,int,float,bool)): return value
    if isinstance(value,(datetime,date,time)): return value.isoformat()
    if isinstance(value,bytes): return {"__type":"bytes","hex":value.hex()}
    return str(value)

def map_row(row,columns,timezone_name="Africa/Cairo"):
    values={str(k).lower():v for k,v in row.items()}
    def get(alias):
        name=columns.get(alias)
        return values.get(str(name).lower()) if name else None
    source_id=clean(get("id"))
    if source_id is None: raise ValueError("Source row has no configured unique ID")
    quantity=get("quantity")
    numeric_quantity=float(quantity) if quantity is not None else None
    if numeric_quantity is not None and not math.isfinite(numeric_quantity): raise ValueError("Source quantity is not a finite number")
    raw_data={str(k):json_safe(v) for k,v in row.items()}
    result={"sourceRecordId":source_id,"productionAt":epoch_ms(get("time"),timezone_name),
        "customerName":clean(get("customer")),"projectName":clean(get("project")),
        "jobNo":clean(get("job")),"concreteGrade":clean(get("grade")),
        "quantity":numeric_quantity,"operatorName":clean(get("operator")),"driverName":clean(get("driver") or get("operator")),
        "truckNo":clean(get("truck")),"operationState":clean(get("operationState")),
        "rawSourceData":raw_data}
    raw=json.dumps(raw_data,ensure_ascii=False,sort_keys=True,separators=(",",":"))
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
    while rows:
        records=[json.loads(r[2]) for r in rows]
        probe=json.dumps({"stationCode":station,"machineId":machine,"batchId":"x","records":records},ensure_ascii=False,separators=(",",":")).encode("utf-8")
        if len(probe)<=MAX_BATCH_BYTES: break
        if len(rows)==1: raise RuntimeError("A single source record exceeds the safe HTTP batch size; it remains queued for review.")
        rows=rows[:max(1,len(rows)//2)]
    material="|".join(r[0]+":"+r[1] for r in rows)
    batch=hashlib.sha256((station+"|"+machine+"|"+material).encode()).hexdigest()
    db.executemany("UPDATE outbox SET status='sending',batch_id=? WHERE station=? AND machine=? AND source_id=?",
        [(batch,station,machine,r[0]) for r in rows]); db.commit()
    return batch,records,[r[0] for r in rows]

def send_pending(db,profile):
    sent=0; station=profile["stationCode"]; machine=profile["machineId"]
    while True:
        item=next_batch(db,profile)
        if item is None:break
        batch,records,ids=item
        try:
            body=json.dumps({"stationCode":station,"machineId":machine,"batchId":batch,"records":records},ensure_ascii=False,separators=(",",":")).encode("utf-8")
            if len(body)>MAX_BATCH_BYTES: raise RuntimeError("Batch exceeded the safe HTTP size limit; records remain queued.")
            request=Request(profile["endpoint"].rstrip("/"),data=body,headers={"Authorization":"Bearer "+profile["connectorToken"],"Content-Type":"application/json"},method="POST")
            with urlopen(request,timeout=int(profile["requestTimeoutSeconds"])) as response:
                result=json.loads(response.read().decode())
                if response.status!=200 or not result.get("success") or result.get("received")!=len(records):
                    raise RuntimeError("Server did not acknowledge the complete batch")
            now=datetime.now().astimezone().isoformat()
            db.executemany("UPDATE outbox SET status='sent',sent_at=?,last_error=NULL WHERE station=? AND machine=? AND source_id=? AND batch_id=?",
                [(now,station,machine,x,batch) for x in ids]); db.commit(); sent+=len(ids)
        except Exception as exc:
            db.executemany("UPDATE outbox SET status='pending',attempts=attempts+1,last_error=? WHERE station=? AND machine=? AND source_id=? AND batch_id=?",
                [(str(exc)[:500],station,machine,x,batch) for x in ids]); db.commit()
            logging.exception("Send failed; records retained for retry"); break
    return sent

def check_server_records(profile, records):
    body=json.dumps({"machineId":profile["machineId"],"records":records},ensure_ascii=False,separators=(",",":")).encode("utf-8")
    request=Request(profile["endpoint"].rstrip("/")+"/check",data=body,
        headers={"Authorization":"Bearer "+profile["connectorToken"],"Content-Type":"application/json"},method="POST")
    with urlopen(request,timeout=int(profile["requestTimeoutSeconds"])) as response:
        result=json.loads(response.read().decode())
        if response.status!=200 or not result.get("success") or not isinstance(result.get("matches"),list):
            raise RuntimeError("Preview could not confirm existing source records")
        return {str(x["sourceRecordId"]):{"sourceHash":str(x["sourceHash"]),"hasRawSourceData":bool(x.get("hasRawSourceData",False))} for x in result["matches"]}

def send_preview_window(start,end):
    setup_logging()
    profile=load_profile()
    host=(urlsplit(profile["endpoint"]).hostname or "").lower()
    if host != "savory-hyena-978.ap-southeast-2.convex.site":
        raise RuntimeError("Safety stop: this command is restricted to the approved Convex Preview deployment.")
    source=load_config()
    rows,digest=read_rows(source,profile)
    window=rows[start:end]
    unique={}
    duplicates=0
    conflicts=set()
    for row in window:
        item=map_row(row,profile["columns"],profile.get("timezone","Africa/Cairo"))
        key=item["sourceRecordId"]
        if key in unique:
            duplicates+=1
            if unique[key]["sourceHash"]!=item["sourceHash"]: conflicts.add(key)
            continue
        unique[key]=item
    items=list(unique.values())
    check=check_server_records(profile,[{"sourceRecordId":x["sourceRecordId"],"sourceHash":x["sourceHash"]} for x in items]) if items else {}
    candidates=[item for item in items if item["sourceRecordId"] not in conflicts and (item["sourceRecordId"] not in check or check[item["sourceRecordId"]]["sourceHash"]!=item["sourceHash"] or not check[item["sourceRecordId"]]["hasRawSourceData"])]
    if not candidates:
        result={"read":len(rows),"windowStart":start+1 if window else None,"windowEnd":start+len(window) if window else None,
            "scanned":len(window),"pending":0,"sent":0,"inserted":0,"updated":0,"alreadyMatched":len(items)-len(conflicts),
            "duplicateSourceRows":duplicates,"conflictingSourceIds":len(conflicts),"queueWritten":False,
            "sourceSha256":digest,"message":"No unsent or changed records found in this source window."}
        print(json.dumps(result,ensure_ascii=False)); return result
    batches=[]; current=[]
    for item in candidates:
        probe=current+[item]
        body=json.dumps({"stationCode":profile["stationCode"],"machineId":profile["machineId"],"batchId":"preview-check","records":probe},ensure_ascii=False,separators=(",",":")).encode("utf-8")
        if len(probe)>100 or len(body)>180_000:
            if not current: raise RuntimeError("A single record exceeds the safe 180 KB batch limit.")
            batches.append(current); current=[item]
        else: current=probe
    if current: batches.append(current)
    sent=inserted=updated=0; batch_ids=[]
    for records in batches:
        material="|".join(x["sourceRecordId"]+":"+x["sourceHash"] for x in records)
        batch=hashlib.sha256((profile["stationCode"]+"|"+profile["machineId"]+"|"+material).encode()).hexdigest()
        payload={"stationCode":profile["stationCode"],"machineId":profile["machineId"],"batchId":batch,"records":records}
        body=json.dumps(payload,ensure_ascii=False,separators=(",",":")).encode("utf-8")
        request=Request(profile["endpoint"],data=body,headers={"Authorization":"Bearer "+profile["connectorToken"],"Content-Type":"application/json"},method="POST")
        with urlopen(request,timeout=int(profile["requestTimeoutSeconds"])) as response:
            result=json.loads(response.read().decode())
            if response.status!=200 or not result.get("success") or result.get("received")!=len(records):
                raise RuntimeError("Preview did not acknowledge the complete batch; stop and inspect the response.")
        sent+=result["received"]; inserted+=result.get("inserted",0); updated+=result.get("updated",0); batch_ids.append(batch)
    result={"read":len(rows),"windowStart":start+1,"windowEnd":start+len(window),"scanned":len(window),
        "pending":len(candidates),"sent":sent,"inserted":inserted,"updated":updated,
        "alreadyMatched":len(items)-len(candidates)-len(conflicts),"duplicateSourceRows":duplicates,
        "conflictingSourceIds":len(conflicts),"queueWritten":False,"batchIds":batch_ids,"sourceSha256":digest}
    print(json.dumps(result,ensure_ascii=False)); return result

def send_preview_first_100():
    return send_preview_window(0,100)

def send_preview_next_100():
    return send_preview_window(100,200)

def run_once():
    setup_logging(); source=load_config(); profile=load_profile()
    rows,digest=read_rows(source,profile); db=open_queue()
    try:
        added=enqueue(db,profile,rows); sent=send_pending(db,profile)
        result={"read":len(rows),"queued":added,"sent":sent}
        logging.info("Sync completed %s source_sha256=%s",result,digest); return result
    finally: db.close()

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--send-preview-first-100",action="store_true",help="Send source rows 1-100; records are skipped only when hash matches and raw source data exists.")
    parser.add_argument("--send-preview-next-100",action="store_true",help="Send source rows 101-200; records are skipped only when hash matches and raw source data exists.")
    args=parser.parse_args()
    try:
        if args.send_preview_first_100: send_preview_first_100()
        elif args.send_preview_next_100: send_preview_next_100()
        else: print(json.dumps(run_once(),ensure_ascii=False))
    except Exception:
        setup_logging(); logging.exception("Sync cycle failed"); raise
