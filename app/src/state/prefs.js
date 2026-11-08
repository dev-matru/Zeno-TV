/* Saved preferences: one JSON record in localStorage.
   restore() turns whatever is stored (including records written by earlier releases)
   into a complete, valid configuration; pack() writes it back. Nothing outside this
   file needs to know how old records looked. */
(function (Z) {
  'use strict';

  var KEY = 'zeno.home.v1';
  /* Older storage keys to migrate from, if this build was given any (personal overlay). */
  var EARLIER_KEYS = window.ZenoEarlierHomeKeys || [];
  var SCHEMA_VERSION = 4;
  var RECENT_MAX = 5, RECORD_MAX = 256, NAME_MAX = 160;
  var LOGO_BRANDS = ['hbomax', 'spotify', 'tubi'];
  var RESERVED = { constructor: 1, prototype: 1, __proto__: 1 };
  var oneOf = Z.util.oneOf;

  function isId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/.test(value) && !RESERVED[value];
  }
  /* Platform icons must be local files; anything else is dropped. */
  function iconPath(value) {
    return typeof value === 'string' && value.length < 2048 && /^(?:\/[^\/]|file:\/\/\/|wgt-package:\/\/\/)/.test(value) ? value : '';
  }
  function isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }

  var storage = { ok: true };

  function read() {
    var keys = [KEY].concat(EARLIER_KEYS);
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var data = JSON.parse(raw);
        if (isRecord(data)) return data;
      } catch (e) { storage.ok = false; }
    }
    return null;
  }

  function write(record) {
    localStorage.setItem(KEY, JSON.stringify(record));
  }

  /* Look fields with their allowed values and defaults. `legacy` is the default used
     when the record comes from the release that only had a list theme. */
  function lookFields(env) {
    var panel = ['glass', 'none'];
    return [
      ['playerPanel', panel, 'glass'], ['clockPanel', panel, 'glass'], ['weatherPanel', panel, 'glass'],
      ['sourcesPanel', panel, 'glass'], ['settingsPanel', panel, 'glass'],
      ['menuTheme', ['auto', 'light', 'dark'], 'dark'],
      ['bg', env.values.bg, 'photo', 'dark'],
      ['layout', env.values.layout, null, 'list'],
      ['apps', env.values.apps, 'icons', 'text'],
      ['controls', env.values.controls, 'icons'],
      ['focus', env.values.focus, 'glass', 'type'],
      ['material', env.values.material, 'soft'],
      ['gridNames', ['hidden', 'focus'], 'hidden'],
      ['gridStyle', ['brand', 'glass'], 'brand'],
      ['colorMode', ['auto', 'wallpaper', 'manual'], 'auto'],
      ['font', env.values.font, 'geist']
    ];
  }

  /* Apps that are not built in are remembered by id, platform id, name and icon. */
  function adoptRecords(list, env) {
    (Array.isArray(list) ? list : []).slice(0, RECORD_MAX).forEach(function (r) {
      if (!r || !isId(r.id) || !isId(r.appId) || typeof r.name !== 'string' || !r.name.trim() || env.find(r.id)) return;
      var logo = LOGO_BRANDS.indexOf(r.brand) >= 0;
      env.adopt({ id: r.id, appId: r.appId, name: r.name.slice(0, NAME_MAX), brand: logo ? r.brand : '', mark: logo, icon: iconPath(r.icon) });
    });
  }

  function restoreHome(stored, env) {
    var source = Array.isArray(stored.home) ? stored.home : Array.isArray(stored.dock) ? stored.dock : [], home = [];
    source.forEach(function (id) {
      if (!isId(id) || home.indexOf(id) >= 0 || home.length >= env.cap) return;
      /* An id that looks like a platform app id survives even before the catalogue loads. */
      if (!env.find(id) && id.indexOf('.') > 0) env.adopt({ id: id, appId: id, name: id.split('.').pop(), mark: false });
      if (env.find(id)) home.push(id);
    });
    if (!home.length) home = env.primary.slice();
    var version = stored.casaVersion || 0;
    /* Version 1 added the TV tile, version 4 the PC tile; older homes get them once. */
    if (!version && home.indexOf('tv') < 0 && home.length < env.cap) home.unshift('tv');
    if (version < 4 && home.indexOf('pc') < 0 && home.length < env.cap) {
      var tv = home.indexOf('tv');
      home.splice(tv >= 0 ? tv + 1 : 0, 0, 'pc');
    }
    return home;
  }

  function restore(saved, env) {
    var stored = isRecord(saved) ? saved : {};
    var look = isRecord(stored.look) ? stored.look : stored;
    var listEra = stored.theme === 'list';
    adoptRecords(stored.appRecords, env);
    var home = restoreHome(stored, env), recent = [];
    (Array.isArray(stored.recent) ? stored.recent : []).forEach(function (id) {
      if (recent.length < RECENT_MAX && isId(id) && env.find(id) && home.indexOf(id) < 0 && recent.indexOf(id) < 0) recent.push(id);
    });

    var c = {};
    lookFields(env).forEach(function (field) {
      var name = field[0], fallback = listEra && field.length > 3 ? field[3] : field[2];
      if (name === 'layout' && !listEra) fallback = stored.theme ? 'dock' : 'grid';
      c[name] = oneOf(look[name], field[1], fallback);
    });
    c.desktop = env.desktop(look.desktop || stored.desktop, home);
    c.homeLocked = typeof stored.homeLocked === 'boolean' ? stored.homeLocked : !!look.homeLocked;
    c.cardColors = env.cardColors(look.cardColors);
    c.inkColor = env.validInk(look.inkColor) ? look.inkColor : 'pearl';
    c.imageQuality = '1080';
    var chosen = env.wall(look.wall || stored.wallpaper);
    c.wall = chosen ? chosen.id : env.firstWall();
    c.casaVersion = SCHEMA_VERSION;
    c.home = home;
    c.recent = recent;
    c.lastApp = home.indexOf(stored.lastApp) >= 0 ? stored.lastApp : home[0];
    c.mode = oneOf(stored.mode, env.modes, 'fixed');
    return c;
  }

  /* The stored record keeps the flat configuration plus the older field names
     (look, dock, wallpaper, theme), so a downgrade still finds its settings. */
  function pack(c, env) {
    var out = {};
    for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k];
    out.version = 2;
    out.look = env.look(c);
    out.dock = c.home.slice();
    out.wallpaper = c.wall;
    out.theme = c.layout === 'list' ? 'list' : 'shore';
    out.appRecords = [];
    var seen = {};
    c.home.concat(c.recent).forEach(function (id) {
      var a = env.find(id);
      if (!a || env.primary.indexOf(id) >= 0 || seen[id]) return;
      seen[id] = true;
      out.appRecords.push({ id: a.id, appId: a.appId, name: a.name, brand: a.brand || '', icon: a.icon || '' });
    });
    return out;
  }

  Z.prefs = { KEY: KEY, VERSION: SCHEMA_VERSION, RECENT_MAX: RECENT_MAX, storage: storage, isId: isId, iconPath: iconPath, read: read, write: write, restore: restore, pack: pack };
})(window.Zeno);
