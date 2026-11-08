"""Owner-authorized consumer-app actions. Never manages system apps or the launcher."""
from pathlib import Path
import hashlib,json,re,subprocess,sys,urllib.request
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"lib"))
from sdb_transport import shell,Sdb
ROOT=Path(__file__).resolve().parents[2]
NATIVE={'org.tizen.netflix-app','org.tizen.primevideo','com.samsung.tv.aria-video'}
def consumer(app,stop_alias=False):
 if not isinstance(app,str):return False
 if stop_alias and app=='com.samsung.tv.cobalt-yt':return True
 return (app in NATIVE or bool(re.fullmatch(r'[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+',app))) and not app.startswith('CsTv9rK2mQ.') and not re.search(r'service|worker|installer|launcher|factory|daemon|preview',app,re.I)
def uninstall_id(app,text):
 records=[];record={}
 for line in text.splitlines():
  match=re.match(r'^-+(app_id|app_tizen_id|app_package_name|type)\s*=(.*?)-{5,}\s*$',line)
  if not match:continue
  key,value=match.group(1),match.group(2).strip()
  if key=='app_id':
   if record:records.append(record)
   record={}
  record[key]=value
 if record:records.append(record)
 matches=[r for r in records if r.get('app_tizen_id')==app]
 if len(matches)!=1:raise ValueError('Impossibile verificare il pacchetto dell’app.')
 value=matches[0].get('app_id','')
 if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}',value) or value=='CsTv9rK2mQ':raise ValueError('Pacchetto non consentito.')
 return value
def guard():
 host=json.loads((ROOT/'.local/device.json').read_text())['host']
 with urllib.request.urlopen('http://'+host+':8001/api/v2/',timeout=5) as response:info=json.load(response)
 fingerprint=(ROOT/'.local/native-home/device-identity.sha256').read_text().strip()
 if info['device'].get('modelName')!='QE65S90DATXZT' or hashlib.sha256(info['device']['id'].encode()).hexdigest()!=fingerprint:raise ValueError('Identità del TV non corrispondente.')
 return host
def run(op,app):
 if op not in ['stop','uninstall'] or not consumer(app):raise ValueError('Operazione non consentita per questa applicazione.')
 host=guard();before=shell(host,'0 applist')
 if not re.search(r"'"+re.escape(app)+r"'",before):raise ValueError('Applicazione non presente nel registro del TV.')
 if op=='uninstall':
  package=uninstall_id(app,shell(host,'0 vd_applist'))
  with Sdb(host,'shell:0 vd_appuninstall '+package,timeout=60) as channel:result=channel.collect(timeout=70).decode(errors='replace')
  after=shell(host,'0 applist')
  if 'Application List for user 5001' not in after:raise ValueError('Impossibile verificare il registro dopo l’operazione.')
  if re.search(r"'"+re.escape(app)+r"'",after):raise ValueError('L’app risulta ancora installata.')
  return {'uninstalled':True,'message':'Applicazione disinstallata.'}
 stop_targets=[app]+(['com.samsung.tv.cobalt-yt'] if app=='xvvl3S1TT1.TizenTubeStandalone' else [])
 for target in stop_targets:
  result=subprocess.run([sys.executable,str(ROOT/'scripts/tv/native-home/run.py'),'appstop',target],capture_output=True,text=True,timeout=35)
  if result.returncode or 'ZENO_APP_STOPPED' not in result.stdout:raise ValueError('Il TV non ha confermato la chiusura dell’app.')
 return {'stopped':True,'message':'Applicazione chiusa.'}
if __name__=='__main__':
 try:print(json.dumps(run(sys.argv[1],sys.argv[2])))
 except Exception as error:print(json.dumps({'error':str(error)}));sys.exit(1)
