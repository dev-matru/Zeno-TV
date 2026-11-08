/* Public TV APIs. No resident computer server or system service changes. */
(function () {
  'use strict';
  var IDS = {
    tv: 'org.tizen.tv-viewer',
    youtube: 'xvvl3S1TT1.TizenTubeStandalone', netflix: 'org.tizen.netflix-app',
    primevideo: 'org.tizen.primevideo', disneyplus: 'MCmYXNxgcu.DisneyPlus',
    raiplay: '5im3FztIhW.RaiTVtizen', infinity: 'g3zzYA7yO8.InfinityNew',
    now: 'jcz0WrZYdy.NOWTV', dazn: 'yu1NM3vHsU.DAZN', appletv: 'com.samsung.tv.aria-video'
  };
  var BREW = 'xvvl3S1bvH.TizenBrewStandalone';
  var SELF = 'CsTv9rK2mQ.CasaTV';
  var CONSUMER = ['org.tizen.browser', 'com.microsoft.copilot', 'kIciSQlYEM.plex'];
  var EXTRA = {'rJeHak5zRg.Spotify': 'spotify', '5b8c3eb16b.BeamCTVDev': 'hbomax', '3KA0pm7a7V.TubiTV': 'tubi'};
  function api() { return window.tizen && window.tizen.application; }
  function unavailable(done) { done({message: 'Disponibile sul TV.', detail: 'Questa anteprima non controlla il TV.'}); }
  function failure(error) { return {message: 'Il TV non ha aperto questa schermata.', detail: error && (error.message || error.name) || 'Riprova oppure apri Samsung Home.'}; }
  function bounded(done) {
    var ended = false, timer = setTimeout(function () { finish({message: 'Il TV non ha risposto. Riprova.'}); }, 10000);
    function finish(error, value) { if (ended) return; ended = true; clearTimeout(timer); done(error, value); }
    return finish;
  }
  function rawLaunch(id, done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try { api().launch(id, function () { finish(null); }, function (error) { finish(failure(error)); }); }
    catch (error) { finish(failure(error)); }
  }
  function youtube(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    rawLaunch(IDS.youtube, function (error) {
      if (!error) { finish(null); return; }
      try {
        var data = [new tizen.ApplicationControlData('module', [JSON.stringify({moduleName: '@foxreis/tizentube', moduleType: 'npm', args: ''})])];
        var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
        api().launchAppControl(control, BREW, function () { finish(null); }, function (err) { finish(failure(err)); });
      } catch (err) { finish(failure(err)); }
    });
  }
  function launchApp(id, done) {
    if (id === IDS.tv) source('TV', 1, done);
    else if (id === IDS.youtube || id === BREW) youtube(done);
    else rawLaunch(id, done);
  }
  function home(done) { rawLaunch('com.samsung.tv.csfs', done); }
  function settings(done) { rawLaunch('org.tizen.menu', done); }
  function sources(done) {
    if (!window.tizen || !tizen.systeminfo || !tizen.tvwindow) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        var seen = {}, result = [];
        (info.connected || []).concat(info.disconnected || []).concat(info.current ? [info.current] : []).forEach(function (source) {
          if (['TV', 'HDMI', 'AV', 'COMPONENT'].indexOf(source.type) < 0) return;
          var key = source.type + '-' + source.number;
          if (seen[key]) return;
          seen[key] = true;
          result.push({key: key, type: source.type, number: source.number, name: source.type === 'TV' ? 'TV · Antenna' : source.type + ' ' + source.number + (source.editName ? ' · ' + source.editName : ''), connected: (info.connected || []).indexOf(source) >= 0, current: !!(info.current && info.current.type === source.type && info.current.number === source.number)});
        });
        finish(null, result);
      }, function (error) { finish(failure(error)); });
    } catch (error) { finish(failure(error)); }
  }
  function source(type, number, done) {
    if (!window.tizen || !tizen.tvwindow || !tizen.systeminfo) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      // SystemInfoVideoSourceInfo is a platform object, not a plain JS dictionary.
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
        var candidates = (info.connected || []).concat(info.disconnected || []), selected = null;
        if (info.current) candidates.push(info.current);
        candidates.some(function (item) { if (item.type === type && item.number === number) { selected = item; return true; } return false; });
        if (!selected) { finish({message: 'Sorgente non collegata.', detail: 'Controlla il cavo oppure seleziona l’ingresso da Samsung Home.'}); return; }
        try {
          tizen.tvwindow.setSource(selected, function () {
            rawLaunch('org.tizen.tv-viewer', finish);
          }, function (error) { finish(failure(error)); });
        } catch (error) { finish(failure(error)); }
      }, function (error) { finish(failure(error)); });
    } catch (error) { finish(failure(error)); }
  }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().getAppsInfo(function (list) {
        var known = {}, seen = {}, result = [], hasStandalone = false;
        Object.keys(IDS).forEach(function (brand) { known[IDS[brand]] = brand; });
        list.forEach(function (a) { if (a.id === IDS.youtube) hasStandalone = true; });
        if (!hasStandalone) known[BREW] = 'youtube';
        list.forEach(function (a) {
          var primary = !!known[a.id], consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER.indexOf(a.id) >= 0;
          if (a.id === SELF || seen[a.id] || !a.name || (!primary && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|installer|test|sdk|^ep[ -]|factory|daemon|ADPlayer|WebAccount|CastSettings|PrivacyChoices|cmsWebApp|emanual)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          result.push({appId: a.id, name: known[a.id] === 'youtube' ? 'YouTube' : a.name, brand: known[a.id] || EXTRA[a.id] || '', icon: a.iconPath || '', rank: primary ? Object.keys(IDS).indexOf(known[a.id]) : 30});
        });
        result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        finish(null, result);
      }, function (error) { finish(failure(error)); });
    } catch (error) { finish(failure(error)); }
  }
  window.ZenoDevice = {launch: function (brand, done) { launchApp(IDS[brand], done); }, launchApp: launchApp, youtube: youtube, home: home, settings: settings, sources: sources, source: source, apps: apps};
}());
