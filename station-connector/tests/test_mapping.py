import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import connector

COLUMNS={"id":"id","time":"sctime","quantity":"output_vol","job":"job_no","grade":"strength","operator":"operator","customer":"CUST_NM","project":"PROJ_NM"}

class ConnectorTests(unittest.TestCase):
    def row(self):
        return {"id":"LOAD-ARW-2026-00017","sctime":datetime(2026,1,1,tzinfo=timezone.utc),"output_vol":12.5,"job_no":"J-1","strength":"C30","operator":"Operator","CUST_NM":"Customer","PROJ_NM":"Project"}

    def test_non_numeric_source_id_and_stable_hash(self):
        a=connector.map_row(self.row(),COLUMNS); b=connector.map_row(self.row(),COLUMNS)
        self.assertEqual(a,b); self.assertEqual(a["sourceRecordId"],"LOAD-ARW-2026-00017"); self.assertEqual(len(a["sourceHash"]),64)

    def test_changed_row_has_new_hash(self):
        row=self.row(); first=connector.map_row(row,COLUMNS); row["output_vol"]=13
        self.assertNotEqual(first["sourceHash"],connector.map_row(row,COLUMNS)["sourceHash"])

    def test_missing_source_id_is_rejected(self):
        row=self.row(); del row["id"]
        with self.assertRaises(ValueError): connector.map_row(row,COLUMNS)

    def test_queue_deduplicates_and_requeues_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(connector,"QUEUE_FILE",Path(folder)/"queue.db"):
                db=connector.open_queue(); profile={"stationCode":"ST-ARW","machineId":"PC-01","columns":COLUMNS}; row=self.row()
                self.assertEqual(connector.enqueue(db,profile,[row]),1); self.assertEqual(connector.enqueue(db,profile,[row]),0)
                row["output_vol"]=13; self.assertEqual(connector.enqueue(db,profile,[row]),1)
                self.assertEqual(db.execute("SELECT status FROM outbox").fetchone()[0],"pending"); db.close()

    def test_failed_send_stays_pending(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(connector,"QUEUE_FILE",Path(folder)/"queue.db"):
                db=connector.open_queue(); profile={"stationCode":"ST-ARW","machineId":"PC-01","columns":COLUMNS}
                connector.enqueue(db,profile,[self.row()])
                with patch.object(connector,"urlopen",side_effect=RuntimeError("offline")):
                    self.assertEqual(connector.send_pending(db,profile),0)
                self.assertEqual(db.execute("SELECT status FROM outbox").fetchone()[0],"pending"); db.close()

if __name__=="__main__": unittest.main()
