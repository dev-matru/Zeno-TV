/* Bounded sparse desktop. Pure metadata math, shared with the TV and browser checks. */
(function(){
 'use strict';
 var LIMIT=32,widgets=[{id:'widget.clock',name:'Orologio',widget:'clock',mark:true},{id:'widget.weather',name:'Meteo',widget:'weather',mark:true},{id:'widget.player',name:'Musica',widget:'player',mark:true},{id:'widget.sources',name:'Sorgenti',widget:'sources',mark:true},{id:'widget.settings',name:'Personalizza',widget:'settings',mark:true}];
 function definition(id){for(var i=0;i<widgets.length;i++)if(widgets[i].id===id)return widgets[i];return null;}
 function copy(v){return JSON.parse(JSON.stringify(v));}
 function valid(p){return p&&typeof p.x==='number'&&typeof p.y==='number'&&p.x*2%1===0&&p.y*2%1===0&&Math.abs(p.x)<=LIMIT&&Math.abs(p.y)<=LIMIT;}
 function ids(d,home){return widgets.filter(function(w){return d.widgets[w.widget];}).map(function(w){return w.id;}).concat(home);}
 function normalise(raw,home,weather){raw=raw&&typeof raw==='object'?raw:{};var columns=[3,4,5].indexOf(raw.columns)>=0?raw.columns:4,rows=[2,3].indexOf(raw.rows)>=0?raw.rows:3,d={v:1,columns:columns,rows:rows,peeks:raw.peeks!==false,widgets:{},positions:{},sizes:{}},occupied={};widgets.forEach(function(w){d.widgets[w.widget]=raw.widgets&&typeof raw.widgets[w.widget]==='boolean'?raw.widgets[w.widget]:w.widget==='player'?false:w.widget==='weather'?weather!==false:true;});
  widgets.forEach(function(w){d.sizes[w.id]=raw.sizes&&['full','half','quarter'].indexOf(raw.sizes[w.id])>=0?raw.sizes[w.id]:w.widget==='sources'||w.widget==='settings'?'half':'full';});
  var seeds={'widget.clock':{x:0,y:0},'widget.weather':{x:1,y:0},'widget.player':{x:2,y:0},'widget.sources':{x:3,y:0},'widget.settings':{x:3.5,y:0}},all=ids(d,home);
  /* Reserve existing cells before seeding new members; enabling a widget must
     never displace already arranged apps. Keep hidden widget positions too. */
  widgets.forEach(function(w){var p=raw.positions&&raw.positions[w.id];if(valid(p))d.positions[w.id]={x:p.x,y:p.y};});
  all.forEach(function(id){delete d.positions[id];});
  all.forEach(function(id){var p=raw.positions&&raw.positions[id];if(valid(p)&&free(d,all,id,p)){d.positions[id]={x:p.x,y:p.y};occupied[p.x+','+p.y]=true;}else delete d.positions[id];});
  all.forEach(function(id){if(d.positions[id])return;var fallback=seeds[id]||{x:(home.indexOf(id)%4),y:1+Math.floor(home.indexOf(id)/4)},p=copy(fallback);if(!free(d,all,id,p)){var slot=0;do{p={x:(slot%(columns*2))/2,y:Math.floor(slot/(columns*2))/2};slot++;}while(!free(d,all,id,p));}occupied[p.x+','+p.y]=true;d.positions[id]=p;});return d;
 }
 function neighbour(d,home,id,key){var p=d.positions[id],dx=key==='left'?-1:key==='right'?1:0,dy=key==='up'?-1:key==='down'?1:0,best=null,score=Infinity;if(!p)return ids(d,home)[0];ids(d,home).forEach(function(other){if(other===id)return;var q=d.positions[other],along=dx?(q.x-p.x)*dx:(q.y-p.y)*dy,cross=dx?Math.abs(q.y-p.y):Math.abs(q.x-p.x);if(along<=0)return;var value=along*100+cross*160;if(value<score){score=value;best=other;}});return best||id;}
 function span(d,id){var size=d.sizes&&d.sizes[id];return {x:size==='half'||size==='quarter'?.5:1,y:size==='quarter'?.5:1};}
 function intersects(a,as,b,bs){return a.x<b.x+bs.x&&a.x+as.x>b.x&&a.y<b.y+bs.y&&a.y+as.y>b.y;}
 function free(d,all,id,p,ignore){var size=span(d,id);return !all.some(function(other){return other!==id&&other!==ignore&&d.positions[other]&&intersects(p,size,d.positions[other],span(d,other));});}
 function move(d,home,id,key){var all=ids(d,home),steps=definition(id)?[.5,1]:[1];for(var si=0;si<steps.length;si++){var out=copy(d),p=out.positions[id],step=steps[si];if(!p)return out;var q={x:p.x+(key==='left'?-step:key==='right'?step:0),y:p.y+(key==='up'?-step:key==='down'?step:0)};if(!valid(q))continue;var collisions=all.filter(function(other){return other!==id&&intersects(q,span(out,id),out.positions[other],span(out,other));});if(collisions.length>1)continue;if(collisions.length===1){var other=collisions[0];out.positions[id]=q;out.positions[other]={x:p.x,y:p.y};if(!free(out,all,other,out.positions[other])||!free(out,all,id,q))continue;}else out.positions[id]=q;return out;}return copy(d);}
 function resize(d,home,id,size){if(!definition(id)||['full','half','quarter'].indexOf(size)<0)return copy(d);var out=copy(d),all=ids(out,home),origin=out.positions[id];out.sizes[id]=size;if(!origin||free(out,all,id,origin))return out;for(var radius=1;radius<128;radius++){for(var dy=-radius;dy<=radius;dy++)for(var dx=-radius;dx<=radius;dx++){if(Math.abs(dx)+Math.abs(dy)!==radius)continue;var p={x:origin.x+dx*.5,y:origin.y+dy*.5};if(valid(p)&&free(out,all,id,p)){out.positions[id]=p;return out;}}}return copy(d);}
 /* Half slots sit inside a full card: the large inter-row gutter must not
    become part of their offset. The camera uses this same pixel mapping, so
    scrolling remains one continuous plane with no page repositioning. */
 function point(d,p){var g=geometry(d),row=Math.floor(p.y),column=Math.floor(p.x);return {x:column*g.pitchX+(p.x-column)*(g.width+36*g.scale),y:row*g.pitchY+(p.y-row)*(g.height+24*g.scale)};}
 function camera(d,id,current){var p=d.positions[id],size=span(d,id),c={x:current&&current.x||0,y:current&&current.y||0};if(!p)return c;if(p.x<c.x)c.x=p.x;if(p.x+size.x>c.x+d.columns)c.x=Math.ceil((p.x+size.x-d.columns)*2)/2;if(p.y<c.y)c.y=p.y;if(p.y+size.y>c.y+d.rows)c.y=Math.ceil((p.y+size.y-d.rows)*2)/2;return c;}
 function geometry(d){var width=(1660-(d.columns-1)*36)/d.columns,scale=width/388,height=208*scale,pitchY=(1080+height-128)/(d.rows+1);return {width:width,height:height,scale:scale,pitchX:width+36,pitchY:pitchY,left:(1920-1660)/2,top:(1080-height-(d.rows-1)*pitchY)/2};}
 window.ZenoDesktop={widgets:widgets,definition:definition,copy:copy,ids:ids,normalise:normalise,neighbour:neighbour,move:move,resize:resize,span:span,point:point,free:free,camera:camera,geometry:geometry,limit:LIMIT};
}());
