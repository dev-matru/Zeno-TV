import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tv"))
from manage_app import consumer,uninstall_id
class AppManagement(unittest.TestCase):
 def test_system_targets_are_protected(self):
  for app in ['CsTv9rK2mQ.CasaTV','org.tizen.menu','com.samsung.tv.csfs','org.tizen.tv-viewer','ZenoQa0001.Service','ZenoQa0001.Demo;id','xvvl3S1TT1.StandaloneService',None,{}]:self.assertFalse(consumer(app))
 def test_consumer_targets(self):
  for app in ['ZenoQa0001.Demo','xvvl3S1TT1.TizenTubeStandalone','org.tizen.netflix-app']:self.assertTrue(consumer(app))
 def test_store_id_comes_from_verified_registry(self):
  text='--------------app_id =3201907018807-------------\n--------------app_tizen_id =org.tizen.netflix-app-------------\n--------------app_package_name =org.tizen.netflix-app-------------'
  self.assertEqual(uninstall_id('org.tizen.netflix-app',text),'3201907018807')
  with self.assertRaises(ValueError):uninstall_id('org.tizen.primevideo',text)
 def test_malformed_package_is_rejected(self):
  with self.assertRaises(ValueError):uninstall_id('ZenoQa0001.Demo','--------------app_id =test;id-------------\n--------------app_tizen_id =ZenoQa0001.Demo-------------')
if __name__=='__main__':unittest.main()
