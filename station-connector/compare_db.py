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

def composite_key(row, columns):
    fields = [
        columns.get("time", "sctime"),
        columns.get("customer", "CUST_NM"),
        columns.get("project", "PROJ_NM"),
        columns.get("quantity", "output_vol"),
    ]
    values = tuple(normalized(get_casefold(row, field)) for field in fields)
    return None if any(value is None for value in values) else values

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
        columns=profile.get("columns",{})
        id_column=columns.get("id","id")
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
        # Match by source ID first, then by the agreed composite production identity.
        local_to_remote={key:key for key in set(local).intersection(remote)}
        remote_used=set(local_to_remote.values())
        local_composites={}; remote_composites={}
        for key,row in local.items():
            if key in local_to_remote or key in duplicate_ids: continue
            composite=composite_key(row,columns)
            if composite is not None: local_composites.setdefault(composite,[]).append(key)
        for key,row in remote.items():
            if key in remote_used or key in remote_duplicates: continue
            composite=composite_key(row,columns)
            if composite is not None: remote_composites.setdefault(composite,[]).append(key)
        matched_by_composite=0
        for composite,local_ids in local_composites.items():
            remote_ids=remote_composites.get(composite,[])
            if len(local_ids)==1 and len(remote_ids)==1:
                local_to_remote[local_ids[0]]=remote_ids[0]
                remote_used.add(remote_ids[0])
                matched_by_composite+=1

        matched=file_only=demix_only=different=0
        details=[]
        processed_remote=set()
        ordered_local=sorted(local,key=lambda x:(not x.isdigit(),int(x) if x.isdigit() else x.casefold()))
        for local_id in ordered_local:
            l=local[local_id]
            remote_id=local_to_remote.get(local_id)
            r=remote.get(remote_id) if remote_id is not None else None
            duplicate=local_id in duplicate_ids or (remote_id is not None and remote_id in remote_duplicates)
            match_method="ID" if remote_id==local_id else ("time+customer+project+output_vol" if remote_id is not None else "")
            if remote_id is not None: processed_remote.add(remote_id)
            if duplicate:
                status="duplicate"; changed="duplicate source ID"
            elif r is None:
                status="file_only"; changed="record exists in DB.MDB only"; file_only+=1
            else:
                keys=sorted({str(k) for k in l}|{str(k) for k in r},key=str.casefold)
                value_diffs=[]
                for field in keys:
                    if remote_id != local_id and field.casefold()==str(id_column).casefold():
                        continue
                    lv=get_casefold(l,field); rv=get_casefold(r,field)
                    if normalized(lv)!=normalized(rv): value_diffs.append(field)
                if remote_id != local_id:
                    changed_parts=["ID differs; matched by time/customer/project/output volume"]+value_diffs
                    if value_diffs:
                        status="different_by_composite"; different+=1
                    else:
                        status="matched_by_composite"
                elif value_diffs:
                    status="different"; changed_parts=value_diffs; different+=1
                else:
                    status="matched"; changed_parts=[]; matched+=1
                changed="; ".join(changed_parts)
            details.append({
                "ID":local_id if remote_id in (None,local_id) else local_id+" <-> "+remote_id,
                "DB_ID":local_id,"DeMix_ID":remote_id or "",
                "match_method":match_method,"status":status,"different_fields":changed,
                "DB_MDB":json.dumps({k:clean_value(v) for k,v in l.items()},ensure_ascii=False,default=str) if status!="matched" else "",
                "DeMix":json.dumps(r or {},ensure_ascii=False,default=str) if r is not None and status!="matched" else ""
            })

        ordered_remote=sorted(remote,key=lambda x:(not x.isdigit(),int(x) if x.isdigit() else x.casefold()))
        for remote_id in ordered_remote:
            if remote_id in processed_remote: continue
            r=remote[remote_id]
            if remote_id in remote_duplicates:
                status="duplicate"; changed="duplicate source ID"
            else:
                status="demix_only"; changed="record exists in DeMix export only"; demix_only+=1
            details.append({
                "ID":remote_id,"DB_ID":"","DeMix_ID":remote_id,"match_method":"",
                "status":status,"different_fields":changed,"DB_MDB":"",
                "DeMix":json.dumps(r,ensure_ascii=False,default=str)
            })
        out=Path(export_path).with_name("DeMix_DB_Comparison_"+datetime.now().strftime("%Y%m%d_%H%M%S")+".csv")
        with out.open("w",encoding="utf-8-sig",newline="") as f:
            writer=csv.DictWriter(f,fieldnames=["ID","DB_ID","DeMix_ID","match_method","status","different_fields","DB_MDB","DeMix"])
            writer.writeheader(); writer.writerows(details)
        summary={"station":station,"sourceFile":Path(db_path).name,"table":profile.get("table","sRecords"),
            "sourceRecords":len(local_rows),"demixRecords":len(remote_rows),"matched":matched,
            "matchedByComposite":matched_by_composite,"fileOnly":file_only,
            "demixOnly":demix_only,"different":different,"sourceDuplicates":duplicate_count,
            "demixDuplicates":remote_duplicate_count,"sourceSha256":digest,"report":str(out),
            "databaseUploaded":False,"databaseModified":False}
        summary_path=out.with_suffix(".json")
        summary_path.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
        messagebox.showinfo("نتيجة المقارنة", "\n".join([
            "المحطة: "+station,"سجلات DB.MDB: "+str(len(local_rows)),"سجلات DeMix: "+str(len(remote_rows)),
            "متطابق برقم المصدر: "+str(matched),"مطابق مركبًا (التاريخ/العميل/المشروع/الكمية): "+str(matched_by_composite),
            "في DB فقط: "+str(file_only),"في DeMix فقط: "+str(demix_only),
            "اختلافات: "+str(different),"تكرارات DB: "+str(duplicate_count),"تكرارات DeMix: "+str(remote_duplicate_count),
            "تم حفظ التقرير محليًا: "+str(out)]))
    except Exception as exc:
        messagebox.showerror("تعذرت المقارنة",str(exc))
        raise
    finally:
        root.destroy()

if __name__=="__main__":
    main()
