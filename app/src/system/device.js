/* Talking to the TV: opening apps, switching inputs, listing installed apps.
 *
 * Only public Tizen APIs are used. Every call ends with done(error, value)
 * within 10 seconds, even if the TV never answers. In a desktop browser each
 * call reports that it needs the TV.
 */
(function () {
  'use strict';

  var TIMEOUT_MS = 10000;

  var TV_APP = 'org.tizen.tv-viewer';
  // Store apps with platform-style ids (org.tizen.*, com.samsung.*) that are still
  // regular apps. Every other app with such an id is part of the system.
  var REGULAR_PLATFORM_APPS = [
    'org.tizen.browser',
    'org.tizen.netflix-app',
    'org.tizen.primevideo',
    'com.samsung.tv.aria-video',
    'com.microsoft.copilot',
    'kIciSQlYEM.plex'
  ];
  // Parts of the system that show up as apps but are not meant to be opened.
  var NOT_AN_APP =
    /(?:service|worker|preview|promotion|plugin|launcher|installer|test|sdk|^ep[ -]|factory|daemon|ADPlayer|WebAccount|CastSettings|Privacy|cmsWebApp|emanual)/i;

  // A YouTube client installed on its own, or run inside this loader when it is not.
  var YOUTUBE_STANDALONE = 'xvvl3S1TT1.TizenTubeStandalone';
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
    launchById(YOUTUBE_STANDALONE, function (error) {
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

  function isYouTube(appId) {
    return appId === YOUTUBE_STANDALONE || appId === YOUTUBE_LOADER;
  }

  function launchApp(appId, done) {
    if (appId === TV_APP) switchInput('TV', 1, done);
    else if (isYouTube(appId)) launchYouTube(done);
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
            launchById(TV_APP, finish);
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

  function isListed(app, seen, self) {
    var regular =
      /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(app.id) || REGULAR_PLATFORM_APPS.indexOf(app.id) >= 0;
    if (app.id === self || seen[app.id] || !app.name || !app.show || !regular) return false;
    if (NOT_AN_APP.test(app.name + ' ' + app.id)) return false;
    return !/-dummy$/.test(app.id) && app.id !== YOUTUBE_PLAYER;
  }

  /* Apps the user can open, by name, as the TV describes them. */
  function listApps(done) {
    if (!application()) {
      needsTV(done);
      return;
    }
    var finish = withTimeout(done);
    var self = ownAppId();

    function build(installed) {
      var seen = {};
      var apps = [];
      installed.forEach(function (app) {
        if (!isListed(app, seen, self)) return;
        seen[app.id] = true;
        apps.push({ appId: app.id, name: app.name, icon: app.iconPath || '' });
      });
      apps.sort(function (a, b) {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
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
    launchApp: launchApp,
    isYouTube: isYouTube,
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
