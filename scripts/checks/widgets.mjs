import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {openPreview,root} from '../lib/browser.mjs';
for(const file of ['main.js','zeno-extras.js','zeno-remote.js'])parse(readFileSync(root+'app/'+file,'utf8'),{ecmaVersion:5});
const preview=await openPreview({publicOnly:process.env.ZENO_PERSONAL!=='1'}),passed=[];
function check(name,value){assert.ok(value,name);passed.push(name);console.log('PASS '+name);}
try{
 const page=await preview.browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.CASA_OFFLINE_TEST=true;window.__registered=[];window.tizen={tvinputdevice:{getSupportedKeys(){return [{name:'Info',code:457},{name:'ColorF0Red',code:403}];},registerKey(n){__registered.push(n);},unregisterKey(n){__registered=__registered.filter(k=>k!==n);}}};if(!localStorage.getItem('casa.weather.v1'))localStorage.setItem('casa.weather.v1',JSON.stringify({mode:'auto',placeKey:'',name:'Roma',temperature:17,code:2,isDay:true,at:Date.now()}));});
 await page.route('https://geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[{name:'Londra',latitude:51.51,longitude:-.12,admin1:'Inghilterra',country:'Regno Unito'},{name:'London',latitude:42.98,longitude:-81.24,admin1:'Ontario',country:'Canada'}]}}));
 await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:{current:{temperature_2m:12,weather_code:61,is_day:1}}}));
 await page.route('https://get.geojs.io/**',r=>r.fulfill({json:{city:'Rome',latitude:41.9,longitude:12.5}}));
 await page.goto(preview.baseURL+'/home/');const ready=()=>page.waitForFunction(()=>ZenoQA.ready()),state=()=>page.evaluate(()=>ZenoQA.state()),nav=k=>page.evaluate(k=>ZenoQA.nav(k),k),act=async a=>assert.ok(await page.evaluate(a=>ZenoQA.activate(a),a),a);
 await ready();await page.evaluate(()=>ZenoQA.look({layout:'grid',apps:'icons',gridStyle:'brand',material:'tint'}));await ready();
 const colors=()=>page.locator('.zeno-app-card').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.getAttribute('data-action'),getComputedStyle(e.querySelector('.zeno-app-art')).backgroundImage])));
 const before=await colors();await page.evaluate(()=>ZenoQA.scene('settings'));await act('settings.group.cards');await act('cards.apps');await act('card.configure.youtube');await act('card.color.ink');await nav('home');
 const after=await colors();check('Graphite changes only the selected card',Object.keys(before).every(k=>k==='home.app.youtube'||before[k]===after[k])&&before['home.app.youtube']!==after['home.app.youtube']&&(await state()).gridStyle==='brand');
 await page.evaluate(()=>{ZenoQA.scene('settings');ZenoQA.activate('settings.group.cards');ZenoQA.activate('cards.apps');ZenoQA.activate('card.configure.youtube');});
 check('Color chooser has twelve swatches',await page.locator('#appearanceRows .zeno-swatch').count()===12);
 await act('card.color.auto');await nav('home');check('Automatic restores the app-associated tint',(await colors())['home.app.youtube']===before['home.app.youtube']);
 await page.evaluate(()=>ZenoQA.look({gridStyle:'glass'}));await ready();check('Explicit Automatic remains colored with a neutral grid',await page.locator('.zeno-app-card[data-action="home.app.youtube"]').getAttribute('data-card-tint')==='color'&&await page.locator('.zeno-app-card[data-action="home.app.netflix"]').getAttribute('data-card-tint')==='glass');
 await page.evaluate(()=>{ZenoQA.scene('settings');ZenoQA.activate('settings.group.cards');ZenoQA.activate('cards.apps');ZenoQA.activate('card.configure.youtube');});await act('card.color.default');await nav('home');check('Follow grid removes the override',(await state()).cardColors.youtube===undefined&&await page.locator('.zeno-app-card[data-action="home.app.youtube"]').getAttribute('data-card-tint')==='glass');
 await page.evaluate(()=>{ZenoQA.scene('settings');ZenoQA.activate('settings.group.cards');ZenoQA.activate('cards.apps');ZenoQA.activate('card.configure.youtube');});await act('card.custom');await act('keyboard.clear');for(const k of '#12ABEF')await act('keyboard.'+k);await act('keyboard.save');check('Any valid RGB hex color can be saved',(await state()).cardColors.youtube==='#12abef');
 await page.reload();await ready();check('Custom tint persists without replacing the grid style',(await state()).cardColors.youtube==='#12abef'&&(await state()).gridStyle==='glass');
 await page.evaluate(()=>{var c=JSON.parse(localStorage.getItem('zeno.home.v1'));c.gridStyle='custom';if(c.look)c.look.gridStyle='custom';localStorage.setItem('zeno.home.v1',JSON.stringify(c));});await page.reload();await ready();check('Legacy custom grid migrates to automatic without losing card overrides',(await state()).gridStyle==='brand'&&(await state()).cardColors.youtube==='#12abef');
 await page.evaluate(()=>ZenoQA.scene('settings'));await act('settings.group.extras');await act('extras.weather');
 check('Weather visibility is the first control',await page.locator('#appearanceRows [data-action]').first().getAttribute('data-action')==='weather.enabled');
 await act('weather.enabled');check('Visibility hides the widget without discarding location',await page.evaluate(()=>!CasaExtras.config().enabled&&CasaExtras.config().location==='auto')&&!await page.locator('#weatherWidget').isVisible());await act('weather.enabled');
 await act('weather.interval');await act('weather.interval.60');check('Hourly policy is saved',await page.evaluate(()=>CasaExtras.config().interval)==='60');await act('weather.interval.home');check('Home-return policy is saved',await page.evaluate(()=>CasaExtras.config().interval)==='home');await nav('back');
 await act('extras.location');await act('location.search');await act('keyboard.clear');for(const k of 'LONDON')await act('keyboard.'+k);await act('keyboard.save');await page.waitForFunction(()=>document.querySelectorAll('[data-action^="location.result."]').length===2);
 check('Search returns distinguishable real locations',await page.locator('[data-action="location.result.1"] .setting-description').textContent()==='Ontario · Canada');await act('location.result.0');
 check('Selecting a search result preserves coordinates and name',await page.evaluate(()=>{var c=CasaExtras.config();return c.location==='custom'&&c.place.name==='Londra'&&c.place.lat===51.51&&c.enabled;}));
 await page.evaluate(()=>{CASA_OFFLINE_TEST=false;CasaExtras.refresh(true);});await page.waitForFunction(()=>CasaExtras.weatherText().includes('Londra · 12°'));await page.evaluate(()=>{CASA_OFFLINE_TEST=true;});
 await page.reload();await ready();check('Custom location and policy survive reload',await page.evaluate(()=>CasaExtras.config().place.name==='Londra'&&CasaExtras.config().interval==='home')&&await page.locator('#weatherWidget .weather-widget-place').textContent()==='Londra');
 for(const layout of ['grid','dock','list'])for(const clock of ['digital','compact','analog']){
  await page.evaluate(({layout,clock})=>{ZenoQA.scene('home');CasaExtras.set('clock',clock);ZenoQA.look({layout});},{layout,clock});await ready();
  check(layout+' '+clock+' shows clock style',await page.locator('.clock-style-'+clock).count()===1);

  check(layout+' '+clock+' widgets do not overlap',await page.evaluate(()=>{var c=document.querySelector('#caption').getBoundingClientRect(),w=document.querySelector('#weatherWidget').getBoundingClientRect(),u=document.querySelector('#utils').getBoundingClientRect();function separate(a,b){return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;}return separate(c,w)&&separate(w,u);}));
 }
 await page.evaluate(()=>{ZenoQA.look({layout:'grid'});CasaExtras.set('clock','analog');});await ready();
 const cache=await page.evaluate(()=>{var c=document.querySelector('.zeno-analog-clock'),w=document.querySelector('#weatherWidget').firstChild,builds=ZenoSourceIcons.cacheStats().builds,observer=new MutationObserver(()=>{});observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});for(var i=0;i<30;i++)ZenoQA.nav(i%2?'left':'right');return {clock:c===document.querySelector('.zeno-analog-clock'),weather:w===document.querySelector('#weatherWidget').firstChild,builds:builds===ZenoSourceIcons.cacheStats().builds,lang:observer.takeRecords().length};});
 check('Navigation reuses clock, weather, source vectors and unchanged language',cache.clock&&cache.weather&&cache.builds&&cache.lang===0);
 await page.screenshot({path:root+'.local/qa/preview-Zeno-Widget-1.6.png'});
 await page.evaluate(()=>ZenoQA.scene('settings'));await act('settings.category.devices');await act('settings.group.remote');await act('remote.keys');
 check('Remote menu exposes only SDK-supported keys',await page.locator('[data-action^="remote.key."]').count()===2);
 await act('remote.key.Info');await act('remote.target.home');await page.evaluate(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:457,bubbles:true}));document.dispatchEvent(new KeyboardEvent('keyup',{keyCode:457,bubbles:true}));});check('A registered shortcut works within the launcher',(await state()).view==='home');
 check('Only the configured key is registered',await page.evaluate(()=>__registered.length===1&&__registered[0]==='Info'));
 await page.evaluate(()=>ZenoQA.scene('settings'));await act('settings.category.devices');await act('settings.group.remote');await act('remote.keys');await act('remote.key.Info');await act('remote.target.default');check('Original key behavior can be restored',await page.evaluate(()=>!__registered.length&&!ZenoRemote.mapping('Info')));
 for(const width of [1920,1280]){await page.setViewportSize({width,height:width*9/16});for(const font of (await state()).fonts.available){await page.evaluate(font=>ZenoQA.look({font}),font);await ready();for(const group of ['focus','layout','extras','weather','weatherinterval','clockstyle','remote','cards','colors']){await page.evaluate(group=>{ZenoQA.scene('settings');ZenoQA.activate('settings.group.'+group);},group);/* Internal groups use the real navigation path below. */if((await state()).settingsGroup!==group){await page.evaluate(()=>{ZenoQA.scene('settings');ZenoQA.activate('settings.group.extras');});if(group==='weather'||group==='weatherinterval'){await act('extras.weather');if(group==='weatherinterval')await act('weather.interval');}else if(group==='clockstyle')await act('extras.clock');else if(group==='colors'){await page.evaluate(()=>{ZenoQA.scene('settings');ZenoQA.activate('settings.group.background');});await act('background.colors');}else continue;}
  check('Single-line settings '+width+' '+font+' '+group,await page.locator('#appearanceRows .setting-name,#appearanceRows .setting-description,#appearanceRows .setting-reason').evaluateAll(es=>es.every(e=>getComputedStyle(e).whiteSpace==='nowrap'&&e.scrollHeight<=e.clientHeight+1)));
 }}}
 await page.setViewportSize({width:1920,height:1080});
 await page.evaluate(()=>{ZenoQA.scene('settings');ZenoQA.activate('settings.group.focus');});await page.screenshot({path:root+'.local/qa/preview-Zeno-Vetro-1.6.png'});
 check('No browser runtime errors',!errors.length);
 console.log(passed.length+' widget/color/remote checks passed.');
}finally{await preview.close();}
