/* Talking to the TV: opening apps, switching inputs, listing installed apps.
 *
 * Only public Tizen APIs are used. Every call ends with done(error, value)
 * within 10 seconds, even if the TV never answers. In a desktop browser each
 * call reports that it needs the TV.
 */
(function () {
  'use strict';

  var TIMEOUT_MS = 10000;

  // Apps Zeno knows by brand, in the order they appear in "All apps".
  var KNOWN_APPS = {
    tv: 'org.tizen.tv-viewer',
    youtube: 'xvvl3S1TT1.TizenTubeStandalone',
    netflix: 'org.tizen.netflix-app',
    primevideo: 'org.tizen.primevideo',
    disneyplus: 'MCmYXNxgcu.DisneyPlus',
    raiplay: '5im3FztIhW.RaiTVtizen',
    infinity: 'g3zzYA7yO8.InfinityNew',
    now: 'jcz0WrZYdy.NOWTV',
    dazn: 'yu1NM3vHsU.DAZN',
    appletv: 'com.samsung.tv.aria-video'
  };
  // Other apps with a known logo.
  var EXTRA_BRANDS = {
    'rJeHak5zRg.Spotify': 'spotify',
    '5b8c3eb16b.BeamCTVDev': 'hbomax',
    '3KA0pm7a7V.TubiTV': 'tubi'
  };
  // Apps with platform-style ids that are still regular apps.
  var REGULAR_PLATFORM_APPS = ['org.tizen.browser', 'com.microsoft.copilot', 'kIciSQlYEM.plex'];
  // Parts of the system that show up as apps but are not meant to be opened.
  var NOT_AN_APP =
    /(?:service|worker|preview|promotion|plugin|launcher|installer|test|sdk|^ep[ -]|factory|daemon|ADPlayer|WebAccount|CastSettings|PrivacyChoices|cmsWebApp|emanual)/i;

  // When the YouTube client is not installed on its own, it can run inside this loader.
  var YOUTUBE_LOADER = 'xvvl3S1bvH.TizenBrewStandalone';
  var YOUTUBE_PLAYER = 'com.samsung.tv.cobalt-yt';
  var SAMSUNG_HOME = 'com.samsung.tv.csfs';
  var SAMSUNG_SETTINGS = 'org.tizen.menu';
  var INPUT_TYPES = ['TV', 'HDMI', 'AV', 'COMPONENT'];

  function application() {
    return window.tizen && window.tizen.application;
  }

  function ownAppId() {
    try {
      return tizen.application.getCurrentApplication().appInfo.id;
    } catch (e) {
      return 'ZenoTV0000.ZenoTV';
    }
  }

  function needsTV(done) {
    done({ message: 'Disponibile sul TV.', detail: 'Questa anteprima non controlla il TV.' });
  }

  function failure(error) {
    return {
      message: 'Il TV non ha aperto questa schermata.',
      detail: (error && (error.message || error.name)) || 'Riprova oppure apri Samsung Home.'
    };
  }

  /* Wraps done so it runs once, and with an error if the TV takes too long. */
  function withTimeout(done) {
    var finished = false;
    var timer = setTimeout(function () {
      finish({ message: 'Il TV non ha risposto. Riprova.' });
    }, TIMEOUT_MS);
    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(error, value);
    }
    return finish;
  }

  function launchById(appId, done) {
    if (!application()) {
      needsTV(done);
      return;
    }
    var finish = withTimeout(done);
    try {
      application().launch(
        appId,
        function () {
          finish(null);
        },
        function (error) {
          finish(failure(error));
        }
      );
    } catch (error) {
      finish(failure(error));
    }
  }

  /* YouTube: the standalone client if installed, otherwise through the loader. */
  function launchYouTube(done) {
    if (!application()) {
      needsTV(done);
      return;
    }
    var finish = withTimeout(done);
    launchById(KNOWN_APPS.youtube, function (error) {
      if (!error) {
        finish(null);
        return;
      }
      try {
        var module = JSON.stringify({
          moduleName: '@foxreis/tizentube',
          moduleType: 'npm',
          args: ''
        });
        var control = new tizen.ApplicationControl(
          'http://tizen.org/appcontrol/operation/default',
          null,
          null,
          null,
          [new tizen.ApplicationControlData('module', [module])]
        );
        application().launchAppControl(
          control,
          YOUTUBE_LOADER,
          function () {
            finish(null);
          },
          function (launchError) {
            finish(failure(launchError));
          }
        );
      } catch (launchError) {
        finish(failure(launchError));
      }
    });
  }

  function launchApp(appId, done) {
    if (appId === KNOWN_APPS.tv) switchInput('TV', 1, done);
    else if (appId === KNOWN_APPS.youtube || appId === YOUTUBE_LOADER) launchYouTube(done);
    else launchById(appId, done);
  }

  /* ---- Inputs ---- */

  function readInputs(done, onInfo) {
    if (!window.tizen || !tizen.systeminfo || !tizen.tvwindow) {
      needsTV(done);
      return;
    }
    var finish = withTimeout(done);
    try {
      tizen.systeminfo.getPropertyValue(
        'VIDEOSOURCE',
        function (info) {
          onInfo(info, finish);
        },
        function (error) {
          finish(failure(error));
        }
      );
    } catch (error) {
      finish(failure(error));
    }
  }

  function inputName(input) {
    if (input.type === 'TV') return 'TV · Antenna';
    return input.type + ' ' + input.number + (input.editName ? ' · ' + input.editName : '');
  }

  /* Every TV, HDMI, AV and component input, connected or not. */
  function listInputs(done) {
    readInputs(done, function (info, finish) {
      var connected = info.connected || [];
      var all = connected.concat(info.disconnected || []).concat(info.current ? [info.current] : []);
      var seen = {};
      var inputs = [];
      all.forEach(function (input) {
        if (INPUT_TYPES.indexOf(input.type) < 0) return;
        var key = input.type + '-' + input.number;
        if (seen[key]) return;
        seen[key] = true;
        inputs.push({
          key: key,
          type: input.type,
          number: input.number,
          name: inputName(input),
          connected: connected.indexOf(input) >= 0,
          current: !!(
            info.current &&
            info.current.type === input.type &&
            info.current.number === input.number
          )
        });
      });
      finish(null, inputs);
    });
  }

  /* Switch to an input, then bring the TV viewer to the front. */
  function switchInput(type, number, done) {
    readInputs(done, function (info, finish) {
      // These are platform objects: setSource needs the one the TV gave us, not a copy.
      var candidates = (info.connected || []).concat(info.disconnected || []);
      if (info.current) candidates.push(info.current);
      var selected = candidates.filter(function (input) {
        return input.type === type && input.number === number;
      })[0];
      if (!selected) {
        finish({
          message: 'Sorgente non collegata.',
          detail: 'Controlla il cavo oppure seleziona l’ingresso da Samsung Home.'
        });
        return;
      }
      try {
        tizen.tvwindow.setSource(
          selected,
          function () {
            launchById(KNOWN_APPS.tv, finish);
          },
          function (error) {
            finish(failure(error));
          }
        );
      } catch (error) {
        finish(failure(error));
      }
    });
  }

  /* ---- Installed apps ---- */

  function isListed(app, brands, seen, self) {
    var known = !!brands[app.id];
    var regular =
      /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(app.id) || REGULAR_PLATFORM_APPS.indexOf(app.id) >= 0;
    if (app.id === self || seen[app.id] || !app.name) return false;
    if (!known && (!app.show || !regular)) return false;
    if (!known && NOT_AN_APP.test(app.name + ' ' + app.id)) return false;
    return !/-dummy$/.test(app.id) && app.id !== YOUTUBE_PLAYER;
  }

  /* Apps the user can open: known brands first, in their usual order, then the rest by name. */
  function listApps(done) {
    if (!application()) {
      needsTV(done);
      return;
    }
    var finish = withTimeout(done);
    var order = Object.keys(KNOWN_APPS);
    var self = ownAppId();

    function build(installed) {
      var brands = {};
      order.forEach(function (brand) {
        brands[KNOWN_APPS[brand]] = brand;
      });
      var standaloneYouTube = installed.some(function (app) {
        return app.id === KNOWN_APPS.youtube;
      });
      if (!standaloneYouTube) brands[YOUTUBE_LOADER] = 'youtube';

      var seen = {};
      var apps = [];
      installed.forEach(function (app) {
        if (!isListed(app, brands, seen, self)) return;
        seen[app.id] = true;
        var brand = brands[app.id];
        apps.push({
          appId: app.id,
          name: brand === 'youtube' ? 'YouTube' : app.name,
          brand: brand || EXTRA_BRANDS[app.id] || '',
          icon: app.iconPath || '',
          rank: brand ? order.indexOf(brand) : 30
        });
      });
      apps.sort(function (a, b) {
        return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      return apps;
    }

    try {
      application().getAppsInfo(
        function (installed) {
          finish(null, build(installed));
        },
        function (error) {
          finish(failure(error));
        }
      );
    } catch (error) {
      finish(failure(error));
    }
  }

  window.ZenoDevice = {
    launch: function (brand, done) {
      launchApp(KNOWN_APPS[brand], done);
    },
    launchApp: launchApp,
    youtube: launchYouTube,
    home: function (done) {
      launchById(SAMSUNG_HOME, done);
    },
    settings: function (done) {
      launchById(SAMSUNG_SETTINGS, done);
    },
    sources: listInputs,
    source: switchInput,
    apps: listApps
  };
})();
