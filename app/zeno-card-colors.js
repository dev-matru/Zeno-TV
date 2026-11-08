/* Automatic tints use local service metadata; no pixels, network or navigation-time work. */
(function(){
  'use strict';
  var brands={youtube:'194,42,53',netflix:'165,30,46',primevideo:'32,133,195',disneyplus:'42,73,172',raiplay:'38,94,188',infinity:'164,51,151',now:'27,145,103',dazn:'175,183,38',appletv:'67,77,91',spotify:'37,157,85',plex:'194,145,39',hbomax:'100,63,177',tubi:'191,153,40'};
  var palette=['208,108,49','192,143,46','167,167,45','109,155,59','52,151,94','39,151,133','43,143,167','51,127,190','74,105,187','111,84,182','151,73,173','183,65,141','193,66,100'];
  var cachedKey='',cached=null,builds=0,hits=0;
  function hash(text){var h=0;for(var i=0;i<text.length;i++)h=(h*31+text.charCodeAt(i))>>>0;return h;}
  function source(a){return !!(a.sourceIcon||a.sourceKey||a.id==='tv'||a.id==='pc');}
  function fallback(a){var key=a.brand||a.id;return Object.prototype.hasOwnProperty.call(brands,key)?brands[key]:palette[hash(a.appId||a.id)%palette.length];}
  function hue(rgb){var p=rgb.split(',').map(Number),max=Math.max.apply(Math,p),min=Math.min.apply(Math,p),d=max-min,h;if(d<24)return null;if(max===p[0])h=(p[1]-p[2])/d;else if(max===p[1])h=(p[2]-p[0])/d+2;else h=(p[0]-p[1])/d+4;return (h*60+360)%360;}
  function gap(a,b){var d=Math.abs(a-b);return Math.min(d,360-d);}
  function key(a){return a.id+'~'+(a.brand||'')+'~'+(source(a)?a.sourceKey||a.id:'app')+'~'+(a.appId||'');}
  function resolve(records){
    var ordered=records.slice().sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0;}),signature=ordered.map(key).join('|');
    if(signature===cachedKey&&cached){hits++;return cached;}
    var result=Object.create(null),used=[],inputs=[];
    ordered.forEach(function(a){if(source(a)){inputs.push(a);return;}var rgb=fallback(a),h=hue(rgb);result[a.id]=rgb;if(h!==null)used.push(h);});
    inputs.sort(function(a,b){var ak=a.id==='tv'?'0':a.sourceKey||a.id,bk=b.id==='tv'?'0':b.sourceKey||b.id;return ak<bk?-1:ak>bk?1:0;});
    inputs.forEach(function(a){var best=0,score=-Infinity;palette.forEach(function(rgb,i){var h=hue(rgb),distance=180,close=0;used.forEach(function(u){var d=gap(h,u);distance=Math.min(distance,d);if(d<28)close++;});var rank=distance-close*18;if(rank>score){score=rank;best=i;}});result[a.id]=palette[best];used.push(hue(palette[best]));});
    cachedKey=signature;cached=Object.freeze(result);builds++;return cached;
  }
  window.ZenoCardColors={resolve:resolve,fallback:fallback,stats:function(){return {builds:builds,hits:hits};}};
}());
