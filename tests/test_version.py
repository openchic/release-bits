import unittest

from changelog import version
from changelog.errors import ShipkitError


class VersionTests(unittest.TestCase):
    def test_direct_use(self):
        self.assertEqual(version.effective("1.2.3"), "1.2.3")

    def test_bumps(self):
        self.assertEqual(version.effective("1.2.3", "major"), "2.0.0")
        self.assertEqual(version.effective("1.2.3", "minor"), "1.3.0")
        self.assertEqual(version.effective("1.2.3", "patch"), "1.2.4")

    def test_invalid_versions(self):
        for value in ("1.2", "v1.2.3", "1.02.3", "1.2.3-beta", "", "1.2.3.4"):
            with self.subTest(value=value):
                with self.assertRaises(ShipkitError):
                    version.effective(value)

    def test_invalid_type(self):
        with self.assertRaises(ShipkitError):
            version.effective("1.2.3", "release")

    def test_newer(self):
        self.assertTrue(version.is_newer("1.3.0", "1.2.9"))
        self.assertFalse(version.is_newer("1.2.0", "1.2.0"))
        self.assertFalse(version.is_newer("1.1.9", "1.2.0"))
