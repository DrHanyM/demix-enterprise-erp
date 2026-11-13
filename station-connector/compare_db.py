#!/usr/bin/env python3
"""Local-only, read-only comparison of an Access station file with a DeMix JSON export."""
from __future__ import annotations
import csv, json, math
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox
import connector

def clean_value(value):
    if value is None: return None
    if isinstance(value, (datetime, date)): return value.isoformat(sep=" ") if isinstance(value, datetime) else value.isoformat()
    if isinstance(value, float) and not math.isfinite(value): return str(value)
    if isinstance(value, bytes): return value.hex()
    return value

def normalized(value):
    value=clean_value(value)
    if value is None: return None
    if isinstance(value, bool): return ("bool", value)
    if isinstance(value, (int,float,Decimal)):
        try: return ("number", Decimal(str(value)).normalize())
        except InvalidOperation: pass
    text=" ".join(str(value).strip().split())
    if not text: return None
    try:
        n=Decimal(text.replace(",",""))
        return ("number",n.normalize())
    except InvalidOperation:
        pass
    # Access datetime values are serialized as ISO strings by the connector.
    try:
        dt=datetime.fromisoformat(text.replace("Z","+00:00"))
        return ("datetime",dt.isoformat())
    except ValueError:
        return ("text",text.casefold())

def get_casefold(mapping, key):
    k=next((x for x in mapping if str(x).casefold()==key.casefold()),None)
    return mapping.get(k) if k is not None else None

def main():
    root=tk.Tk(); root.withdraw()
    try:
        profile=connector.load_profile()
        db_path=filedialog.askopenfilename(title="اختر قاعدة المحطة DB.MDB",filetypes=[("Access database","*.mdb *.accdb"),("All files","*.*")])
        if not db_path: return
        export_path=filedialog.askopenfilename(title="اختر ملف مقارنة DeMix JSON الذي تم تنزيله من الوحدة",filetypes=[("DeMix JSON","*.json"),("All files","*.*")])
        if not export_path: return
        payload=json.loads(Path(export_path).read_text(encoding="utf-8-sig"))
        if not isinstance(payload,dict) or not isinstance(payload.get("records"),list):
            raise RuntimeError("ملف DeMix JSON غير صالح أو لا يحتوي على records.")
        station=profile["stationCode"]
        remote_rows=[x for x in payload["records"] if str(x.get("stationCode",""))==station]
        if not remote_rows:
            codes=sorted({str(x.get("stationCode","")) for x in payload["records"]})
            raise RuntimeError("لا توجد سجلات في ملف DeMix للمحطة الحالية "+station+". المحطات الموجودة: "+", ".join(codes))
        local_rows,digest=connector.read_rows(db_path,profile)
        id_column=profile.get("columns",{}).get("id","id")
        local={}
        duplicate_ids=set(); duplicate_count=0
        for row in local_rows:
            source_id=get_casefold(row,id_column)
            if source_id is None: continue
            key=str(source_id).strip()
            if key in local:
                duplicate_count+=1; duplicate_ids.add(key)
            else: local[key]=row
        remote={}
        remote_duplicates=set(); remote_duplicate_count=0
        for entry in remote_rows:
            raw=entry.get("rawSourceData") or {}
            source_id=entry.get("sourceRecordId") or get_casefold(raw,id_column)
            if source_id is None: continue
            key=str(source_id).strip()
            if key in remote:
                remote_duplicate_count+=1; remote_duplicates.add(key)
            else: remote[key]=raw
        matched=file_only=demix_only=different=0
        details=[]
        all_ids=sorted(set(local)|set(remote),key=lambda x:(not x.isdigit(),int(x) if x.isdigit() else x.casefold()))
        for key in all_ids:
            l=local.get(key); r=remote.get(key)
            if key in duplicate_ids or key in remote_duplicates:
                status="duplicate"; changed="duplicate source ID"
            elif l is None:
                status="demix_only"; changed="record exists in DeMix export only"; demix_only+=1
            elif r is None:
                status="file_only"; changed="record exists in DB.MDB only"; file_only+=1
            else:
                keys=sorted({str(k) for k in l}|{str(k) for k in r},key=str.casefold)
                diffs=[]
                for field in keys:
                    lv=get_casefold(l,field); rv=get_casefold(r,field)
                    if normalized(lv)!=normalized(rv): diffs.append(field)
                if diffs:
                    status="different"; changed="; ".join(diffs); different+=1
                else:
                    status="matched"; changed=""; matched+=1
            details.append({"ID":key,"status":status,"different_fields":changed,
                "DB_MDB":json.dumps({k:clean_value(v) for k,v in (l or {}).items()},ensure_ascii=False,default=str) if status in ("file_only","different","duplicate") else "",
                "DeMix":json.dumps(r or {},ensure_ascii=False,default=str) if status in ("demix_only","different","duplicate") else ""})
        out=Path(export_path).with_name("DeMix_DB_Comparison_"+datetime.now().strftime("%Y%m%d_%H%M%S")+".csv")
        with out.open("w",encoding="utf-8-sig",newline="") as f:
            writer=csv.DictWriter(f,fieldnames=["ID","status","different_fields","DB_MDB","DeMix"])
            writer.writeheader(); writer.writerows(details)
        summary={"station":station,"sourceFile":Path(db_path).name,"table":profile.get("table","sRecords"),
            "sourceRecords":len(local_rows),"demixRecords":len(remote_rows),"matched":matched,"fileOnly":file_only,
            "demixOnly":demix_only,"different":different,"sourceDuplicates":duplicate_count,
            "demixDuplicates":remote_duplicate_count,"sourceSha256":digest,"report":str(out),
            "databaseUploaded":False,"databaseModified":False}
        summary_path=out.with_suffix(".json")
        summary_path.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
        messagebox.showinfo("نتيجة المقارنة", "\n".join([
            "المحطة: "+station,"سجلات DB.MDB: "+str(len(local_rows)),"سجلات DeMix: "+str(len(remote_rows)),
            "متطابق: "+str(matched),"في DB فقط: "+str(file_only),"في DeMix فقط: "+str(demixOnly:=demix_only),
            "اختلافات: "+str(different),"تكرارات DB: "+str(duplicate_count),"تكرارات DeMix: "+str(remote_duplicate_count),
            "تم حفظ التقرير محليًا: "+str(out)]))
    except Exception as exc:
        messagebox.showerror("تعذرت المقارنة",str(exc))
        raise
    finally:
        root.destroy()

if __name__=="__main__":
    main()
