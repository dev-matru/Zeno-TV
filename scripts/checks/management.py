"""Unit checks for scripts/tv/manage_app.py: which apps it may close or uninstall.

python3 scripts/checks/management.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tv'))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
import identity  # noqa: E402
from manage_app import consumer, uninstall_id  # noqa: E402


def registry(app_id, tizen_id):
    return '--------------app_id =%s-------------\n--------------app_tizen_id =%s-------------\n' % (
        app_id,
        tizen_id,
    )


class AppManagement(unittest.TestCase):
    def test_system_apps_and_zeno_are_protected(self):
        protected = [
            identity.load().app_id,
            'org.tizen.menu',
            'com.samsung.tv.csfs',
            'org.tizen.tv-viewer',
            'ZenoQa0001.Service',
            'ZenoQa0001.Demo;id',
            'xvvl3S1TT1.StandaloneService',
            None,
            {},
        ]
        for app in protected:
            self.assertFalse(consumer(app), app)

    def test_regular_apps_are_allowed(self):
        for app in ['ZenoQa0001.Demo', 'xvvl3S1TT1.TizenTubeStandalone', 'org.tizen.netflix-app']:
            self.assertTrue(consumer(app), app)

    def test_package_id_comes_from_the_registry(self):
        listing = registry('3201907018807', 'org.tizen.netflix-app')
        self.assertEqual(uninstall_id('org.tizen.netflix-app', listing), '3201907018807')
        with self.assertRaises(ValueError):
            uninstall_id('org.tizen.primevideo', listing)

    def test_malformed_package_is_rejected(self):
        with self.assertRaises(ValueError):
            uninstall_id('ZenoQa0001.Demo', registry('test;id', 'ZenoQa0001.Demo'))


if __name__ == '__main__':
    unittest.main()
