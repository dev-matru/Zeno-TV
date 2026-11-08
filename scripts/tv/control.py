"""Install or launch reviewed app packages through the owner's SDB connection."""
from pathlib import Path
import argparse,hashlib,json,sys,subprocess,urllib.request,xml.etree.ElementTree as ET,zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"lib"))
from sdb_transport import push,shell,Sdb
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('action',choices=['info','install','launch','apps','debug'])
parser.add_argument('target',nargs='?')
a=parser.parse_args();host=json.loads((ROOT/'.local/device.json').read_text())['host']
with urllib.request.urlopen('http://'+host+':8001/api/v2/',timeout=5) as response: info=json.load(response)
if a.action=='info':
 d=info.get('device',{})
 for k in ['name','modelName','OS','firmwareVersion','ip','wifiMac','developerMode','developerIP']:print('%-16s %s'%(k,d.get(k,'')))
 sys.exit(0)
if info.get('device',{}).get('modelName')!='QE65S90DATXZT':raise SystemExit('TV model guard failed')
fingerprint=ROOT/'.local/native-home/device-identity.sha256'
if not fingerprint.exists() or hashlib.sha256(info['device']['id'].encode()).hexdigest()!=fingerprint.read_text().strip():raise SystemExit('TV identity guard failed')
allowed=['CsTv9rK2mQ.CasaTV','xvvl3S1TT1.TizenTubeStandalone']
if a.action=='apps':print(shell(host,'0 applist'));sys.exit(0)
if a.action in ['launch','debug']:
 if a.target not in allowed:raise SystemExit('App not in the reviewed allowlist')
 if a.target=='CsTv9rK2mQ.CasaTV':
  result=subprocess.run([sys.executable,str(ROOT/'scripts/tv/native-home/run.py'),a.action],capture_output=True,text=True)
  print(result.stdout)
  if result.returncode or 'successfully launched' not in result.stdout:raise SystemExit('Native launcher did not confirm app launch')
 else:print(shell(host,'0 '+('debug ' if a.action=='debug' else 'was_execute ')+a.target))
 sys.exit(0)
p=Path(a.target).resolve();data=p.read_bytes()
with zipfile.ZipFile(p) as z:
 if not {'author-signature.xml','signature1.xml'}.issubset(z.namelist()):raise SystemExit('Unsigned package refused')
 manifest=ET.fromstring(z.read('config.xml'));identity=manifest.find('{http://tizen.org/ns/widgets}application');appid=identity.get('id');pkg=identity.get('package')
 if appid not in allowed or not appid.startswith(pkg+'.'):raise SystemExit('Unreviewed package identity')
remote='/home/owner/share/tmp/sdk_tools/CasaInstall-'+hashlib.sha256(data).hexdigest()[:12]+'.wgt'
print('Uploading signed '+appid+' ('+str(len(data))+' bytes)',flush=True)
push(host,remote,data)
print('Upload verified; requesting installation',flush=True)
with Sdb(host,'shell:0 vd_appinstall '+pkg+' '+remote,timeout=120) as channel:
 result=channel.collect(timeout=150).decode(errors='replace')
print(result)
if 'install completed' not in result.lower():raise SystemExit('TV did not confirm installation')
if appid not in shell(host,'0 applist'):raise SystemExit('Installed app absent from registry')
shell(host,'0 rmfile "'+remote+'"')
print('Installation and app registry verified: '+appid)
