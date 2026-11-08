/* Persistent PC preferences, trusted local service and upstream release checks. */
(function(){
 'use strict';
 var KEY='casa.control.v1',defaults=window.CasaDeviceDefaults||{},cfg={mac:defaults.pcMac||'',pcIp:defaults.pcIp||'',broadcast:'255.255.255.255',port:9,hdmi:2,macHost:defaults.macHost||'',autoUpdate:true};
 var pending={},localPort=null,watch=null,counter=0,dev={ip:null,enabled:null},release=null,updateError='',checking=false;
 function ip(value){return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)&&value.split('.').every(function(n){return +n<=255;});}
 function valid(key,value){if(['macHost','pcIp','broadcast'].indexOf(key)>=0)return ip(value);if(key==='mac')return /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(value);if(key==='port')return /^\d+$/.test(String(value))&&+value>0&&+value<65536;if(key==='hdmi')return [1,2,3,4].indexOf(+value)>=0;if(key==='pcAction')return ['menu','source','both'].indexOf(value)>=0;if(key==='autoUpdate')return typeof value==='boolean';return false;}
 try{var stored=JSON.parse(localStorage.getItem(KEY)||'null');if(stored)Object.keys(cfg).forEach(function(k){if(valid(k,stored[k]))cfg[k]=stored[k];});}catch(ignore){}
 function changed(){document.dispatchEvent(new Event('casa-control-change'));}
 function set(key,value){if(!valid(key,value))return false;var next={};Object.keys(cfg).forEach(function(k){next[k]=cfg[k];});next[key]=key==='hdmi'||key==='port'?+value:key==='mac'?value.toUpperCase():value;try{localStorage.setItem(KEY,JSON.stringify(next));}catch(e){return false;}cfg=next;changed();return true;}
 function rpc(data,done){
  if(!window.tizen||!tizen.application){done({message:'Disponibile sul TV.'});return;}
  if(!defaults.localToken){done({message:'Servizio locale non configurato.'});return;}
  var id='casa-'+(++counter)+'-'+Date.now(),ended=false;
  function finish(error,value){if(ended)return;ended=true;done(error,value);}
  function call(method,path,body,cb){var xhr=new XMLHttpRequest();xhr.open(method,'http://127.0.0.1:4796/'+path,true);xhr.timeout=path==='ready'?400:data.op==='developer'?25000:data.op==='wallpaper'?70000:8000;xhr.setRequestHeader('Authorization','Bearer '+defaults.localToken);if(body)xhr.setRequestHeader('Content-Type','application/json');xhr.onload=function(){try{var r=JSON.parse(xhr.responseText);if(xhr.status!==200)throw Error(r.error||'Servizio locale non disponibile.');cb(null,r);}catch(e){cb(e);}};xhr.onerror=xhr.ontimeout=function(){cb(Error('Il servizio locale del TV non risponde.'));};xhr.send(body?JSON.stringify(body):null);}
  function ready(attempt){call('GET','ready',null,function(error){if(error){if(attempt<30)setTimeout(function(){ready(attempt+1);},100);else finish({message:error.message});return;}data.id=id;call('POST','command',data,function(error,r){finish(error?{message:error.message}:r.error?{message:r.error}:null,r&&r.value);});});}
  tizen.application.launch('CsTv9rK2mQ.NetworkService',function(){ready(0);},function(error){finish({message:error.message||'Il TV non avvia il servizio locale.'});});
 }
 function status(done){rpc({op:'status'},function(e,v){if(!e&&v)dev=v;else if(e)dev={ip:null,enabled:null,error:e.message};changed();if(done)done(e,v);});}
 function devSet(value,done){rpc({op:'developer',enabled:value.enabled,ip:value.ip},function(e,v){if(!e&&v)dev=v;changed();done(e,v);});}
 function wol(done){if(!valid('mac',cfg.mac)){done({message:'Configura il MAC del PC in Personalizza → PC.'});return;}rpc({op:'wol',mac:cfg.mac,broadcast:cfg.broadcast,port:cfg.port},done);}
 function request(url,method,body,done){var xhr=new XMLHttpRequest();xhr.open(method,url,true);xhr.timeout=url.indexOf('/apps/action')>=0?85000:url.indexOf('/apps/capabilities')>=0?2500:12000;if(method==='POST'){xhr.setRequestHeader('Content-Type','application/json');xhr.setRequestHeader('Authorization','Bearer '+(defaults.bridgeToken||''));}xhr.onload=function(){try{var data=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>299)throw Error(data.error||'HTTP '+xhr.status);done(null,data);}catch(e){done(e);}};xhr.onerror=xhr.ontimeout=function(){done(Error('Connessione non disponibile.'));};xhr.send(body?JSON.stringify(body):null);}
 function checkUpdates(done){if(checking){if(done)done();return;}checking=true;updateError='';changed();request('https://api.github.com/repos/reisxd/TizenTube/releases/latest','GET',null,function(e,data){checking=false;if(e){updateError='Impossibile controllare gli aggiornamenti.';}else{var asset=(data.assets||[]).filter(function(a){return a.name==='TizenTubeCobalt.wgt';})[0];if(!data.draft&&!data.prerelease&&asset)release={tag:data.tag_name,url:data.html_url,asset:asset.browser_download_url};else updateError='Nessun pacchetto compatibile nella release.';try{localStorage.setItem('casa.update-check',String(Date.now()));}catch(ignore){}}changed();if(done)done(e,release);});}
 var installing=false,installMessage='';
 function install(done){
  if(installing){done({message:'Aggiornamento già in corso.'});return;}
  if(!cfg.macHost||!defaults.bridgeToken){done({message:'Il servizio aggiornamenti sul Mac non è configurato.'});return;}
  var start=Date.now(),base='http://'+cfg.macHost+':4797/tizentube/';installing=true;installMessage='Collegamento al Mac…';changed();
  function finish(e,value){installing=false;installMessage=e?e.message:value.message;changed();done(e?{message:e.message}:null,value);}
  function response(e,value){
   if(e){finish(Error('Accendi questo Mac e avvia il servizio aggiornamenti.'));return;}
   installMessage=value.message;changed();
   if(value.state==='error'){finish(Error(value.message));return;}
   if(value.state==='done'){finish(null,value);return;}
   if(Date.now()-start>180000){finish(Error('Operazione ancora in corso: controlla il servizio sul Mac.'));return;}
   setTimeout(function(){request(base+'status','POST',{},response);},1500);
  }
  request(base+'update','POST',{},response);
 }

 function prepareWallpaper(wall,height,done){rpc({op:'wallpaper',wall:wall,height:1080},done);}
 function wallpaperURL(wall,height,suffix){var w=(window.ZenoWallpapers||[]).filter(function(w){return w.id===wall;})[0];var ext=suffix==='photo'&&w&&w.format==='png'?'png':'jpg';return 'http://127.0.0.1:4796/wallpaper/'+wall+'/1080/'+suffix+'.'+ext+'?v=2&token='+encodeURIComponent(defaults.localToken||'');}
 function appBridge(appId,done){if(!cfg.macHost||!defaults.bridgeToken){done(null,{available:false});return;}request('http://'+cfg.macHost+':4797/apps/capabilities','POST',{appId:appId},function(e,v){done(null,e?{available:false}:v);});}
 function appAction(op,appId,requestId,done){request('http://'+cfg.macHost+':4797/apps/action','POST',{op:op,appId:appId,requestId:requestId},function(e,v){done(e||v&&v.error?{message:e?e.message:v.error}:null,v);});}
 window.CasaControl={appBridge:appBridge,appAction:appAction,prepareWallpaper:prepareWallpaper,wallpaperURL:wallpaperURL,config:function(){return cfg;},set:set,valid:valid,rpc:rpc,status:status,developer:function(){return dev;},setDeveloper:devSet,wol:wol,checkUpdates:checkUpdates,installUpdate:install,update:function(){return {release:release,error:updateError,checking:checking,installing:installing,installMessage:installMessage};}};
 if(!window.CASA_OFFLINE_TEST)setTimeout(function(){var at=0;try{at=+localStorage.getItem('casa.update-check')||0;}catch(ignore){}if(cfg.autoUpdate&&Date.now()-at>86400000)checkUpdates();},5000);
}());
