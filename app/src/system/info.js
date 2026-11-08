/* Information about the TV and its apps, for the System page in Settings.
 *
 * stats() collects memory, storage, model and Zeno's own cache size.
 * details(appId) says whether an app is running, how big it is and how much
 * memory it uses. Everything comes from public Tizen APIs or Zeno's own
 * network service; nothing is changed.
 */
(function () {
  'use strict';

  var STATS_TIMEOUT_MS = 5000;
  // YouTube plays video in a separate player app; it counts as the same app here.
  var YOUTUBE = 'xvvl3S1TT1.TizenTubeStandalone';
  var YOUTUBE_PLAYER = 'com.samsung.tv.cobalt-yt';

  function bytes(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 0) return 'Non disponibile';
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    return Math.round(n / 1024) + ' KB';
  }

  /* Calls done(null, result) once everything answered, or after 5 seconds with what arrived. */
  function stats(done) {
    var result = { memory: {}, storage: [], cache: null, device: {} };
    var pending = 1;
    var finished = false;
    var timer = setTimeout(finish, STATS_TIMEOUT_MS);

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done(null, result);
    }

    function answered() {
      pending--;
      if (!pending) finish();
    }

    function ask(property, read) {
      pending++;
      try {
        tizen.systeminfo.getPropertyValue(
          property,
          function (value) {
            if (!finished) read(value);
            answered();
          },
          answered
        );
      } catch (ignore) {
        answered();
      }
    }

    if (window.tizen && tizen.systeminfo) {
      try {
        result.memory.total = tizen.systeminfo.getTotalMemory();
        result.memory.available = tizen.systeminfo.getAvailableMemory();
        result.device.platform = tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version');
      } catch (ignore) {}

      ask('STORAGE', function (value) {
        result.storage = value.units || [];
      });
      ask('BUILD', function (value) {
        result.device.model = value.model;
        result.device.build = value.buildVersion;
      });
      ask('DISPLAY', function (value) {
        if (value.resolutionWidth && value.resolutionHeight)
          result.device.display = value.resolutionWidth + ' × ' + value.resolutionHeight;
      });
      ask('NETWORK', function (value) {
        result.device.network = value.networkType;
      });

      try {
        if (window.webapis && webapis.productinfo) {
          result.device.model = webapis.productinfo.getModel();
          result.device.firmware = webapis.productinfo.getFirmware();
          if (webapis.productinfo.isUdPanelSupported()) result.device.panel = '4K UHD';
        }
      } catch (ignore) {}

      pending++;
      ZenoControl.rpc({ op: 'cache-info' }, function (error, value) {
        if (!error) result.cache = value;
        answered();
      });
    }
    answered();
  }

  function isTheApp(context, appId) {
    return context.appId === appId || (appId === YOUTUBE && context.appId === YOUTUBE_PLAYER);
  }

  function readPackage(appId, result) {
    try {
      var app = tizen.application.getAppInfo(appId);
      result.name = app.name;
      result.version = app.version;
      result.packageId = app.packageId;
      if (tizen.package && app.packageId) {
        var info = tizen.package.getPackageInfo(app.packageId);
        result.package = {
          id: info.id,
          totalSize: info.totalSize,
          dataSize: info.dataSize,
          version: info.version
        };
      }
    } catch (e) {
      result.infoError = e.name;
    }
  }

  /* Running processes of the app and of its package (its background services). */
  function readContexts(appId, result, contexts) {
    result.contexts = contexts
      .filter(function (context) {
        return (
          isTheApp(context, appId) ||
          (result.packageId && context.appId.indexOf(result.packageId + '.') === 0)
        );
      })
      .map(function (context) {
        return { id: context.id, appId: context.appId };
      });
    result.running = result.contexts.some(function (context) {
      return isTheApp(context, appId);
    });
    result.serviceRunning = result.contexts.some(function (context) {
      return context.appId !== appId && context.appId !== YOUTUBE_PLAYER;
    });
    if (!result.running) result.memory = 0;
    return result.contexts.filter(function (context) {
      return isTheApp(context, appId);
    })[0];
  }

  function details(appId, done) {
    var result = {
      id: appId,
      running: null,
      contexts: [],
      package: null,
      memory: null,
      canStop: false,
      canUninstall: false
    };
    if (!window.tizen || !tizen.application) {
      done({ message: 'Disponibile sul TV.' }, result);
      return;
    }
    readPackage(appId, result);

    function finish() {
      done(null, result);
    }
    try {
      tizen.application.getAppsContext(function (contexts) {
        var main = readContexts(appId, result, contexts);
        if (!main || !/^\d+$/.test(main.id)) {
          finish();
          return;
        }
        // Memory use is read from /proc by the network service.
        ZenoControl.rpc({ op: 'app-memory', appId: main.appId, pid: +main.id }, function (error, value) {
          if (!error && value) result.memory = value.bytes;
          finish();
        });
      }, finish);
    } catch (e) {
      finish();
    }
  }

  function clearCache(keep, done) {
    ZenoControl.rpc({ op: 'cache-clear', keep: keep }, done);
  }

  /* Samsung's own app manager, for what Zeno does not do. */
  function openNativeManager(done) {
    ZenoDevice.launchApp('com.samsung.tv.store', done);
  }

  window.ZenoSystem = {
    bytes: bytes,
    stats: stats,
    details: details,
    clearCache: clearCache,
    nativeManager: openNativeManager
  };
})();
