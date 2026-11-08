/* Direct internet downloads, fixed catalogue and a bounded private JPEG cache. */
'use strict';
var fs=require('fs'),https=require('https');
var ROOT='/home/owner/share/casa-tv-wallpapers';
var CATALOG=require('./online-wallpapers.json').entries||[];
var FILES=['photo','panel','field-blur','field-frost','field-clear','glass-soft'];
var HEIGHTS=[1080],busy={};
function entry(id){return CATALOG.filter(function(e){return e.id===id;})[0];}
function valid(id,height){return !!entry(id)&&HEIGHTS.indexOf(+height)>=0;}
function folder(id,height){return ROOT+'/'+id+'-'+height;}
function filename(id,file){return file==='photo'&&entry(id).format==='png'?'photo.png':file+'.jpg';}
function allFolders(){try{return fs.readdirSync(ROOT).filter(function(n){return /^[a-z][a-z0-9-]{2,48}-(720|1080|1440|2160)$/.test(n)&&fs.lstatSync(ROOT+'/'+n).isDirectory()&&!fs.lstatSync(ROOT+'/'+n).isSymbolicLink();});}catch(e){return [];}}
function removeFolder(name){['photo.jpg','photo.png','panel.jpg','field-blur.jpg','field-frost.jpg','field-clear.jpg','glass-soft.jpg','recipe.json'].forEach(function(file){try{fs.unlinkSync(ROOT+'/'+name+'/'+file);}catch(ignore){}try{fs.unlinkSync(ROOT+'/'+name+'/'+file+'.part');}catch(ignore){}});try{fs.rmdirSync(ROOT+'/'+name);}catch(ignore){}}
function info(){var bytes=0,count=0;allFolders().forEach(function(n){count++;['photo.jpg','photo.png','panel.jpg','field-blur.jpg','field-frost.jpg','field-clear.jpg','glass-soft.jpg'].forEach(function(f){try{bytes+=fs.statSync(ROOT+'/'+n+'/'+f).size;}catch(ignore){}});});return {bytes:bytes,sets:count};}
function clear(keep){if(keep&& !entry(keep) && !/^[a-z]+$/.test(keep))throw Error('Sfondo non valido.');allFolders().forEach(function(n){if(n!==keep+'-1080')removeFolder(n);});return info();}
function cached(id,height){try{return JSON.parse(fs.readFileSync(folder(id,height)+'/recipe.json','utf8')).version===2&&FILES.every(function(f){return fs.statSync(folder(id,height)+'/'+filename(id,f)).size>0;});}catch(e){return false;}}
function trim(keep){var entries=allFolders().map(function(n){return {name:n,time:+fs.statSync(ROOT+'/'+n).mtime};});entries.sort(function(a,b){return b.time-a.time;});var count=1;entries.forEach(function(e){if(e.name===keep)return;if(count++>=3)removeFolder(e.name);});}
function url(id,height,file){var source=entry(id).source,w=file==='photo'?height*16/9:file==='panel'?320:1920,h=file==='photo'?height:file==='panel'?180:1080;
 var result='https://wsrv.nl/?url='+encodeURIComponent(source)+'&w='+w+'&h='+h+'&fit=cover'+(file==='photo'&&entry(id).format==='png'?'&output=png&l=6':'&output=jpg&q='+(file==='photo'?94:88));
 if(file==='panel')result+='&blur=12';if(file==='field-blur')result+='&blur=28&sat=0.92';if(file==='field-frost')result+='&blur=42&sat=0.92';if(file==='field-clear')result+='&blur=2&sat=1.06';if(file==='glass-soft')result+='&blur=14&sat=1.12&mod=0.52';return result;
}
function download(url,done){var ended=false,request=https.get(url,function(res){var chunks=[],size=0;
 function finish(error,value){if(ended)return;ended=true;done(error,value);}
 if(res.statusCode!==200){res.resume();finish(Error('Catalogo online temporaneamente non disponibile. Riprova.'));return;}
 res.on('data',function(chunk){size+=chunk.length;if(size>10000000){request.destroy();finish(Error('Immagine troppo grande.'));return;}chunks.push(chunk);});
 res.on('error',finish);res.on('end',function(){if(ended)return;var image=Buffer.concat(chunks);var jpeg=image.length>=4&&image[0]===255&&image[1]===216&&image[image.length-2]===255&&image[image.length-1]===217,png=image.length>=24&&image.slice(0,8).toString('hex')==='89504e470d0a1a0a';if(!jpeg&&!png){finish(Error('Formato immagine non valido.'));return;}finish(null,image);});
 });
 function end(error){if(ended)return;ended=true;done(error);}
 request.setTimeout(20000,function(){request.destroy();end(Error('Download scaduto. Lo sfondo attuale resta visibile.'));});request.on('error',function(){end(Error('Connessione al catalogo online non disponibile. Riprova.'));});
}
function prepare(data,unused,done){
 var id=data.wall,height=+data.height,key=id+'-'+height;
 if(!valid(id,height))return done(Error('Sfondo o risoluzione non validi.'));
 if(cached(id,height)){try{fs.utimesSync(folder(id,height),new Date(),new Date());}catch(ignore){}return done(null,{cached:true});}
 if(busy[key])return busy[key].push(done);busy[key]=[done];
 var images={},queue=FILES.slice(),running=0,completed=0,failed=false;
 function finish(error){if(failed)return;failed=true;var callbacks=busy[key]||[];delete busy[key];callbacks.forEach(function(cb){cb(error,error?null:{cached:true});});}
 function next(){
  if(failed)return;
  while(running<2&&queue.length){(function(file){running++;download(url(id,height,file),function(error,bytes){running--;if(failed)return;if(error)return finish(error);images[file]=bytes;completed++;if(completed===FILES.length){try{
   if(!fs.existsSync(ROOT))fs.mkdirSync(ROOT,448);if(!fs.existsSync(folder(id,height)))fs.mkdirSync(folder(id,height),448);
   FILES.forEach(function(f){var path=folder(id,height)+'/'+filename(id,f);fs.writeFileSync(path+'.part',images[f],{mode:384});fs.renameSync(path+'.part',path);});fs.writeFileSync(folder(id,height)+'/recipe.json',JSON.stringify({version:2}),{mode:384});trim(key);finish();
  }catch(e){finish(e);}return;}next();});}(queue.shift()));}
 }
 next();
}
function image(path,res){var match=/^\/wallpaper\/([a-z][a-z0-9]{1,15}-[a-f0-9]{16})\/(1080)\/((?:photo\.(?:png|jpg))|(?:(?:panel|field-blur|field-frost|field-clear|glass-soft)\.jpg))$/.exec(path);if(!match||!valid(match[1],+match[2]))return false;var file=match[3];if(file.indexOf('photo.')===0&&file!==filename(match[1],'photo'))return false;try{var bytes=fs.readFileSync(folder(match[1],match[2])+'/'+file);res.writeHead(200,{'Content-Type':file.endsWith('.png')?'image/png':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'private, max-age=86400'});res.end(bytes);}catch(e){res.writeHead(404);res.end();}return true;}
module.exports={prepare:prepare,image:image,info:info,clear:clear};
