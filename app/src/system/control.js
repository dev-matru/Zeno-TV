/* Network settings and the two helpers Zeno talks to.
 *
 * 1. The network service (app/service/index.js) runs on the TV next to Zeno and
 *    does what a web page cannot: Wake on LAN packets, developer mode, the
 *    wallpaper cache, memory readings. rpc() starts it and sends it a command
 *    over HTTP on 127.0.0.1, with a token that only this build knows.
 *
 * 2. An optional helper on a computer in the same network (macHost, port 4797)
 *    can update the YouTube client and stop or uninstall apps. Without it,
 *    those options simply stay unavailable.
 *
 * The tokens and default addresses come from window.ZenoDeviceDefaults, which
 * is generated into each personal build and is empty in the public source.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zeno.control.v1';
  var LAST_UPDATE_CHECK_KEY = 'zeno.update-check';
  var SERVICE_URL = 'http://127.0.0.1:4796/';
  var HELPER_PORT = 4797;
  var DAY_MS = 86400000;
  var defaults = window.ZenoDeviceDefaults || {};

  var settings = {
    mac: defaults.pcMac || '',
    pcIp: defaults.pcIp || '',
    broadcast: '255.255.255.255',
    port: 9,
    hdmi: 2,
    macHost: defaults.macHost || '',
    autoUpdate: true
  };

  var developer = { ip: null, enabled: null };
  var commandCount = 0;

  /* ---- Settings ---- */

  function isIp(value) {
    return (
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) &&
      value.split('.').every(function (part) {
        return +part <= 255;
      })
    );
  }

  function valid(key, value) {
    if (['macHost', 'pcIp', 'broadcast'].indexOf(key) >= 0) return isIp(value);
    if (key === 'mac') return /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(value);
    if (key === 'port') return /^\d+$/.test(String(value)) && +value > 0 && +value < 65536;
    if (key === 'hdmi') return [1, 2, 3, 4].indexOf(+value) >= 0;
    if (key === 'pcAction') return ['menu', 'source', 'both'].indexOf(value) >= 0;
    if (key === 'autoUpdate') return typeof value === 'boolean';
    return false;
  }

  function loadSettings() {
    var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored) return;
    Object.keys(settings).forEach(function (key) {
      if (valid(key, stored[key])) settings[key] = stored[key];
    });
  }

  function changed() {
    document.dispatchEvent(new Event('zeno-control-change'));
  }

  function set(key, value) {
    if (!valid(key, value)) return false;
    var next = {};
    Object.keys(settings).forEach(function (name) {
      next[name] = settings[name];
    });
    if (key === 'hdmi' || key === 'port') next[key] = +value;
    else if (key === 'mac') next[key] = value.toUpperCase();
    else next[key] = value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      return false;
    }
    settings = next;
    changed();
    return true;
  }

  /* ---- Network service on the TV ---- */

  // The service shares Zeno's package: ZenoTV0000.ZenoTV -> ZenoTV0000.NetworkService.
  function serviceId() {
    try {
      return tizen.application.getCurrentApplication().appInfo.packageId + '.NetworkService';
    } catch (e) {
      return 'ZenoTV0000.NetworkService';
    }
  }

  function timeoutFor(path, command) {
    if (path === 'ready') return 400;
    if (command.op === 'developer') return 25000;
    if (command.op === 'wallpaper') return 70000;
    return 8000;
  }

  function serviceRequest(method, path, command, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, SERVICE_URL + path, true);
    xhr.timeout = timeoutFor(path, command);
    xhr.setRequestHeader('Authorization', 'Bearer ' + defaults.localToken);
    if (body) xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      try {
        var response = JSON.parse(xhr.responseText);
        if (xhr.status !== 200) throw Error(response.error || 'Servizio locale non disponibile.');
        callback(null, response);
      } catch (e) {
        callback(e);
      }
    };
    xhr.onerror = xhr.ontimeout = function () {
      callback(Error('Il servizio locale del TV non risponde.'));
    };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  /* Send one command to the service: done(error, value). The service is started
     if needed, then polled until ready (up to about 3 seconds). */
  function rpc(command, done) {
    if (!window.tizen || !tizen.application) {
      done({ message: 'Disponibile sul TV.' });
      return;
    }
    if (!defaults.localToken) {
      done({ message: 'Servizio locale non configurato.' });
      return;
    }

    var finished = false;
    function finish(error, value) {
      if (finished) return;
      finished = true;
      done(error, value);
    }

    function send() {
      // The id lets the service ignore a command it has already run.
      command.id = 'zeno-' + ++commandCount + '-' + Date.now();
      serviceRequest('POST', 'command', command, command, function (error, response) {
        if (error) finish({ message: error.message });
        else if (response.error) finish({ message: response.error });
        else finish(null, response.value);
      });
    }

    function whenReady(attempt) {
      serviceRequest('GET', 'ready', command, null, function (error) {
        if (!error) send();
        else if (attempt < 30)
          setTimeout(function () {
            whenReady(attempt + 1);
          }, 100);
        else finish({ message: error.message });
      });
    }

    tizen.application.launch(
      serviceId(),
      function () {
        whenReady(0);
      },
      function (error) {
        finish({ message: error.message || 'Il TV non avvia il servizio locale.' });
      }
    );
  }

  function status(done) {
    rpc({ op: 'status' }, function (error, value) {
      if (!error && value) developer = value;
      else if (error) developer = { ip: null, enabled: null, error: error.message };
      changed();
      if (done) done(error, value);
    });
  }

  function setDeveloper(value, done) {
    rpc({ op: 'developer', enabled: value.enabled, ip: value.ip }, function (error, result) {
      if (!error && result) developer = result;
      changed();
      done(error, result);
    });
  }

  function wake(done) {
    if (!valid('mac', settings.mac)) {
      done({ message: 'Configura il MAC del PC in Personalizza → PC.' });
      return;
    }
    rpc({ op: 'wol', mac: settings.mac, broadcast: settings.broadcast, port: settings.port }, done);
  }

  /* ---- Wallpapers downloaded and cached by the service ---- */

  function prepareWallpaper(wall, height, done) {
    rpc({ op: 'wallpaper', wall: wall, height: 1080 }, done);
  }

  function wallpaperURL(wall, height, variant) {
    var entry = (window.ZenoWallpapers || []).filter(function (candidate) {
      return candidate.id === wall;
    })[0];
    var extension = variant === 'photo' && entry && entry.format === 'png' ? 'png' : 'jpg';
    var token = encodeURIComponent(defaults.localToken || '');
    return SERVICE_URL + 'wallpaper/' + wall + '/1080/' + variant + '.' + extension + '?v=2&token=' + token;
  }

  /* ---- Other requests: the computer helper and GitHub ---- */

  function timeoutForUrl(url) {
    if (url.indexOf('/apps/action') >= 0) return 85000;
    if (url.indexOf('/apps/capabilities') >= 0) return 2500;
    return 12000;
  }

  function request(url, method, body, done) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = timeoutForUrl(url);
    if (method === 'POST') {
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + (defaults.bridgeToken || ''));
    }
    xhr.onload = function () {
      try {
        var data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status > 299) throw Error(data.error || 'HTTP ' + xhr.status);
        done(null, data);
      } catch (e) {
        done(e);
      }
    };
    xhr.onerror = xhr.ontimeout = function () {
      done(Error('Connessione non disponibile.'));
    };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  function helperURL(path) {
    return 'http://' + settings.macHost + ':' + HELPER_PORT + '/' + path;
  }

  function hasHelper() {
    return !!(settings.macHost && defaults.bridgeToken);
  }

  /* Whether the helper can stop or uninstall an app: done(null, { available, ... }). */
  function appBridge(appId, done) {
    if (!hasHelper()) {
      done(null, { available: false });
      return;
    }
    request(helperURL('apps/capabilities'), 'POST', { appId: appId }, function (error, value) {
      done(null, error ? { available: false } : value);
    });
  }

  function appAction(operation, appId, requestId, done) {
    var body = { op: operation, appId: appId, requestId: requestId };
    request(helperURL('apps/action'), 'POST', body, function (error, value) {
      if (error) done({ message: error.message }, value);
      else if (value && value.error) done({ message: value.error }, value);
      else done(null, value);
    });
  }

  /* ---- YouTube client updates ---- */

  var RELEASES_URL = 'https://api.github.com/repos/reisxd/TizenTube/releases/latest';
  var RELEASE_ASSET = 'TizenTubeCobalt.wgt';
  var INSTALL_TIMEOUT_MS = 180000;

  var release = null;
  var updateError = '';
  var checking = false;
  var installing = false;
  var installMessage = '';

  function checkUpdates(done) {
    if (checking) {
      if (done) done();
      return;
    }
    checking = true;
    updateError = '';
    changed();
    request(RELEASES_URL, 'GET', null, function (error, data) {
      checking = false;
      if (error) {
        updateError = 'Impossibile controllare gli aggiornamenti.';
      } else {
        var asset = (data.assets || []).filter(function (candidate) {
          return candidate.name === RELEASE_ASSET;
        })[0];
        if (!data.draft && !data.prerelease && asset)
          release = { tag: data.tag_name, url: data.html_url, asset: asset.browser_download_url };
        else updateError = 'Nessun pacchetto compatibile nella release.';
        try {
          localStorage.setItem(LAST_UPDATE_CHECK_KEY, String(Date.now()));
        } catch (ignore) {}
      }
      changed();
      if (done) done(error, release);
    });
  }

  /* The helper downloads and installs the update; we poll its status every 1.5 s. */
  function installUpdate(done) {
    if (installing) {
      done({ message: 'Aggiornamento già in corso.' });
      return;
    }
    if (!hasHelper()) {
      done({ message: 'Il servizio aggiornamenti sul Mac non è configurato.' });
      return;
    }
    var started = Date.now();
    installing = true;
    installMessage = 'Collegamento al Mac…';
    changed();

    function finish(error, value) {
      installing = false;
      installMessage = error ? error.message : value.message;
      changed();
      done(error ? { message: error.message } : null, value);
    }

    function onStatus(error, value) {
      if (error) {
        finish(Error('Accendi questo Mac e avvia il servizio aggiornamenti.'));
        return;
      }
      installMessage = value.message;
      changed();
      if (value.state === 'error') finish(Error(value.message));
      else if (value.state === 'done') finish(null, value);
      else if (Date.now() - started > INSTALL_TIMEOUT_MS)
        finish(Error('Operazione ancora in corso: controlla il servizio sul Mac.'));
      else
        setTimeout(function () {
          request(helperURL('tizentube/status'), 'POST', {}, onStatus);
        }, 1500);
    }

    request(helperURL('tizentube/update'), 'POST', {}, onStatus);
  }

  /* Check once a day, a few seconds after start. */
  function scheduleUpdateCheck() {
    setTimeout(function () {
      var last = 0;
      try {
        last = +localStorage.getItem(LAST_UPDATE_CHECK_KEY) || 0;
      } catch (ignore) {}
      if (settings.autoUpdate && Date.now() - last > DAY_MS) checkUpdates();
    }, 5000);
  }

  try {
    loadSettings();
  } catch (ignore) {}

  window.ZenoControl = {
    config: function () {
      return settings;
    },
    set: set,
    valid: valid,
    rpc: rpc,
    status: status,
    developer: function () {
      return developer;
    },
    setDeveloper: setDeveloper,
    wol: wake,
    prepareWallpaper: prepareWallpaper,
    wallpaperURL: wallpaperURL,
    appBridge: appBridge,
    appAction: appAction,
    checkUpdates: checkUpdates,
    installUpdate: installUpdate,
    update: function () {
      return {
        release: release,
        error: updateError,
        checking: checking,
        installing: installing,
        installMessage: installMessage
      };
    }
  };

  if (!window.ZENO_OFFLINE_TEST) scheduleUpdateCheck();
})();
