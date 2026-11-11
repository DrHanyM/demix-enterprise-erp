import unittest
from datetime import datetime, timezone
from connector import epoch_ms, map_row

class MappingTests(unittest.TestCase):
    def test_epoch_ms(self):
        self.assertEqual(epoch_ms(datetime(2026, 1, 1, tzinfo=timezone.utc)), 1767218400000)

    def test_maps_source_columns_and_hash_is_stable(self):
        row = (17, datetime(2026, 1, 1, tzinfo=timezone.utc), 12.5, "J-1", "C30", "Operator", "Customer", "Project")
        first = map_row(row)
        second = map_row(row)
        self.assertEqual(first, second)
        self.assertEqual(first["sourceRecordId"], "17")
        self.assertEqual(first["quantity"], 12.5)
        self.assertEqual(len(first["sourceHash"]), 64)

    def test_optional_values_are_omitted(self):
        row = (18, datetime(2026, 1, 1, tzinfo=timezone.utc), None, None, None, None, None, None)
        mapped = map_row(row)
        self.assertNotIn("quantity", mapped)
        self.assertNotIn("customerName", mapped)

if __name__ == "__main__":
    unittest.main()
