/* Apps Zeno knows by name. `id` is the stable key stored in preferences and used to
   find a logo; `appId` is the platform application id it launches. */
(function (Z) {
  'use strict';
  Z.builtinApps = [
    { id: 'tv', name: 'TV', appId: 'org.tizen.tv-viewer' },
    { id: 'pc', name: 'PC', appId: 'casa.pc' },
    { id: 'youtube', name: 'YouTube', appId: 'xvvl3S1TT1.TizenTubeStandalone' },
    { id: 'netflix', name: 'Netflix', appId: 'org.tizen.netflix-app' },
    { id: 'primevideo', name: 'Prime Video', appId: 'org.tizen.primevideo' },
    { id: 'disneyplus', name: 'Disney+', appId: 'MCmYXNxgcu.DisneyPlus' },
    { id: 'raiplay', name: 'RaiPlay', appId: '5im3FztIhW.RaiTVtizen' },
    { id: 'infinity', name: 'Mediaset Infinity', appId: 'g3zzYA7yO8.InfinityNew' },
    { id: 'now', name: 'NOW', appId: 'jcz0WrZYdy.NOWTV' },
    { id: 'dazn', name: 'DAZN', appId: 'yu1NM3vHsU.DAZN' },
    { id: 'appletv', name: 'Apple TV', appId: 'com.samsung.tv.aria-video' }
  ].map(function (a) { a.mark = true; return a; });
})(window.Zeno);
