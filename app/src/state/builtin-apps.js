/* Tiles that are always available: the TV picture and the PC. They are inputs,
   not installed apps, and they use Zeno's own icons (assets/icons/tv.svg, pc.svg).

   Every installed app is described by what the TV reports (id, name, icon) and
   uses its platform id as its id. Optional per-app logos and colours come from
   window.ZenoAppStyles, which only a personal build provides. */
(function (Z) {
  'use strict';
  Z.builtinApps = [
    { id: 'tv', name: 'TV', appId: 'org.tizen.tv-viewer', logo: 'tv' },
    { id: 'pc', name: 'PC', appId: 'zeno.pc', logo: 'pc' }
  ];

  /* { logo, color } for an installed app, or an empty object. */
  Z.appStyle = function (appId) {
    var styles = window.ZenoAppStyles || {};
    var style = Object.prototype.hasOwnProperty.call(styles, appId) ? styles[appId] : null;
    if (!style || typeof style !== 'object') return {};
    return {
      logo: typeof style.logo === 'string' && /^[a-z0-9-]{1,40}$/.test(style.logo) ? style.logo : '',
      color:
        typeof style.color === 'string' && /^\d{1,3},\d{1,3},\d{1,3}$/.test(style.color) ? style.color : ''
    };
  };
})(window.Zeno);
