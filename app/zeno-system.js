/* Public Tizen app information and owner-scoped launcher cache controls. */
(function(){'use strict';
 function bytes(n){if(typeof n!=='number'||!isFinite(n)||n<0)return 'Non disponibile';if(n>=1073741824)return (n/1073741824).toFixed(1)+' GB';if(n>=1048576)return (n/1048576).toFixed(1)+' MB';return Math.round(n/1024)+' KB';}
 function stats(done){var result={memory:{},storage:[],cache:null,device:{}},pending=1,ended=false,timer=setTimeout(finish,5000);
  function finish(){if(ended)return;ended=true;clearTimeout(timer);done(null,result);}
  function complete(){pending--;if(!pending)finish();}
  function property(name,read){pending++;try{tizen.systeminfo.getPropertyValue(name,function(v){if(!ended)read(v);complete();},complete);}catch(ignore){complete();}}
  if(window.tizen&&tizen.systeminfo){try{result.memory.total=tizen.systeminfo.getTotalMemory();result.memory.available=tizen.systeminfo.getAvailableMemory();result.device.platform=tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version');}catch(ignore){}
   property('STORAGE',function(v){result.storage=v.units||[];});
   property('BUILD',function(v){result.device.model=v.model;result.device.build=v.buildVersion;});
   property('DISPLAY',function(v){if(v.resolutionWidth&&v.resolutionHeight)result.device.display=v.resolutionWidth+' × '+v.resolutionHeight;});
   property('NETWORK',function(v){result.device.network=v.networkType;});
   try{if(window.webapis&&webapis.productinfo){result.device.model=webapis.productinfo.getModel();result.device.firmware=webapis.productinfo.getFirmware();if(webapis.productinfo.isUdPanelSupported())result.device.panel='4K UHD';}}catch(ignore){}
   pending++;CasaControl.rpc({op:'cache-info'},function(e,value){if(!e)result.cache=value;complete();});
  }
  complete();
 }
 function details(id,done){var result={id:id,running:null,contexts:[],package:null,memory:null,canStop:false,canUninstall:false};
  if(!window.tizen||!tizen.application){done({message:'Disponibile sul TV.'},result);return;}
  try{var a=tizen.application.getAppInfo(id);result.name=a.name;result.version=a.version;result.packageId=a.packageId;if(tizen.package&&a.packageId){var p=tizen.package.getPackageInfo(a.packageId);result.package={id:p.id,totalSize:p.totalSize,dataSize:p.dataSize,version:p.version};}}catch(e){result.infoError=e.name;}
  try{tizen.application.getAppsContext(function(list){result.contexts=list.filter(function(c){return c.appId===id||id==='xvvl3S1TT1.TizenTubeStandalone'&&c.appId==='com.samsung.tv.cobalt-yt'||result.packageId&&c.appId.indexOf(result.packageId+'.')===0;}).map(function(c){return {id:c.id,appId:c.appId};});result.running=result.contexts.some(function(c){return c.appId===id||id==='xvvl3S1TT1.TizenTubeStandalone'&&c.appId==='com.samsung.tv.cobalt-yt';});result.serviceRunning=result.contexts.some(function(c){return c.appId!==id&&c.appId!=='com.samsung.tv.cobalt-yt';});if(!result.running)result.memory=0;
    var context=result.contexts.filter(function(c){return c.appId===id||id==='xvvl3S1TT1.TizenTubeStandalone'&&c.appId==='com.samsung.tv.cobalt-yt';})[0];
    if(context&&/^\d+$/.test(context.id)){CasaControl.rpc({op:'app-memory',appId:context.appId,pid:+context.id},function(e,v){if(!e&&v)result.memory=v.bytes;done(null,result);});}else done(null,result);
   },function(){done(null,result);});}catch(e){done(null,result);}
 }
 function clearCache(keep,done){CasaControl.rpc({op:'cache-clear',keep:keep},done);}
 function nativeManager(done){ZenoDevice.launchApp('com.samsung.tv.store',done);}
 window.ZenoSystem={bytes:bytes,stats:stats,details:details,clearCache:clearCache,nativeManager:nativeManager};
}());
