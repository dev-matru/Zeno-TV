import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parse} from 'acorn';
import {openPreview,root} from '../lib/browser.mjs';
const passed=[];
function check(name,pass){assert.ok(pass,name);passed.push(name);console.log('PASS '+name);}
for(const name of ['main.js','device.js','zeno-extras.js','zeno-control.js']){parse(readFileSync(root+'app/'+name,'utf8'),{ecmaVersion:5});check(name+' uses ES5',true);}
const preview=await openPreview({publicOnly:true});let page;
try{
 page=await preview.browser.newPage({viewport:{width:1920,height:1080},timezoneId:'Europe/Rome'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://get.geojs.io/**',r=>r.fulfill({json:{city:'Roma',latitude:'41.9028',longitude:'12.4964'}}));
 await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{current:{temperature_2m:17.2,weather_code:0}}}));
 await page.route('http://127.0.0.1:4796/**',async route=>{if(route.request().method()==='OPTIONS'){await route.fulfill({status:204});return;}const request=route.request().postDataJSON();if(request)await page.evaluate(r=>__calls.push({method:'service',request:r}),request);await route.fulfill({json:request?{id:request.id,value:{opened:true,sent:true,ip:'192.0.2.11',enabled:true}}:{ready:true}});});
 await page.route('https://api.github.com/**',route=>route.fulfill({json:{tag_name:'v2.1.1',assets:[{name:'TizenTubeCobalt.wgt',browser_download_url:'https://github.com/reisxd/TizenTube/releases/download/v2.1.1/TizenTubeCobalt.wgt'}]}}));
 await page.addInitScript(()=>{
  window.__Source=function(type,number){this.type=type;this.number=number;};
  window.__calls=[];window.__standaloneMissing=false;window.__settingsFail=false;
  window.CasaDeviceDefaults={pcMac:'00:11:22:33:44:55',pcIp:'192.0.2.10',macHost:'192.0.2.11',localToken:'qa-local'};
  window.tizen={messageport:{requestTrustedLocalMessagePort(){return {addMessagePortListener(fn){window.__serviceListener=fn;return 1;}};},requestTrustedRemoteMessagePort(){return {sendMessage(items){const request=JSON.parse(items[0].value);__calls.push({method:'service',request});setTimeout(()=>__serviceListener([{key:'response',value:JSON.stringify({id:request.id,value:{opened:true,sent:true,ip:'192.0.2.11',enabled:true}})}],{isTrusted:true,appId:'CsTv9rK2mQ.NetworkService'}),0);}};}},ApplicationControlData:function(key,value){this.key=key;this.value=value;},ApplicationControl:function(operation,uri,mime,category,data){Object.assign(this,{operation,uri,mime,category,data});},application:{
   launch(id,ok,fail){__calls.push({method:'launch',id});setTimeout(()=>id==='xvvl3S1TT1.TizenTubeStandalone'&&__standaloneMissing||id==='com.samsung.tv.coba.setting'&&__settingsFail?fail({name:'NotFoundError'}):ok(),0);},
   launchAppControl(control,id,ok){__calls.push({method:'appcontrol',id,control});setTimeout(ok,0);},getAppsInfo(ok){ok([{id:'xvvl3S1TT1.TizenTubeStandalone',name:'TizenTube',show:true}]);}},
   systeminfo:{getPropertyValue(key,ok){ok({current:{type:'TV',number:1},connected:[new __Source('TV',1),new __Source('HDMI',1),new __Source('HDMI',2),new __Source('HDMI',3)],disconnected:[new __Source('HDMI',4)]});}},
   tvwindow:{setSource(source,ok){if(!(source instanceof __Source))throw Error('Expected native SystemInfoVideoSourceInfo');__calls.push({method:'setSource',source});ok(source);}}};
 });
 const state=()=>page.evaluate(()=>ZenoQA.state());
 const act=async action=>assert.notEqual(await page.evaluate(a=>ZenoQA.activate(a),action),null,action);
 const ready=()=>page.waitForFunction(()=>window.ZenoQA&&ZenoQA.ready());
 const home=async()=>{await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));ZenoQA.scene('home');});await ready();};
 await page.goto(preview.baseURL+'/home/');await ready();
 check('Italian installed-app defaults',JSON.stringify((await state()).home)===JSON.stringify(['tv','pc','youtube','netflix','primevideo','disneyplus','raiplay','infinity','now','dazn','appletv']));
 check('Italian glass interface',await page.locator('html').getAttribute('lang')==='it'&&(await state()).apps==='icons');
 await page.waitForFunction(()=>document.querySelector('.weather-widget-place')?.textContent==='Roma'&&document.querySelector('.weather-widget-temp')?.textContent==='17°');
 check('IP weather works with provider responses',true);
 check('Wordmark is removed',await page.locator('.casa-wordmark').count()===0);
 check('Weather icon reflects current conditions',await page.locator('.weather-icon.weather-sun').count()===1);
 for (const [code,kind] of [[0,'sun'],[2,'partly'],[3,'cloud'],[45,'fog'],[63,'rain'],[73,'snow'],[95,'storm']]) {
  await page.evaluate(code=>{localStorage.setItem('casa.weather.v1',JSON.stringify({mode:'auto',placeKey:'',name:'Roma',temperature:17,code,at:Date.now()}));},code);
  await page.reload();await ready();check('Weather symbol '+kind,await page.locator('.weather-icon.weather-'+kind).count()===1);
 }
 await page.evaluate(()=>{__calls=[];});await act('home.app.tv');await page.waitForFunction(()=>__calls.some(c=>c.method==='setSource'));
 check('Dock TV explicitly selects antenna',await page.evaluate(()=>__calls.some(c=>c.method==='setSource'&&c.source.type==='TV')&&__calls.at(-1).id==='org.tizen.tv-viewer'));
 await home();await page.evaluate(()=>{__calls=[];});
 await act('home.app.youtube');await page.waitForFunction(()=>__calls.length>0);
 check('YouTube directly launches TizenTube',(await page.evaluate(()=>__calls.at(-1))).id==='xvvl3S1TT1.TizenTubeStandalone');
 await home();await page.evaluate(()=>{__standaloneMissing=true;__calls=[];});await act('home.app.youtube');await page.waitForFunction(()=>__calls.some(c=>c.method==='appcontrol'));
 const control=await page.evaluate(()=>__calls.find(c=>c.method==='appcontrol'));
 check('TizenBrew fallback deep-links its YouTube module',control.id==='xvvl3S1bvH.TizenBrewStandalone'&&JSON.parse(control.control.data[0].value[0]).moduleName==='@foxreis/tizentube');
 await home();await act('util.sources');await page.waitForFunction(()=>document.querySelector('[data-action="source.HDMI-2"]'));
 check('Only HDMI sources are listed; antenna stays on Home',await page.locator('[data-action^="source."]').count()===4);
 await act('source.HDMI-2');await page.waitForFunction(()=>__calls.some(c=>c.method==='setSource'));
 check('HDMI selection uses the Samsung viewer',await page.evaluate(()=>__calls.some(c=>c.method==='setSource'&&c.source.type==='HDMI'&&c.source.number===2)&&__calls.at(-1).id==='org.tizen.tv-viewer'));
 await home();await page.evaluate(()=>{__settingsFail=true;__calls=[];});await act('util.settings');await act('settings.group.samsung');await act('samsung.settings');await page.waitForFunction(()=>__calls.some(c=>c.method==='launch'&&c.id==='org.tizen.menu'));
 check('Native settings open the verified Samsung menu app',true);
 await home();await act('util.settings');await act('settings.group.extras');await act('extras.weather');await act('extras.location');
 for(const width of [1920,1280]){
  await page.setViewportSize({width,height:width*9/16});
  await page.waitForFunction(()=>Math.abs(document.getElementById('stage').getBoundingClientRect().width-innerWidth)<1);
  const bounds=await page.locator('#appearance [data-action^="location."]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right};}));
  check('All weather choices fit '+width,bounds.length===2&&bounds.every(r=>r.top>=0&&r.bottom<=width*9/16&&r.right<=width));
 }
 await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>CasaExtras.set('location','milano'));await page.evaluate(()=>ZenoQA.nav('back'));await page.waitForFunction(()=>CasaExtras.config().location==='milano'&&CasaExtras.weatherText().startsWith('Milano'));
 check('Manual city replaces IP location',true);
 await page.evaluate(()=>ZenoQA.nav('back'));await act('extras.motion');check('Movement is opt-in',await page.locator('#scene').evaluate(el=>el.classList.contains('casa-motion')));
 await home();await page.evaluate(()=>ZenoQA.look({bg:'dark'}));await ready();
 check('Dark background is actual black',await page.locator('#scene').evaluate(el=>getComputedStyle(el).backgroundColor)==='rgb(0, 0, 0)');
 await page.reload();await ready();check('Preferences survive reload',(await state()).bg==='dark'&&await page.evaluate(()=>CasaExtras.config().location==='milano'&&CasaExtras.config().motion));
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await ready();check('Reduced motion is respected',await page.locator('#scene').evaluate(el=>getComputedStyle(el).animationName)==='none');
 await page.evaluate(()=>{var c=JSON.parse(localStorage.getItem('zeno.home.v1'));c.home=c.home.filter(id=>id!=='tv'&&id!=='pc');c.dock=c.home.slice();delete c.casaVersion;localStorage.setItem('zeno.home.v1',JSON.stringify(c));});
 await page.reload();await ready();check('Existing dock gains TV without losing app order',JSON.stringify((await state()).home)===JSON.stringify(['tv','pc','youtube','netflix','primevideo','disneyplus','raiplay','infinity','now','dazn','appletv']));
 await page.evaluate(()=>{var c=JSON.parse(localStorage.getItem('zeno.home.v1'));c.home=c.home.filter(id=>id!=='tv');c.dock=c.home.slice();localStorage.setItem('zeno.home.v1',JSON.stringify(c));});
 await page.reload();await ready();check('TV can later be removed without being re-added',!(await state()).home.includes('tv'));
 await home();await page.evaluate(()=>{ZenoQA.activate('home.app.pc');__calls=[];});
 // QA activation opens the source; focus stays on PC when returning.
 await home();await page.keyboard.press('Enter');await page.waitForFunction(()=>__calls.some(c=>c.method==='setSource'&&c.source.type==='HDMI'));
 check('Short OK on PC opens only its HDMI input',await page.evaluate(()=>!__calls.some(c=>c.method==='service'&&c.request.op==='wol')));
 await home();await page.evaluate(()=>{__calls=[];});await page.keyboard.down('Enter');await page.waitForTimeout(750);await page.keyboard.up('Enter');
 check('Long OK opens the PC menu without sending WoL',(await state()).view==='pc'&&await page.evaluate(()=>!__calls.some(c=>c.method==='service'&&c.request.op==='wol')));
 await page.keyboard.press('Enter');await page.waitForFunction(()=>__calls.some(c=>c.method==='service'&&c.request.op==='wol'));
 check('WoL is sent only after explicit menu selection',true);
 for(const width of [1920,1280]){
  await page.setViewportSize({width,height:width*9/16});
  for(const group of ['sources','sourceprofile','sourcenetwork','inputs','cards','language','connection','updates','extras','samsung','about','storage']){
   await home();await act('util.settings');
   if(group==='sources'){await home();await act('util.sources');await page.waitForFunction(()=>document.querySelector('[data-action="source.HDMI-4"]'));}
   else{if(group==='sourceprofile'||group==='sourcenetwork'){await act('settings.group.inputs');await act('input.configure.HDMI-2');if(group==='sourcenetwork')await act('input.network');}else if(group==='updates'){await act('settings.group.manager');await page.waitForFunction(()=>!ZenoQA.state().catalog.loading);await act('apps.open.youtube');await act('appdetail.youtube');}else await act('settings.group.'+(group==='pcnetwork'?'pc':group));if(group==='pcnetwork')await act('pc.network');}
   const actionCount=await page.locator('#appearanceRows [data-action]').count();
   await page.evaluate(count=>{for(var i=0;i<count+3;i++)ZenoQA.nav('down');},actionCount);
   const safe=await page.evaluate(()=>{var hint=document.getElementById('appearanceDesc').getBoundingClientRect(),rows=document.getElementById('appearanceRows').getBoundingClientRect(),active=document.querySelector('#appearanceRows .is-focus').getBoundingClientRect();return rows.bottom+8<=hint.top&&active.top>=rows.top-1&&active.bottom<=rows.bottom+1;});
   check('Menu '+group+' has reserved OK space at '+width,safe);
  }
 }
 check('No browser errors',errors.length===0);
 mkdirSync(root+'.local/qa/casa',{recursive:true});writeFileSync(root+'.local/qa/casa/checks.json',JSON.stringify({checks:passed,errors},null,2)+'\n');console.log(passed.length+' Casa TV checks passed');
}finally{if(page)await page.close();await preview.close();}
