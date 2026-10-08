"""--tenant ⇒ mọi request tới API Vala mang X-Vala-Tenant; không có ⇒ không gửi (API hiểu là Bkav)."""
import os
import unittest

from vala_sdk import Vala


class TenantArg(unittest.TestCase):
    def setUp(self):
        os.environ['VALA_API_URL'] = 'http://api.example'
        os.environ['VALA_INTERNAL_TOKEN'] = 'noi-bo'

    def test_co_ma_don_vi(self):
        v = Vala(['--tenant', 'nuithanh', '--user', '3'])
        self.assertEqual(v.api.http.headers.get('X-Vala-Tenant'), 'nuithanh')

    def test_khong_co(self):
        v = Vala(['--user', '3'])
        self.assertIsNone(v.api.http.headers.get('X-Vala-Tenant'))


if __name__ == '__main__':
    unittest.main()
