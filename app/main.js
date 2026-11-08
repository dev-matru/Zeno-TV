/* Zeno TV: the Home screen. This file wires the views together; the building blocks
   (fonts, glyphs, preferences, materials, geometry, input) live in src/. */
(function () {
  'use strict';

  var Prefs = Zeno.prefs,
    Fonts = Zeno.fonts,
    Glyphs = Zeno.glyphs;
  var clamp = Zeno.util.clamp,
    without = Zeno.util.without,
    same = Zeno.util.sameList,
    pick = Zeno.util.oneOf,
    find = Zeno.util.find;
  var esc = Zeno.dom.escape,
    px = Zeno.dom.px,
    icon = Glyphs.icon,
    badge = Glyphs.badge;

  /* ---------- Fixed data ---------- */
  var WALLPAPER_DIR = 'assets/wallpapers/';
  var CAP = 64,
    SCRIM_Y = 560;
  var FULL = 'La Home contiene 64 app. Rimuovine una prima.',
    LAST = 'Mantieni almeno una app';

  /* TV and PC are always there. Installed apps join APPS when the TV lists them
     (or from the saved Home before that), each under its own platform id. */
  var PRIMARY_APPS = Zeno.builtinApps;
  var PRIMARY = PRIMARY_APPS.map(function (a) {
      return a.id;
    }),
    APPS = PRIMARY_APPS.slice(),
    ALPHA = [];
  var SEED_APPS = 12; // installed apps put on a brand-new Home
  var WALLS = window.ZenoWallpapers || [
    {
      id: 'misty',
      name: 'Misty coast',
      tone: 'light',
      ut: { tr: 'mist', br: 'mist' },
      frostVeil: 0.2
    }
  ];
  WALLS.forEach(function (w) {
    w.ut = w.ut || { tr: 'light', br: 'light' };
    w.frostVeil = w.frostVeil || 0.12;
  });
  var ADAPTIVE_INK = window.ZenoAdaptiveInk || {};
  /* Wallpaper rotation intervals, in minutes (0: no timer). */
  var MODES = [
    { id: 'fixed', name: 'Fisso', min: 0 },
    { id: 'open', name: 'A ogni apertura', min: 0 },
    { id: '5', name: 'Ogni 5 minuti', min: 5 },
    { id: '15', name: 'Ogni 15 minuti', min: 15 },
    { id: '60', name: 'Ogni ora', min: 60 }
  ];
  var catalog = { loading: false, loaded: false, error: null, request: 0, revision: 0 };
  var QA = (window.ZenoQA = { minuteMs: (window.ZenoQA && window.ZenoQA.minuteMs) || 60000 });

  /* Allowed values for every look setting. Typefaces depend on what loaded. */
  var PANEL = ['glass', 'none'],
    DISPLAY = ['icons', 'both', 'text'];
  var LOOK_VALUES = {
    playerPanel: PANEL,
    clockPanel: PANEL,
    weatherPanel: PANEL,
    sourcesPanel: PANEL,
    settingsPanel: PANEL,
    menuTheme: ['auto', 'light', 'dark'],
    gridNames: ['hidden', 'focus'],
    gridStyle: ['brand', 'glass', 'custom'],
    imageQuality: ['1080'],
    colorMode: ['auto', 'wallpaper', 'manual'],
    inkColor: ['pearl', 'white', 'ice', 'mint', 'sand', 'lilac', 'rose', 'ink'],
    bg: ['dark', 'light', 'photo'],
    layout: ['list', 'dock', 'grid'],
    apps: DISPLAY,
    controls: DISPLAY,
    focus: ['type', 'glass'],
    material: ['soft', 'frost', 'tint']
  };
  Object.defineProperty(LOOK_VALUES, 'font', { get: Fonts.choices, enumerable: true });
  var LOOK_NAMES = {
    bg: 'Sfondo',
    layout: 'Layout',
    apps: 'App',
    font: 'Carattere',
    controls: 'Controlli Home',
    focus: 'Selezione',
    material: 'Vetro',
    imageQuality: 'Qualità sfondi online'
  };
  var VALUE_NAMES = {
    brand: 'Ripristina colori',
    custom: 'Colori personali',
    dark: 'Scuro',
    light: 'Chiaro',
    photo: 'Foto',
    list: 'Elenco',
    dock: 'Dock',
    grid: 'Griglia',
    type: 'Testo',
    glass: 'Vetro',
    soft: 'Morbido',
    frost: 'Satinato',
    tint: 'Trasparente',
    icons: 'Icone',
    both: 'Icone e nomi',
    text: 'Testo'
  };
  /* Home controls: [label, glyph]. */
  var UTIL = {
    art: ['Impostazioni Samsung', 'sliders'],
    apps: ['Tutte le app', 'apps'],
    settings: ['Personalizza', 'settings'],
    sources: ['Sorgenti', 'tv']
  };
  var MSG = {
    leave: {
      title: 'Aprire Samsung Home?',
      line: 'Vuoi aprire Samsung Home?',
      note: '',
      actions: [
        ['stay', 'Resta qui'],
        ['samsung', 'Samsung Home']
      ]
    }
  };

  /* ---------- State ----------
     c is the saved configuration; stack holds the open views, Home at the bottom.
     Everything else is session state that is never saved. */
  var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var S = {
    variant: 'B',
    geom: 'broad',
    c: null,
    stack: null,
    sel: null,
    selIdx: 0,
    lastUtil: 0,
    appsFocus: null,
    settingsFocus: 'background',
    appearanceFocus: 'bg',
    detailFocus: {},
    undo: [],
    removedAt: {},
    note: null,
    err: null,
    writes: 0,
    failed: 0,
    log: [],
    logN: 0,
    lastLaunch: null,
    press: null,
    wallShown: null,
    wallPending: null,
    wallError: null,
    shown: null,
    pending: null,
    lookError: null,
    bundleKey: null,
    previewBundle: null,
    reflow: false,
    fontSwitch: false
  };
  var scroll = { first: 0, off: 0, photo: 0 };

  /* The look part of a configuration: everything except the app lists. */
  var LOOK_FIELDS = [
    'desktop',
    'playerPanel',
    'clockPanel',
    'weatherPanel',
    'sourcesPanel',
    'settingsPanel',
    'menuTheme',
    'bg',
    'wall',
    'layout',
    'apps',
    'font',
    'gridNames',
    'gridStyle',
    'cardColors',
    'colorMode',
    'inkColor',
    'controls',
    'focus',
    'material'
  ];
  function lookOf(c) {
    var look = {};
    LOOK_FIELDS.forEach(function (k) {
      look[k] = c[k];
    });
    look.homeLocked = !!c.homeLocked;
    look.imageQuality = '1080';
    return look;
  }
  /* Glass finishes only matter where there is glass over a photograph. */
  function materialApplies(c) {
    c = c || S.c;
    return c.bg === 'photo' && (c.layout === 'dock' || c.layout === 'grid' || c.focus === 'glass');
  }

  /* ---------- Lookups ---------- */
  function app(id) {
    return (
      find(APPS, function (a) {
        return a.id === id;
      }) || ZenoDesktop.definition(id)
    );
  }
  function wall(id) {
    return find(WALLS, function (w) {
      return w.id === id || w.legacy === id;
    });
  }
  function wallIndex(id) {
    return Math.max(
      0,
      Zeno.util.indexWhere(WALLS, function (w) {
        return w.id === id;
      })
    );
  }
  function thumbSrc(w) {
    return w.thumb || WALLPAPER_DIR + w.id + '-thumb.jpg';
  }
  /* Per-photograph CSS hints: frost veil strength, list column tone, quieter dock, misty clock. */
  var VEILS = [0.12, 0.2, 0.3, 0.36, 0.44];
  function wallClasses(w) {
    var veil = VEILS.indexOf(w.frostVeil),
      cls = veil > 0 ? ' fv-' + (veil + 1) : '';
    if (w.listColumn) cls += ' lc-' + w.listColumn;
    if (w.dockQuiet) cls += ' db-quiet';
    if (w.clockMist) cls += ' tl-mist';
    return cls;
  }
  function onHome(id) {
    return S.c.home.indexOf(id) >= 0;
  }

  /* ---------- View stack ---------- */
  function top() {
    return S.stack[S.stack.length - 1];
  }
  /* Leaving Home records the current Home-key stamp, so returning is not mistaken for a new press. */
  function push(entry) {
    if (S.stack && S.stack.length && top().id === 'home') {
      var stamp = homeStamp();
      if (stamp) homeRequestStamp = stamp;
    }
    S.stack.push(entry);
    return entry;
  }
  function pop() {
    if (S.stack.length < 2) return;
    var gone = S.stack.pop();
    if (gone.cancelSearch) gone.cancelSearch();
  }
  function remoteHelp(hint, back) {
    var ok = hint
      ? '<span class="remote-hint"><span class="remote-key">OK</span><span>' + esc(hint) + '</span></span>'
      : '';
    return (
      '<span class="zeno-remote-help">' +
      ok +
      '<span class="remote-hint">' +
      icon('move') +
      '<span>Muovi</span></span>' +
      '<span class="remote-hint">' +
      icon('left') +
      '<span>' +
      esc(back || 'Indietro') +
      '</span></span>' +
      '<span class="remote-hint">' +
      icon('home') +
      '<span>Home</span></span></span>'
    );
  }
  /* A short in-memory log of saves, shown in diagnostics. */
  function log(text) {
    S.log.unshift('#' + ++S.logN + ' ' + text);
    if (S.log.length > 10) S.log.pop();
  }

  function appMark(a, w, h, size) {
    return Glyphs.appMark(a, w, h, size, S.c.bg === 'light');
  }
  function appVisualKey(a) {
    return a.sourceIcon
      ? [a.sourceIcon, a.sourceBadge, a.sourceShowBadge].join('|')
      : (a.logo || '') + '|' + (a.icon || '');
  }
  function smallMark(a) {
    return appMark(a, 56, 44, 36);
  }
  function homeFont() {
    return (S.shown && S.shown.font) || 'manrope';
  }
  function fontRole(id, role, size) {
    return Fonts.role(id, role, size);
  }
  function fontShift(role, size) {
    return Fonts.shift(homeFont(), role, size);
  }
  function textWidth(text, size, weight, spacing, role) {
    return Fonts.width(homeFont(), text, size, weight, spacing, role);
  }
  /* Label sizing. Names are measured in the active face; long names step down one
     size instead of being cut, as long as they fit at the smaller size. */
  var DOCK_LABEL = {
    text: { size: 40, small: 34, weight: 600, room: 264 },
    other: { size: 36, small: 32, weight: 500, room: 280 }
  };
  function dockLabelSpec() {
    return S.c.apps === 'text' ? DOCK_LABEL.text : DOCK_LABEL.other;
  }
  function dockLabelSize(id) {
    var spec = dockLabelSpec();
    return textWidth(app(id).name, spec.size, spec.weight, -0.8, 'primary') > spec.room
      ? spec.small
      : spec.size;
  }
  function reducedDockLabel(id) {
    return S.c.apps !== 'icons' && dockLabelSize(id) === dockLabelSpec().small;
  }
  function actionWidth(text) {
    return clamp(Math.ceil(textWidth(text, 30, 500, -0.3) + 40), 288, 400);
  }
  /* Display-size names in the photo list, with the optical offset that sits the cap
     band in the middle of the plate. Names too wide for 88px step down to 76px. */
  var LIST_ROOM = 992;
  function photoLabel(id) {
    var name = app(id).name,
      size = 88,
      width = textWidth(name, size, 600, -1.8, 'display');
    if (width > LIST_ROOM) {
      size = 76;
      width = textWidth(name, size, 600, -1.8, 'display');
    }
    return {
      size: size,
      top: (size === 76 ? 10.36 : 9.68) + fontShift('display', size),
      width: Math.min(LIST_ROOM, width),
      ellipsis: width > LIST_ROOM
    };
  }
  /* Glass plate width: the label plus padding for the mark, within fixed bounds. */
  function listPlateWidth(id) {
    if (S.c.apps === 'icons') return 144;
    var text = S.c.apps === 'text';
    return clamp(Math.ceil(photoLabel(id).width + (text ? 84 : 184)), text ? 280 : 360, text ? 1076 : 1176);
  }
  function keyed(parent, items, update) {
    Zeno.dom.reconcile(parent, items, update);
  }
  function setContent(el, sig, html) {
    Zeno.dom.content(el, sig, html, catalog.revision);
  }
  var setHTML = Zeno.dom.html,
    attrs = Zeno.dom.target;

  /* ---------- Saved preferences ---------- */
  var safeId = Prefs.isId,
    safeIcon = Prefs.iconPath;
  var prefsEnv = {
    values: LOOK_VALUES,
    cap: CAP,
    primary: PRIMARY,
    modes: MODES.map(function (m) {
      return m.id;
    }),
    find: function (id) {
      return app(id);
    },
    adopt: function (record) {
      APPS.push(withStyle(record));
    },
    wall: wall,
    firstWall: function () {
      return WALLS[0].id;
    },
    desktop: function (raw, home) {
      return ZenoDesktop.normalise(raw, home, ZenoExtras.config().enabled);
    },
    cardColors: function (value) {
      return cleanCardColors(value);
    },
    validInk: function (value) {
      return validInk(value);
    },
    look: function (c) {
      return lookOf(c);
    }
  };
  function serialise(c) {
    return Prefs.pack(c, prefsEnv);
  }
  function saveConfig(c) {
    Prefs.write(serialise(c));
  }
  /* ---------- Configuration and Home edits ---------- */
  function initialise() {
    var saved = Prefs.read();
    S.c = Prefs.restore(saved, prefsEnv);
    var first = next(S.c.home.slice(), S.c.recent.slice());
    S.stack = [{ id: 'home', f: { zone: 'apps', u: 0 } }];
    setSel(S.c.lastApp);
    /* "On every opening" rotation advances once per launch. */
    if (saved && first.mode === 'open') first.wall = WALLS[(wallIndex(first.wall) + 1) % WALLS.length].id;
    try {
      saveConfig(first);
      S.c = first;
      Prefs.storage.ok = true;
    } catch (e) {
      Prefs.storage.ok = false;
    }
  }
  function clearSession() {
    S.undo = [];
    S.removedAt = {};
    S.note = null;
    S.err = null;
  }
  function begin() {
    S.note = null;
  }
  /* A new configuration with the current look and the given app lists. */
  function next(home, recent) {
    var c = lookOf(S.c);
    c.homeVersion = Prefs.VERSION;
    c.home = home;
    c.recent = recent;
    c.lastApp = S.c.lastApp;
    c.mode = S.c.mode;
    c.homeSeeded = !!S.c.homeSeeded;
    return c;
  }
  function snap() {
    return { home: S.c.home.slice(), recent: S.c.recent.slice() };
  }
  function pushRecent(list, id) {
    return [id].concat(without(list, id)).slice(0, Prefs.RECENT_MAX);
  }
  function lockedChange(c) {
    if (!S.c || !S.c.homeLocked || !c.homeLocked) return false;
    return (
      !same(c.home, S.c.home) ||
      JSON.stringify(c.cardColors) !== JSON.stringify(S.c.cardColors) ||
      JSON.stringify(c.desktop) !== JSON.stringify(S.c.desktop)
    );
  }
  /* Every saved change goes through here. A locked Home refuses changes to its apps,
     colours and layout; a storage failure leaves the previous configuration in place. */
  function write(c, label) {
    c.desktop = ZenoDesktop.normalise(c.desktop, c.home, ZenoExtras.config().enabled);
    if (lockedChange(c)) {
      S.note = 'Home bloccata';
      return false;
    }
    try {
      saveConfig(c);
    } catch (e) {
      Prefs.storage.ok = false;
      S.failed++;
      S.err = label;
      log('Not saved: ' + label);
      return false;
    }
    if (c.wall !== S.c.wall || c.mode !== S.c.mode) resetRotation();
    Prefs.storage.ok = true;
    S.c = c;
    S.writes++;
    S.err = null;
    log('Saved: ' + label);
    return true;
  }
  function statusHtml(fallback) {
    if (S.err)
      return (
        '<span class="warn error-chip">' +
        esc('Salvataggio non riuscito. Nessuna modifica applicata.') +
        '</span>'
      );
    return esc(S.note || fallback);
  }

  function ensureSel() {
    var h = S.c.home;
    if (!h.length) {
      S.sel = null;
      return -1;
    }
    var i = h.indexOf(S.sel);
    if (i < 0) {
      i = clamp(S.selIdx, 0, h.length - 1);
      S.sel = h[i];
    }
    S.selIdx = i;
    return i;
  }
  function setSel(id) {
    S.sel = id;
    S.selIdx = S.c.home.indexOf(id);
  }

  /* Edits to the Home list. Each successful edit records an undo step holding the lists
     as they were before it. */
  function refuseLocked() {
    if (!S.c.homeLocked) return false;
    S.note = 'Home bloccata';
    return true;
  }
  function commitHome(home, recent, label, step, before) {
    if (!write(next(home, recent), label)) return false;
    S.undo.push({ label: step, snap: before });
    return true;
  }
  function homeRemove(id) {
    if (refuseLocked()) return false;
    var at = S.c.home.indexOf(id),
      name = app(id).name;
    if (at < 0) return false;
    if (S.c.home.length <= 1) {
      S.note = LAST;
      return false;
    }
    var before = snap(),
      home = without(S.c.home, id);
    if (
      !commitHome(home, pushRecent(S.c.recent, id), 'Remove ' + name + ' from Home', 'Remove ' + name, before)
    )
      return false;
    S.removedAt[id] = at;
    return true;
  }
  /* An app removed in this session goes back where it was; anything else is appended. */
  function homeAdd(id) {
    if (refuseLocked() || onHome(id)) return false;
    var home = S.c.home.slice(),
      name = app(id).name;
    if (home.length >= CAP) {
      S.note = FULL;
      return false;
    }
    var at = S.removedAt.hasOwnProperty(id) ? Math.min(S.removedAt[id], home.length) : home.length,
      before = snap();
    home.splice(at, 0, id);
    return commitHome(home, without(S.c.recent, id), 'Add ' + name + ' to Home', 'Add ' + name, before);
  }
  function homeMove(order, id, before) {
    if (refuseLocked()) return false;
    var name = app(id).name;
    return commitHome(order, S.c.recent.slice(), 'Move ' + name, 'Move ' + name, before);
  }
  function undoLast() {
    var step = S.undo[S.undo.length - 1];
    if (!step) {
      S.note = 'Nessuna modifica da annullare';
      return false;
    }
    if (!write(next(step.snap.home.slice(), step.snap.recent.slice()), 'Undo ' + step.label)) return false;
    S.undo.pop();
    S.note = 'Undone: ' + step.label + '.';
    return true;
  }
  function undoLabel() {
    return S.undo.length ? S.undo[S.undo.length - 1].label : '';
  }
  function undoCaption() {
    var label = undoLabel();
    return label ? 'Undo ' + label.charAt(0).toLowerCase() + label.slice(1) : 'Nessuna modifica da annullare';
  }
  function editStatus(hint, move) {
    if (S.err) return statusHtml('');
    var warning = S.note === FULL || S.note === LAST ? S.note : hint === FULL || hint === LAST ? hint : '';
    if (warning) return '<span class="warn">' + esc(warning) + '</span>';
    return esc(move || hint || S.note || '');
  }

  /* ---------- Launching ---------- */
  /* One platform request at a time; a request that never answers is released after 10s. */
  var busy = false,
    busyTimer = 0;
  function release() {
    busy = false;
    clearTimeout(busyTimer);
    S.press = null;
  }
  function message(title, line, note) {
    push({
      id: 'message',
      msg: 'error',
      content: { title: title, line: line, note: note || '', actions: [['back', 'Indietro']] },
      f: { b: 0 }
    });
  }
  function perform(title, run) {
    if (busy) return;
    busy = true;
    busyTimer = setTimeout(release, 10000);
    run(function (err) {
      release();
      if (err) message(title, err.message || 'Il TV non ha aperto questa schermata.', err.detail || '');
      render();
      syncRotation();
    });
  }
  function launch(id) {
    var a = app(id);
    if (!a || busy) return;
    if (a.widget) {
      activateDesktopWidget(a.widget);
      return;
    }
    if (a.sourceKey) {
      openInput(a.sourceKey);
      return;
    }
    if (id === 'pc') {
      openPCSource();
      return;
    }
    if (onHome(id)) {
      var c = next(S.c.home.slice(), S.c.recent.slice());
      c.lastApp = id;
      write(c, 'Last app');
    }
    S.press = id;
    S.lastLaunch = a.name;
    perform(a.name, function (done) {
      ZenoDevice.launchApp(a.appId, done);
    });
  }

  /* ---------- Installed apps catalogue ---------- */
  /* Personal logo and colour for an app, if this build has any. */
  function withStyle(a) {
    var style = Zeno.appStyle(a.appId);
    a.logo = style.logo || '';
    a.color = style.color || '';
    return a;
  }
  /* Whether a tile shows a drawn mark (logo, input or widget icon) rather than text. */
  function hasMark(a) {
    return !!(a.logo || a.sourceIcon || a.widget);
  }
  /* The colour of an app's card in the "brand" style: personal colour, else the
     main colour of its own icon once measured, else none (the palette decides). */
  function cardColor(a) {
    return a.color || ZenoIconColors.get(a.appId, a.icon) || '';
  }
  function adoptInstalled(entry) {
    var id = entry.appId;
    if (!safeId(id) || ALPHA.indexOf(id) >= 0) return;
    var a = app(id);
    if (!a) {
      a = { id: id };
      APPS.push(a);
    }
    a.appId = entry.appId;
    a.icon = safeIcon(entry.icon);
    a.name = String(entry.name).slice(0, 160);
    withStyle(a);
    ALPHA.push(id);
  }
  /* The first time the TV lists its apps, a brand-new Home gets some of them. */
  function seedHome(entries) {
    if (S.c.homeSeeded) return;
    var c = next(S.c.home.slice(), S.c.recent.slice());
    entries.slice(0, SEED_APPS).forEach(function (entry) {
      if (app(entry.appId) && c.home.indexOf(entry.appId) < 0 && c.home.length < CAP)
        c.home.push(entry.appId);
    });
    c.homeSeeded = true;
    write(c, 'First Home');
  }
  function refreshCatalog() {
    if (catalog.loading) return;
    var request = ++catalog.request;
    catalog.loading = true;
    catalog.error = null;
    ZenoDevice.apps(function (err, entries) {
      if (request !== catalog.request) return;
      catalog.loading = false;
      if (err) {
        catalog.error = err.message || 'Impossibile leggere le app installate.';
        if (!catalog.loaded) ALPHA = [];
        render();
        return;
      }
      var focused = top().id === 'apps' ? ALPHA[top().f.i] : null;
      ALPHA = ['pc'];
      entries.forEach(adoptInstalled);
      seedHome(entries);
      ALPHA.sort(function (x, y) {
        return app(x).name.toLowerCase().localeCompare(app(y).name.toLowerCase());
      });
      catalog.loaded = true;
      catalog.revision++;
      if (focused && top().id === 'apps' && ALPHA.indexOf(focused) >= 0) top().f.i = ALPHA.indexOf(focused);
      norm();
      render();
    });
  }

  /* ---------- Opening views ---------- */
  function utils() {
    return ['sources', 'settings'];
  }
  /* Remote directions for the dock/list: prev/next move along the apps, out goes to
     the controls and inn comes back. The list runs vertically, so they rotate. */
  function axes() {
    return S.c.layout === 'list'
      ? { prev: 'up', next: 'down', out: 'right', inn: 'left' }
      : { prev: 'left', next: 'right', out: 'up', inn: 'down' };
  }
  function utilAction(u) {
    if (u === 'sources') openSources();
    else if (u === 'art') perform('Impostazioni Samsung', ZenoDevice.settings);
    else if (u === 'apps') openApps();
    else openSettings();
  }
  var inputSources = [],
    inputError = '',
    inputLoading = false;
  function openSources() {
    openAppearance('sources');
    inputLoading = true;
    inputError = '';
    ZenoDevice.sources(function (error, list) {
      inputLoading = false;
      inputSources = (list || []).filter(function (source) {
        return source.type === 'HDMI';
      });
      inputError = error ? error.message : '';
      if (top().id === 'appearance' && top().group === 'sources') {
        norm();
        render();
      }
    });
  }
  function addAppsRoute() {
    openEditor('home');
  }
  function openSettings() {
    push({ id: 'settings', f: { id: S.settingsFocus } });
  }
  var GROUP_AXIS = { background: 'bg', layout: 'layout', typography: 'font', focus: 'focus' };
  /* Detail pages reopen on the row last used, else on the current value. */
  function openAppearance(group) {
    var axis = GROUP_AXIS[group],
      action = S.detailFocus[group];
    if (!action)
      action = axis
        ? 'choice.' + axis + '.' + S.c[axis]
        : group === 'rotation'
          ? 'rotation.' + S.c.mode
          : 'samsung.home';
    push({ id: 'appearance', group: group, f: { action: action } });
  }
  function openMessage(key) {
    push({ id: 'message', msg: key, f: { b: 0 } });
  }
  function openApps() {
    var entry = {
      id: 'apps',
      mode: 'browse',
      top: 0,
      f: { zone: 'grid', i: Math.max(0, ALPHA.indexOf(S.appsFocus)), h: 0 }
    };
    push(entry);
    refreshCatalog();
    return entry;
  }
  function openEditor(origin) {
    if (S.c.homeLocked) {
      message('Home bloccata', 'Sblocca la Home in Personalizza per modificarla.');
      return;
    }
    var i = ensureSel();
    clearSession();
    refreshCatalog();
    push({
      id: 'editor',
      origin: origin,
      lifted: null,
      top: 0,
      otherReturn: { id: otherList()[0] || null, index: 0, top: 0 },
      f: { zone: S.c.home.length ? 'home' : 'other', i: Math.max(0, i), part: 'name', h: 1, j: 0 }
    });
  }
  function isSettingsDetail(t) {
    return t.id === 'appearance' || t.id === 'wallpaper';
  }

  var V = {};

  /* ---------- Home ---------- */
  /* Dock and list share one model: a strip of apps plus a row of controls. Only the
     directions differ (see axes()). The card grid has its own handler. */
  function stripKey(t, k, i) {
    var f = t.f,
      h = S.c.home,
      U = utils(),
      x = axes();
    if (f.zone === 'util') {
      f.u = clamp(f.u, 0, U.length - 1);
      if (k === 'ok') {
        S.lastUtil = f.u;
        utilAction(U[f.u]);
        return;
      }
      if (k === x.prev && f.u > 0) f.u--;
      else if (k === x.next && f.u < U.length - 1) f.u++;
      else if (k === x.inn || k === 'back') f.zone = 'apps';
      S.lastUtil = f.u;
      return;
    }
    f.zone = 'apps';
    if (k === x.out) {
      f.zone = 'util';
      f.u = clamp(S.lastUtil, 0, U.length - 1);
    } else if (k === 'back') openMessage('leave');
    else if (k === 'ok') {
      if (h.length) launch(S.sel);
      else addAppsRoute();
    } else if (k === x.prev && i > 0) setSel(h[i - 1]);
    else if (k === x.next && i >= 0 && i < h.length - 1) setSel(h[i + 1]);
  }
  function pointDesktop(t, index) {
    var moving = t.move && t.move.desktop,
      id = ZenoDesktop.ids(moving ? t.move.draft : S.c.desktop, S.c.home)[index];
    if (moving) {
      homeMoveKey(t, 'ok');
      return;
    }
    S.desktopSel = id;
    if (onHome(id)) setSel(id);
    t.f.zone = 'apps';
    launch(id);
  }
  V.home = {
    key: function (t, k) {
      if (t.move) {
        homeMoveKey(t, k);
        return;
      }
      var i = ensureSel();
      if (S.c.layout === 'grid') gridHomeKey(t, k, i, utils());
      else stripKey(t, k, i);
    },
    point: function (t, z, i) {
      if (z === 'desk') {
        pointDesktop(t, i);
        return;
      }
      if (t.move) {
        if (z === 'app') {
          moveHomeTo(t, i);
          homeMoveKey(t, 'ok');
        }
        return;
      }
      if (z === 'util') {
        t.f.zone = 'util';
        t.f.u = i;
        S.lastUtil = i;
      } else if (z === 'app') {
        t.f.zone = 'apps';
        setSel(S.c.home[i]);
      } else if (z === 'empty') t.f.zone = 'apps';
      else return;
      this.key(t, 'ok');
    }
  };

  /* ---------- Wallpaper picker ----------
     Moving through the list previews each photograph behind the menu after a short
     pause; OK applies the one in focus. Picker state lives on the stack entry:
       previewDue    id whose preview is waiting for the pause to end
       applyPending  id that should be applied as soon as its preview is ready
       failedId      id that failed to load or save (failedApply: during apply)
       retryBundle   materials already loaded for a save that failed */
  var PICKER = { rows: 6, pitch: 92, pause: 200 };
  function clearFailure(t) {
    t.failedId = null;
    t.failedApply = false;
    t.retryBundle = null;
  }
  function cancelWallpaperTimer(t) {
    clearTimeout(t.previewTimer);
    t.previewTimer = 0;
    t.previewDue = null;
  }
  function pickerFailed(t, id, applying, bundle) {
    t.applyPending = null;
    t.failedId = id;
    t.failedApply = applying;
    t.retryBundle = bundle || null;
    restoreLook();
    if (!bundle) S.wallError = id;
  }
  function previewMatches(id) {
    return !!S.previewBundle && S.previewBundle.key === bundleKey({ wall: id, material: S.c.material });
  }
  function pickerApply(t, prepared) {
    var w = WALLS[t.i],
      bundle = prepared || S.previewBundle;
    var stillLoading = S.wallPending || t.previewDue || S.wallShown !== w.id || S.wallError;
    if (!prepared && stillLoading) {
      t.applyPending = w.id;
      if (t.previewDue || S.wallPending !== w.id) pickerLoad(t);
      return;
    }
    t.applyPending = null;
    if (w.id === S.c.wall) {
      S.err = null;
      clearFailure(t);
      return;
    }
    if (!bundle || bundle.key !== bundleKey({ wall: w.id, material: S.c.material })) {
      t.applyPending = w.id;
      pickerLoad(t);
      return;
    }
    var c = next(S.c.home.slice(), S.c.recent.slice());
    c.wall = w.id;
    if (!write(c, 'Wallpaper ' + w.name)) {
      pickerFailed(t, w.id, true, bundle);
      return;
    }
    installBundle(bundle, c);
    committedBundle = bundle;
    S.previewBundle = null;
    clearFailure(t);
  }
  function pickerLoad(t) {
    var id = WALLS[t.i].id;
    cancelWallpaperTimer(t);
    showWall(id, function (ok) {
      if (top() !== t || WALLS[t.i].id !== id) return;
      if (!ok) pickerFailed(t, id, t.applyPending === id, null);
      else if (t.applyPending === id) pickerApply(t);
      render();
      syncRotation();
    });
  }
  /* now: load at once instead of after the pause (used by Retry). Online photographs
     are not previewed on focus at all, since that would download them. */
  function pickerFocus(t, index, andApply, now) {
    cancelWallpaperTimer(t);
    cancelLook();
    t.i = index;
    t.f.zone = 'photo';
    var w = WALLS[index],
      id = w.id;
    t.applyPending = andApply ? id : null;
    clearFailure(t);
    S.err = null;
    S.wallError = null;
    if (id === S.c.wall && committedBundle) {
      installBundle(committedBundle, S.c, true);
      S.previewBundle = null;
      if (andApply) pickerApply(t);
      return;
    }
    if (S.wallShown === id && previewMatches(id)) {
      if (andApply) pickerApply(t);
      return;
    }
    if (andApply || now) {
      pickerLoad(t);
      return;
    }
    if (w.download) {
      render();
      return;
    }
    var target = lookOf(S.c);
    target.wall = id;
    S.pending = {
      patch: { wall: id },
      target: target,
      row: 'bg',
      preview: true,
      transient: false,
      deferred: true
    };
    t.previewDue = id;
    t.previewTimer = setTimeout(function () {
      if (top() === t && WALLS[t.i].id === id) pickerLoad(t);
    }, PICKER.pause);
  }
  function pickerRetry(t) {
    t.f.zone = 'photo';
    if (t.retryBundle && t.failedApply) pickerApply(t, t.retryBundle);
    else pickerFocus(t, t.i, t.failedApply, true);
  }
  function closeWallpaper(t) {
    cancelWallpaperTimer(t);
    t.applyPending = null;
    S.err = null;
    pop();
    restoreLook();
    if (top().id === 'appearance' && top().group === 'background')
      detailFocus(top(), { action: 'background.wallpaper' }, 0);
  }
  function openWallpaper() {
    var i = wallIndex(S.c.wall);
    S.err = null;
    S.wallError = null;
    push({
      id: 'wallpaper',
      i: i,
      top: clamp(i - 2, 0, Math.max(0, WALLS.length - PICKER.rows)),
      f: { zone: 'photo' },
      previewTimer: 0,
      previewDue: null,
      applyPending: null,
      failedId: null,
      failedApply: false,
      retryBundle: null
    });
  }
  V.wallpaper = {
    norm: function (t) {
      var last = WALLS.length - 1;
      t.i = clamp(t.i, 0, last);
      if (t.f.zone === 'retry' && !t.failedId) t.f.zone = 'photo';
      t.top = clamp(t.top, t.i - PICKER.rows + 1, t.i);
      t.top = clamp(t.top, 0, Math.max(0, WALLS.length - PICKER.rows));
    },
    key: function (t, k) {
      var zone = t.f.zone;
      if (k === 'back') {
        closeWallpaper(t);
        return;
      }
      if (zone === 'back') {
        if (k === 'ok') closeWallpaper(t);
        else if (k === 'down' || k === 'right') t.f.zone = 'photo';
        return;
      }
      if (zone === 'retry') {
        if (k === 'ok') pickerRetry(t);
        else if (k === 'up' || k === 'left') t.f.zone = 'photo';
        return;
      }
      if (k === 'left' || (k === 'up' && t.i === 0)) {
        t.f.zone = 'back';
        t.applyPending = null;
      } else if (k === 'up') pickerFocus(t, t.i - 1, false);
      else if (k === 'down' && t.i < WALLS.length - 1) pickerFocus(t, t.i + 1, false);
      else if ((k === 'right' || k === 'down') && t.failedId) t.f.zone = 'retry';
      else if (k === 'ok') pickerApply(t, t.retryBundle || undefined);
    },
    point: function (t, z, i) {
      if (z === 'wall-back') closeWallpaper(t);
      else if (z === 'wall-retry') pickerRetry(t);
      else if (z !== 'wall-choice' || i < 0 || i >= WALLS.length) return;
      else if (i === t.i) {
        t.f.zone = 'photo';
        this.key(t, 'ok');
      } else pickerFocus(t, i, true);
    }
  };

  /* ---------- All apps ---------- */
  /* TV and PC are always reachable from Home, so the full list leaves them out. */
  function appsItems() {
    return catalog.error
      ? []
      : ALPHA.filter(function (id) {
          return id !== 'pc' && id !== 'tv';
        });
  }
  function appsHead() {
    return catalog.error ? [['retry', 'Riprova', '', '']] : [['editor', 'App sulla Home', '', 'home']];
  }
  V.apps = {
    sheet: true,
    norm: function (t) {
      var n = appsItems().length;
      t.f.i = clamp(t.f.i, 0, Math.max(0, n - 1));
      if (!n) t.f.zone = 'head';
    },
    key: function (t, k) {
      var f = t.f,
        items = appsItems(),
        n = items.length;
      if (k === 'back') {
        pop();
        return;
      }
      if (f.zone === 'head') {
        if (k === 'down' && n) f.zone = 'grid';
        else if (k === 'ok') {
          if (catalog.error) refreshCatalog();
          else openEditor('apps');
        }
        return;
      }
      if (k === 'ok') {
        if (n) openAppDetail(items[f.i]);
      } else {
        var moved = Zeno.nav.grid(f.i, n, APP_GRID.cols, k);
        if (moved < 0) f.zone = 'head';
        else f.i = moved;
      }
      S.appsFocus = items[f.i] || null;
    },
    point: function (t, z, i) {
      if (z === 'grid') {
        t.f.zone = 'grid';
        t.f.i = i;
      } else if (z !== 'head') return;
      else t.f.zone = 'head';
      this.key(t, 'ok');
    }
  };

  /* ---------- Home editor ----------
     Two columns: the apps on Home (left, reorderable) and everything else (right),
     with recently removed apps first. Focus follows an app across columns, so pressing
     OK twice adds and removes the same app. */
  var EDITOR = { row: 80, sep: 56, view: 752, rows: 9, rowH: 72, origin: 264 };
  var editorScroll = 0;
  function otherGroups() {
    var recent = S.c.recent.filter(function (id) {
      return !onHome(id) && app(id);
    });
    return {
      recent: recent,
      rest: ALPHA.filter(function (id) {
        return !onHome(id) && recent.indexOf(id) < 0;
      })
    };
  }
  function otherList() {
    var o = otherGroups();
    return o.recent.concat(o.rest);
  }
  function editorHomeY(i) {
    return (i - editorScroll) * EDITOR.row;
  }
  function editorOtherY(j) {
    var recent = otherGroups().recent.length,
      y = j * EDITOR.row;
    if (recent) y += EDITOR.sep + (j >= recent ? EDITOR.sep : 0);
    return y;
  }
  function rememberOther(t) {
    t.otherReturn = { id: otherList()[t.f.j] || null, index: t.f.j, top: t.top };
  }
  function returnOther(t) {
    var list = otherList(),
      memory = t.otherReturn,
      at = memory ? list.indexOf(memory.id) : -1;
    t.f.zone = 'other';
    t.f.j = at >= 0 ? at : clamp(memory ? memory.index : 0, 0, Math.max(0, list.length - 1));
    if (memory) t.top = memory.top;
  }
  /* Moving left lands on the Home row closest on screen to the focused right row. */
  function nearestHome(t, count) {
    var target = editorOtherY(t.f.j) - t.top,
      best = 0,
      gap = Infinity;
    for (var i = 0; i < count; i++) {
      var d = Math.abs(editorHomeY(i) - target);
      if (d < gap) {
        gap = d;
        best = i;
      }
    }
    return best;
  }
  function editorLiftedKey(t, k) {
    var f = t.f,
      order = t.lifted.order,
      step = k === 'up' ? -1 : k === 'down' ? 1 : 0,
      to = f.i + step;
    if (step && to >= 0 && to < order.length) {
      var held = order[f.i];
      order[f.i] = order[to];
      order[to] = held;
      f.i = to;
      S.err = null;
    } else if (k === 'ok') editorPlace(t);
    else if (k === 'back') {
      f.i = t.lifted.from;
      t.lifted = null;
      S.err = null;
    }
  }
  function editorHeadKey(t, k, nh, no) {
    var f = t.f;
    if (k === 'left') f.h = Math.max(0, f.h - 1);
    else if (k === 'right') f.h = Math.min(1, f.h + 1);
    else if (k === 'down') {
      if (no) returnOther(t);
      else if (nh) f.zone = 'home';
    } else if (k === 'ok') {
      begin();
      if (f.h === 0) undoLast();
      else closeEditor(t);
    }
  }
  function editorHomeKey(t, k, home, no) {
    var f = t.f;
    if (k === 'up') {
      if (f.i > 0) f.i--;
      else f.zone = 'head';
    } else if (k === 'down') f.i = Math.min(home.length - 1, f.i + 1);
    else if (k === 'right') {
      if (f.part === 'name') f.part = 'remove';
      else if (no) returnOther(t);
    } else if (k === 'left') f.part = 'name';
    else if (k === 'ok') {
      begin();
      if (f.part === 'remove') editorRemove(t, home[f.i]);
      else t.lifted = { id: home[f.i], from: f.i, order: home.slice(), snap: snap() };
    }
  }
  function editorOtherKey(t, k, others, nh) {
    var f = t.f;
    if (k === 'up') {
      if (f.j > 0) {
        f.j--;
        rememberOther(t);
      } else f.zone = 'head';
    } else if (k === 'down') {
      if (f.j < others.length - 1) {
        f.j++;
        rememberOther(t);
      }
    } else if (k === 'left') {
      if (nh) {
        rememberOther(t);
        f.i = nearestHome(t, nh);
        f.zone = 'home';
        f.part = 'name';
      }
    } else if (k === 'ok') {
      begin();
      editorAdd(t, others[f.j]);
    }
  }
  V.editor = {
    sheet: true,
    norm: function (t) {
      var f = t.f,
        nh = (t.lifted ? t.lifted.order : S.c.home).length,
        no = otherList().length;
      f.i = clamp(f.i, 0, Math.max(0, nh - 1));
      f.j = clamp(f.j, 0, Math.max(0, no - 1));
      t.homeTop = clamp(t.homeTop || 0, 0, Math.max(0, nh - EDITOR.rows));
      if (f.zone === 'home') t.homeTop = clamp(t.homeTop, f.i - EDITOR.rows + 1, f.i);
      editorScroll = t.homeTop;
      if (f.zone === 'home' && !nh) f.zone = no ? 'other' : 'head';
      if (f.zone === 'other' && !no) f.zone = nh ? 'home' : 'head';
    },
    key: function (t, k) {
      if (t.lifted) {
        editorLiftedKey(t, k);
        return;
      }
      if (k === 'back') {
        closeEditor(t);
        return;
      }
      var home = S.c.home,
        others = otherList();
      if (t.f.zone === 'head') editorHeadKey(t, k, home.length, others.length);
      else if (t.f.zone === 'home') editorHomeKey(t, k, home, others.length);
      else editorOtherKey(t, k, others, home.length);
    },
    point: function (t, z, i) {
      if (t.lifted) {
        if (z === 'name' && i === t.f.i) this.key(t, 'ok');
        return;
      }
      if (z === 'name' || z === 'remove') {
        t.f.zone = 'home';
        t.f.i = i;
        t.f.part = z;
      } else if (z === 'other') {
        t.f.zone = 'other';
        t.f.j = i;
        rememberOther(t);
      } else if (z === 'head') {
        t.f.zone = 'head';
        t.f.h = i;
      } else return;
      this.key(t, 'ok');
    }
  };
  function editorRemove(t, id) {
    if (!homeRemove(id)) return;
    t.f.zone = 'other';
    t.f.j = otherList().indexOf(id);
    S.note = app(id).name + ' è tra le app rimosse. Premi OK per aggiungerla.';
  }
  function editorAdd(t, id) {
    rememberOther(t);
    if (!homeAdd(id)) return;
    var rest = otherList(),
      at = clamp(t.otherReturn.index, 0, Math.max(0, rest.length - 1));
    t.otherReturn.id = rest[at] || null;
    t.otherReturn.index = at;
    t.f.zone = 'home';
    t.f.i = S.c.home.indexOf(id);
    t.f.part = 'remove';
    S.note = app(id).name + ' è sulla Home, posizione ' + (t.f.i + 1) + '.';
  }
  function editorPlace(t) {
    var held = t.lifted;
    begin();
    if (same(held.order, S.c.home)) {
      t.lifted = null;
      return;
    }
    if (!homeMove(held.order.slice(), held.id, held.snap)) return;
    t.lifted = null;
    S.note = app(held.id).name + ' spostata alla posizione ' + (t.f.i + 1) + '.';
  }
  function closeEditor() {
    clearSession();
    pop();
  }

  function editorHint(t, home) {
    var f = t.f;
    if (catalog.error) return catalog.error;
    if (catalog.loading) return 'Caricamento delle app…';
    if (f.zone === 'head' && f.h === 0) return undoCaption();
    if (f.zone === 'home' && f.part === 'remove')
      return home.length <= 1 ? LAST : app(home[f.i]).name + ' resta installata.';
    return '';
  }
  function fillEditorHome(t, el, home) {
    var f = t.f,
      last = home.length <= 1;
    keyed(
      el.home,
      home.map(function (id) {
        return { key: id, id: id };
      }),
      function (row, it, i) {
        var a = app(it.id),
          here = f.zone === 'home' && i === f.i,
          lifted = !!t.lifted && i === f.i;
        setContent(
          row,
          it.id + '|' + a.name + '|' + appVisualKey(a),
          '<div class="er-name" role="button"><span class="panel-content"><span class="er-num"></span>' +
            smallMark(a) +
            '<span class="er-text">' +
            esc(a.name) +
            '</span><span class="er-move">' +
            icon('updown') +
            '</span></span></div><div class="er-rm" role="button"><span></span></div>'
        );
        row.className = 'er' + (here ? ' is-active' : '') + (lifted ? ' is-lifted' : '');
        row.style.transform = 'translate3d(' + (lifted ? 16 : 0) + 'px,' + editorHomeY(i) + 'px,0)';
        row.style.visibility = i >= t.homeTop && i < t.homeTop + EDITOR.rows ? 'visible' : 'hidden';
        row.querySelector('.er-num').textContent = String(i + 1);
        var name = row.firstChild,
          remove = row.lastChild;
        name.className = 'er-name' + (here && (f.part === 'name' || lifted) ? ' is-focus' : '');
        remove.className =
          'er-rm' + (here && f.part === 'remove' && !lifted ? ' is-focus' : '') + (last ? ' is-limit' : '');
        remove.firstChild.textContent = last ? LAST : 'Rimuovi dalla Home';
        attrs(name, 'name', i, 'editor.move.' + it.id);
        attrs(remove, 'remove', i, 'editor.remove.' + it.id);
      }
    );
    el.origin.className = 'ed-origin' + (t.lifted && t.lifted.from !== f.i ? ' is-on' : '');
    if (t.lifted)
      el.origin.style.transform =
        'translate3d(0,' + (EDITOR.origin + editorHomeY(t.lifted.from) + 16) + 'px,0)';
  }
  /* Right column entries with their y offsets; headings are entries too. */
  function editorOtherEntries(groups) {
    var entries = [],
      y = 0;
    function heading(key, text) {
      entries.push({ key: key, sep: text, y: y });
      y += EDITOR.sep;
    }
    function rows(ids) {
      ids.forEach(function (id) {
        entries.push({ key: id, id: id, y: y });
        y += EDITOR.row;
      });
    }
    if (groups.recent.length) heading('sep-recent', 'Rimosse di recente');
    rows(groups.recent);
    if (groups.recent.length && groups.rest.length) heading('sep-rest', 'Altre app installate');
    rows(groups.rest);
    return { entries: entries, height: y };
  }
  /* Scrolls the right column so the focused row (and its heading, if it opens a group)
     is visible; the window always starts on an entry boundary. */
  function editorOtherTop(t, groups, entries, height) {
    var f = t.f,
      rows = entries.filter(function (e) {
        return !e.sep;
      }),
      firstAfter = function (y) {
        return Zeno.util.find(entries, function (e) {
          return e.y >= y;
        });
      };
    if (f.zone === 'other' && rows.length) {
      var y = rows[f.j].y,
        opensGroup = groups.recent.length && (f.j === 0 || f.j === groups.recent.length);
      t.top = Math.min(t.top, y - (opensGroup ? EDITOR.sep : 0));
      if (y + EDITOR.rowH > t.top + EDITOR.view) {
        var e = firstAfter(y + EDITOR.rowH - EDITOR.view);
        if (e) t.top = e.y;
      }
    }
    var limit = firstAfter(Math.max(0, height - EDITOR.view));
    t.top = clamp(t.top, 0, limit ? limit.y : 0);
  }
  function fillEditorOther(t, el, groups) {
    var f = t.f,
      list = groups.recent.concat(groups.rest),
      full = S.c.home.length >= CAP,
      layout = editorOtherEntries(groups),
      above = false,
      below = false;
    editorOtherTop(t, groups, layout.entries, layout.height);
    keyed(el.other, layout.entries, function (row, it) {
      var end = it.y + (it.sep ? EDITOR.sep : EDITOR.rowH);
      row.style.transform = 'translate3d(0,' + it.y + 'px,0)';
      row.style.visibility = it.y >= t.top && end <= t.top + EDITOR.view ? 'visible' : 'hidden';
      above = above || it.y < t.top;
      below = below || end > t.top + EDITOR.view;
      if (it.sep) {
        setContent(row, 'sep|' + it.sep, esc(it.sep));
        row.className = 'eo-sep';
        return;
      }
      var j = list.indexOf(it.id),
        focus = f.zone === 'other' && j === f.j,
        a = app(it.id);
      setContent(
        row,
        it.id + '|' + a.name + '|' + appVisualKey(a),
        '<span class="panel-content">' +
          smallMark(a) +
          '<span class="eo-text">' +
          esc(a.name) +
          '</span><span class="eo-verb"></span></span>'
      );
      row.querySelector('.eo-verb').innerHTML = focus
        ? '<span class="verb' +
          (full ? ' is-off' : '') +
          '">' +
          (full ? 'Home completa' : 'Aggiungi alla Home') +
          '</span>'
        : '';
      row.className = 'eo' + (focus ? ' is-focus' : '');
      row.setAttribute('role', 'button');
      attrs(row, 'other', j, 'editor.add.' + it.id);
    });
    el.other.style.transform = 'translate3d(0,' + -t.top + 'px,0)';
    el.ov.className = 'ed-other-view';
    el.otherBefore.className = 'row-cue editor-before' + (above ? ' is-on' : '');
    el.otherAfter.className = 'row-cue editor-after' + (below ? ' is-on' : '');
  }
  function fillEditor(t, el) {
    var f = t.f,
      home = t.lifted ? t.lifted.order : S.c.home;
    setHTML(
      el.sub,
      editStatus(
        editorHint(t, home),
        t.lifted ? 'Moving ' + app(t.lifted.id).name + '. OK conferma, Indietro annulla.' : ''
      )
    );
    setHTML(
      el.head,
      headButtons(
        [
          ['undo', 'Annulla', S.undo.length ? '' : 'is-idle', 'undo'],
          ['done', 'Fine', '', 'check']
        ],
        f.zone === 'head' ? f.h : -1,
        'editor'
      )
    );
    el.head.className = 's-head' + (f.zone === 'head' ? ' is-awake' : '');
    setHTML(el.lh, 'Sulla Home <span class="s-count">' + S.c.home.length + ' / ' + CAP + '</span>');
    el['break'].className = 'ed-order-break';
    el['break'].style.top = EDITOR.origin + EDITOR.rows * EDITOR.row + 'px';
    fillEditorHome(t, el, home);
    fillEditorOther(t, el, otherGroups());
  }

  /* ---------- Settings, Layout and messages ---------- */
  function mode() {
    return (
      find(MODES, function (m) {
        return m.id === S.c.mode;
      }) || MODES[0]
    );
  }
  var SETTINGS_CATEGORIES = [
    {
      id: 'home',
      name: 'Disposizione',
      icon: 'home',
      title: 'Disposizione',
      note: 'Griglia e contenuti.',
      cards: ['desktopgrid', 'layout', 'editor', 'homelock']
    },
    {
      id: 'appearance',
      name: 'Aspetto',
      icon: 'art',
      title: 'Aspetto',
      note: 'Sfondi, colori e vetro.',
      cards: ['background', 'cards', 'focus', 'typography']
    },
    {
      id: 'widgets',
      name: 'Widget',
      icon: 'sliders',
      title: 'Widget',
      note: 'Aggiungi contenuti alla Home.',
      cards: ['desktopwidgets']
    },
    {
      id: 'applications',
      name: 'Applicazioni',
      icon: 'apps',
      title: 'Applicazioni',
      note: 'Gestisci le app installate.',
      cards: ['manager', 'storage']
    },
    {
      id: 'devices',
      name: 'Dispositivi',
      icon: 'tv',
      title: 'Dispositivi',
      note: 'Sorgenti e telecomando.',
      cards: ['sources', 'inputs', 'remote']
    },
    {
      id: 'system',
      name: 'Sistema',
      icon: 'settings',
      title: 'Sistema',
      note: 'TV e connessioni.',
      cards: ['samsung', 'connection', 'language', 'about']
    }
  ];
  function settingsRows() {
    return [
      {
        id: 'desktopgrid',
        label: 'Dimensioni griglia',
        value: S.c.desktop.columns + ' × ' + S.c.desktop.rows,
        icon: 'apps'
      },
      {
        id: 'desktopwidgets',
        label: 'Aggiungi widget',
        value: 'Mostra o nascondi i widget',
        icon: 'home'
      },
      { id: 'widgetcards', label: 'Fondo dei widget', value: 'Vetro o senza fondo', icon: 'art' },
      {
        id: 'clockstyle',
        label: 'Orologio',
        value: 'Stile, secondi e fuso orario',
        icon: 'sliders'
      },
      { id: 'weather', label: 'Meteo', value: 'Località e visualizzazione', icon: 'art' },
      { id: 'player', label: 'Musica', value: 'Sei brani originali, solo su richiesta', icon: 'apps' },
      {
        id: 'background',
        label: 'Sfondo e colori',
        value: S.c.bg === 'photo' ? wall(S.c.wall).name : VALUE_NAMES[S.c.bg],
        icon: 'art'
      },
      {
        id: 'layout',
        label: 'Layout della Home',
        value: VALUE_NAMES[S.c.layout] + ' · ' + S.c.home.length + ' app',
        icon: 'apps'
      },
      { id: 'typography', label: 'Tipografia', value: Fonts.name(S.c.font), icon: 'sliders' },
      {
        id: 'focus',
        label: S.c.layout === 'list' ? 'Vetro e selezione' : 'Vetro',
        value: (S.c.layout === 'list' ? VALUE_NAMES[S.c.focus] + ' · ' : '') + VALUE_NAMES[S.c.material],
        icon: 'sliders'
      },
      {
        id: 'editor',
        label: 'App sulla Home',
        value: 'Aggiungi, riordina e rimuovi',
        icon: 'arrange'
      },
      {
        id: 'homelock',
        label: 'Blocca Home',
        value: S.c.homeLocked ? 'Bloccata' : 'Modificabile',
        icon: 'home'
      },
      {
        id: 'extras',
        label: 'Widget della Home',
        value: 'Orologio, meteo e movimento',
        icon: 'art'
      },
      {
        id: 'manager',
        label: 'App installate',
        value: 'Informazioni, spazio e gestione',
        icon: 'apps'
      },
      {
        id: 'storage',
        label: 'Spazio e memoria',
        value: 'Archivio TV e cache di Zeno',
        icon: 'sliders'
      },
      { id: 'sources', label: 'Sorgenti', value: 'Antenna e ingressi', icon: 'tv' },
      {
        id: 'inputs',
        label: 'Configura sorgenti',
        value: 'Nomi, Home e Wake on LAN',
        icon: 'sliders'
      },
      {
        id: 'cards',
        label: 'Card della griglia',
        value: Object.keys(S.c.cardColors).length ? 'Colori personali' : VALUE_NAMES[S.c.gridStyle],
        icon: 'apps'
      },
      { id: 'language', label: 'Lingua', value: ZenoI18n.languageName(), icon: 'sliders' },
      { id: 'remote', label: 'Telecomando', value: 'Tasti e assistenti vocali', icon: 'sliders' },
      { id: 'pc', label: 'PC', value: 'HDMI e Wake on LAN', icon: 'tv' },
      {
        id: 'samsung',
        label: 'Impostazioni Samsung',
        value: 'Immagine, audio, rete e Samsung Home',
        icon: 'settings'
      },
      {
        id: 'connection',
        label: 'Connessione TV',
        value: 'Developer Mode e host di controllo',
        icon: 'sliders'
      },
      {
        id: 'about',
        label: 'Informazioni di sistema',
        value: 'TV, software e schermo',
        icon: 'home'
      }
    ];
  }
  function settingsCategory(t) {
    return (
      SETTINGS_CATEGORIES.filter(function (c) {
        return c.id === t.category;
      })[0] || SETTINGS_CATEGORIES[0]
    );
  }
  V.settings = {
    sheet: true,
    norm: function (t) {
      if (!t.category) t.category = S.settingsCategory || 'home';
      var c = settingsCategory(t);
      t.f.zone = t.f.zone || 'sidebar';
      t.f.i = clamp(t.f.i || 0, 0, c.cards.length - 1);
    },
    key: function (t, k) {
      var ci = SETTINGS_CATEGORIES.indexOf(settingsCategory(t)),
        cards = settingsCategory(t).cards;
      if (k === 'back') {
        pop();
        return;
      }
      if (t.f.zone === 'sidebar') {
        if (k === 'up') ci = Math.max(0, ci - 1);
        if (k === 'down') ci = Math.min(SETTINGS_CATEGORIES.length - 1, ci + 1);
        if (k === 'right' || k === 'ok') {
          t.f.zone = 'cards';
          t.f.i = 0;
        } else {
          t.category = SETTINGS_CATEGORIES[ci].id;
          S.settingsCategory = t.category;
          t.f.i = 0;
        }
      } else {
        if (k === 'left') {
          if (t.f.i % 2) t.f.i--;
          else t.f.zone = 'sidebar';
        }
        if (k === 'right' && t.f.i % 2 === 0 && t.f.i + 1 < cards.length) t.f.i++;
        if (k === 'up') t.f.i = Math.max(0, t.f.i - 2);
        if (k === 'down') t.f.i = Math.min(cards.length - 1, t.f.i + 2);
        if (k === 'ok') settingsOk(cards[t.f.i]);
      }
    },
    point: function (t, z, i, id) {
      if (z === 'category') {
        t.category = id;
        S.settingsCategory = id;
        t.f.zone = 'sidebar';
        t.f.i = 0;
      } else if (z === 'settingcard') {
        t.f.zone = 'cards';
        t.f.i = i;
        settingsOk(id);
      }
    }
  };
  function settingsOk(id) {
    if (id === 'editor') openEditor('settings');
    else if (id === 'manager') openApps();
    else if (id === 'sources') openSources();
    else if (id === 'pc') openInputSettings(ZenoSources.pcKey());
    else {
      openAppearance(id);
      if (id === 'connection') ZenoControl.status();
      if (id === 'updates') ZenoControl.checkUpdates();
      if (id === 'storage' || id === 'about') loadSystemStats();
    }
  }
  var DETAIL_NAMES = {
    widgetsize: 'Dimensione del widget',
    desktopgrid: 'Dimensioni griglia',
    desktopwidgets: 'Contenuti della Home',
    clockhub: 'Orologio',
    calendar: 'Calendario',
    timer: 'Timer',
    timeredit: 'Configura timer',
    timerquick: 'Durate rapide',
    worldclock: 'Fusi orari',
    handcolor: 'Colore dei secondi',
    player: 'Musica',
    background: 'Sfondo e colori',
    layout: 'Layout',
    typography: 'Tipografia',
    focus: 'Selezione',
    homelock: 'Blocca Home',
    rotation: 'Rotazione',
    samsung: 'Samsung',
    sources: 'Sorgenti',
    extras: 'Widget della Home',
    weather: 'Meteo',
    weatherinterval: 'Aggiornamento meteo',
    clockstyle: 'Orologio',
    widgetcards: 'Fondo dei widget',
    locationresults: 'Risultati località',
    remote: 'Telecomando',
    remotekeys: 'Tasti configurabili',
    remotetarget: 'Azione del tasto',
    location: 'Località meteo',
    pc: 'PC',
    pcnetwork: 'Wake on LAN',
    connection: 'Connessione TV',
    updates: 'Aggiornamenti YouTube',
    colors: 'Colori del launcher',
    storage: 'Spazio e memoria',
    about: 'Informazioni di sistema',
    inputs: 'Configura sorgenti',
    sourceprofile: 'Dispositivo',
    sourceappearance: 'Icona e sigla',
    sourceicon: 'Icona della sorgente',
    sourcenetwork: 'Wake on LAN',
    cards: 'Card della griglia',
    cardapps: 'Colori delle singole card',
    cardcolor: 'Colore della card',
    language: 'Lingua'
  };
  function choice(axis, value, disabled) {
    return {
      action: axis === 'mode' ? 'rotation.' + value : 'choice.' + axis + '.' + value,
      axis: axis,
      value: value,
      disabled: !!disabled,
      label:
        axis === 'menuTheme'
          ? { auto: 'Automatico', light: 'Chiaro', dark: 'Scuro' }[value]
          : axis === 'gridNames'
            ? { hidden: 'Nascondi', focus: 'Solo selezionata' }[value]
            : axis === 'colorMode'
              ? {
                  auto: 'Automatico · contrasto',
                  wallpaper: 'In armonia con lo sfondo',
                  manual: 'Colore personale'
                }[value]
              : axis === 'inkColor'
                ? INK_COLORS[value].name
                : axis === 'imageQuality'
                  ? { 720: '720p', 1080: '1080p', 1440: '2K · 1440p', 2160: '4K · 2160p' }[value]
                  : axis === 'font'
                    ? Fonts.name(value)
                    : axis === 'mode'
                      ? MODES.filter(function (m) {
                          return m.id === value;
                        })[0].name
                      : value === 'both'
                        ? 'Entrambi'
                        : VALUE_NAMES[value]
    };
  }
  function detailSections(t) {
    var flat = S.c.bg !== 'photo',
      inactive = !materialApplies();
    function options(axis, values, disabled) {
      return values.map(function (value) {
        return choice(axis, value, disabled);
      });
    }
    var pc = ZenoControl.config(),
      developer = ZenoControl.developer(),
      update = ZenoControl.update();
    var widgetConfig = ZenoWidgets.config();
    if (t.group === 'widgetsize')
      return [
        {
          id: 'widgetsize',
          title: app(t.cardApp).name,
          items: [
            { id: 'full', name: 'Standard' },
            { id: 'half', name: 'Metà' },
            { id: 'quarter', name: 'Compatto' }
          ].map(function (size) {
            return {
              action: 'widget.size.' + size.id,
              label: size.name,
              selected: S.c.desktop.sizes[t.cardApp] === size.id,
              option: true,
              disabled: S.c.homeLocked
            };
          })
        }
      ];
    if (t.group === 'desktopgrid')
      return [
        {
          id: 'desktopgrid',
          title: 'Colonne × righe',
          items: [
            [3, 2],
            [4, 2],
            [4, 3],
            [5, 3]
          ]
            .map(function (size) {
              return {
                action: 'desktop.size.' + size.join('x'),
                label: size[0] + ' × ' + size[1],
                selected: S.c.desktop.columns === size[0] && S.c.desktop.rows === size[1],
                option: true,
                disabled: S.c.homeLocked
              };
            })
            .concat([
              {
                action: 'desktop.peeks',
                label: 'Anteprime adiacenti',
                description: 'Mostra le card oltre il bordo',
                selected: S.c.desktop.peeks,
                option: true,
                disabled: S.c.homeLocked
              }
            ]),
          reason: 'Gli elementi oltre il bordo restano raggiungibili con le frecce.'
        }
      ];
    if (t.group === 'desktopwidgets')
      return [
        {
          id: 'desktopwidgets',
          title: 'Widget sulla griglia',
          items: ZenoDesktop.widgets.map(function (w) {
            return {
              action: 'desktop.widget.' + w.widget,
              label: w.name,
              description: S.c.desktop.widgets[w.widget] ? 'Visibile' : 'Nascosto',
              selected: S.c.desktop.widgets[w.widget],
              option: true,
              disabled: S.c.homeLocked
            };
          }),
          reason: 'Tieni premuto OK sulla Home per spostare o personalizzare una card.'
        },
        {
          id: 'desktopwidgetsMusic',
          title: '',
          items: [{ action: 'widget.open.player', label: 'Musica', description: ZenoWidgets.player().title }]
        }
      ];
    if (t.group === 'clockhub')
      return [
        {
          id: 'clockhub',
          title: '',
          items: [
            { action: 'widget.open.calendar', label: 'Calendario' },
            {
              action: 'widget.open.timer',
              label: 'Timer',
              description: widgetConfig.timer ? 'In corso' : 'Disattivo'
            },
            { action: 'widget.open.worldclock', label: 'Fusi orari' },
            { action: 'widget.open.clockstyle', label: 'Configura orologio' }
          ]
        }
      ];
    if (t.group === 'calendar') return calendarSections(t);
    if (t.group === 'worldclock')
      return [
        {
          id: 'worldclock',
          title: 'Fuso dell’orologio',
          items: ZenoWidgets.zones.map(function (z) {
            return {
              action: 'widget.zone.' + z.id,
              label: z.name,
              description: ZenoWidgets.time(new Date(), z.id),
              selected: widgetConfig.zone === z.id,
              option: true
            };
          })
        }
      ];
    if (t.group === 'timer')
      return [
        {
          id: 'activeTimer',
          title: '',
          items: [
            {
              info: true,
              label: widgetConfig.timerLabel || 'Timer',
              description: widgetConfig.timer ? timerRemaining() : 'Nessun timer'
            }
          ]
            .concat(
              widgetConfig.timerNote
                ? [{ info: true, label: 'Nota', description: widgetConfig.timerNote }]
                : []
            )
            .concat([
              { action: 'timer.new', label: 'Nuovo timer' },
              {
                action: 'widget.timer.stop',
                label: 'Annulla timer',
                disabled: !widgetConfig.timer
              },
              { action: 'widget.open.timerquick', label: 'Durate rapide' }
            ])
        },
        {
          id: 'savedTimers',
          title: 'Timer salvati',
          items: widgetConfig.timers.length
            ? widgetConfig.timers.map(function (preset) {
                return {
                  action: 'timer.edit.' + preset.id,
                  label: preset.name,
                  description: timerDuration(preset.seconds)
                };
              })
            : [
                {
                  info: true,
                  label: 'Nessun timer salvato',
                  description: 'Crea un timer e scegli Salva timer.'
                }
              ]
        }
      ];
    if (t.group === 'timerquick')
      return [
        {
          id: 'timerquick',
          title: '',
          items: [5, 10, 15, 30, 60].map(function (n) {
            return { action: 'widget.timer.' + n, label: n + ' min' };
          })
        }
      ];
    if (t.group === 'timeredit') {
      var draft = timerDraft(t),
        savedTimer = widgetConfig.timers.filter(function (v) {
          return v.id === draft.id;
        })[0];
      return [
        {
          id: 'timeredit',
          title: '',
          items: [
            { action: 'timer.field.name', label: 'Nome', description: draft.name },
            {
              action: 'timer.field.minutes',
              label: 'Minuti',
              description: String(Math.floor(draft.seconds / 60))
            },
            {
              action: 'timer.field.seconds',
              label: 'Secondi',
              description: String(draft.seconds % 60)
            },
            { action: 'timer.field.note', label: 'Nota', description: draft.note || 'Facoltativa' },
            {
              action: 'timer.start',
              label: 'Avvia timer',
              description: timerDuration(draft.seconds),
              disabled: !draft.seconds
            },
            {
              action: 'timer.save',
              label: 'Salva timer',
              disabled: !draft.seconds || (!draft.id && widgetConfig.timers.length >= 12)
            },
            { action: 'timer.delete', label: 'Elimina timer salvato', disabled: !savedTimer }
          ],
          reason: 'Fino a 24 ore · 12 timer salvati · avviso con Zeno aperto.'
        }
      ];
    }
    if (t.group === 'handcolor')
      return [
        {
          id: 'handcolor',
          title: '',
          items: [
            {
              action: 'widget.hand.wallpaper',
              label: 'Automatico · sfondo',
              description: 'Accento dello sfondo corrente',
              colorSwatch: wallpaperAccent(wall(S.c.wall)),
              selected: widgetConfig.handColor === 'wallpaper',
              option: true
            },
            {
              action: 'widget.hand.auto',
              label: 'Segui il tema',
              description: 'Usa il colore del testo della Home',
              selected: widgetConfig.handColor === 'auto',
              option: true
            },
            {
              action: 'widget.hand.custom',
              label: 'Codice esadecimale',
              description: secondsSwatch()
            }
          ].concat(
            [
              '#000000',
              '#ffffff',
              '#888888',
              '#ff5b52',
              '#ffad42',
              '#f5d85a',
              '#35c46a',
              '#6fd6b3',
              '#3478f6',
              '#69b7ff',
              '#b49bff',
              '#f6a5cd'
            ].map(function (color, i) {
              return {
                action: 'widget.hand.' + color,
                label: [
                  'Nero',
                  'Bianco',
                  'Grigio',
                  'Rosso',
                  'Arancio',
                  'Giallo',
                  'Verde',
                  'Menta',
                  'Blu',
                  'Azzurro',
                  'Lilla',
                  'Rosa'
                ][i],
                colorSwatch: color,
                selected: widgetConfig.handColor === color,
                option: true
              };
            })
          )
        }
      ];
    if (t.group === 'player')
      return [
        {
          id: 'player',
          title: 'Musica',
          items: [
            {
              action: 'widget.audio',
              label:
                (ZenoWidgets.player().playing ? 'Pausa' : 'Riproduci') + ' · ' + ZenoWidgets.player().title,
              description: ZenoWidgets.player().note + ' · in loop'
            }
          ]
        },
        {
          id: 'playerList',
          title: 'Brani',
          items: ZenoWidgets.tracks().map(function (track) {
            return {
              action: 'widget.track.' + track.id,
              label: track.title,
              description: track.note,
              selected: ZenoWidgets.player().id === track.id,
              option: true
            };
          })
        },
        {
          id: 'playerSeek',
          title: '',
          horizontal: true,
          items: [
            { action: 'widget.media.MediaRewind', label: '−10 s' },
            { action: 'widget.media.MediaFastForward', label: '+10 s' }
          ]
        },
        {
          id: 'playerTracks',
          title: '',
          horizontal: true,
          items: [
            {
              action: 'widget.media.MediaTrackPrevious',
              label: 'Precedente',
              disabled: ZenoWidgets.player().tracks < 2
            },
            {
              action: 'widget.media.MediaTrackNext',
              label: 'Successivo',
              disabled: ZenoWidgets.player().tracks < 2
            }
          ],
          reason: 'Play/Pausa e avanzamento dal telecomando.'
        }
      ];
    if (t.group === 'colors')
      return [
        {
          id: 'menuTheme',
          title: 'Tema dei menu',
          horizontal: true,
          items: options('menuTheme', ['auto', 'light', 'dark'])
        },
        {
          id: 'colorMode',
          title: 'Testo e icone della Home',
          items: options('colorMode', ['auto', 'wallpaper', 'manual'])
        },
        {
          id: 'inkColor',
          title: 'Palette',
          horizontal: true,
          items: options('inkColor', ['pearl', 'ice', 'mint', 'sand'])
        },
        {
          id: 'inkColor2',
          title: '',
          horizontal: true,
          items: options('inkColor', ['white', 'lilac', 'rose', 'ink'])
        },
        {
          id: 'custom',
          title: '',
          items: [
            {
              action: 'color.custom',
              label: 'Colore personalizzato',
              description: S.c.inkColor.charAt(0) === '#' ? S.c.inkColor : 'Inserisci un codice esadecimale'
            }
          ],
          reason:
            'Automatico privilegia il contrasto. Armonia sceglie un tono adatto ogni volta che cambia lo sfondo.'
        }
      ];
    if (t.group === 'storage')
      return [
        {
          id: 'storage',
          title: systemLoading ? 'Aggiornamento…' : systemError || 'Informazioni lette dal TV',
          items: [
            {
              info: true,
              label: 'Memoria RAM',
              description:
                systemData && systemData.memory
                  ? statValue(Math.max(0, systemData.memory.total - systemData.memory.available)) +
                    ' utilizzati · ' +
                    statValue(systemData.memory.available) +
                    ' disponibili'
                  : 'Non disponibile'
            },
            {
              info: true,
              label: 'Spazio del TV',
              description:
                systemData && systemData.storage.length
                  ? statValue(systemData.storage[0].availableCapacity) +
                    ' disponibili su ' +
                    statValue(systemData.storage[0].capacity)
                  : 'Non disponibile'
            },
            { action: 'system.refresh', label: 'Aggiorna informazioni' },
            {
              action: 'cache.clear',
              label: 'Pulisci cache sfondi',
              description:
                systemData && systemData.cache
                  ? statValue(systemData.cache.bytes) + ' · lo sfondo attuale viene conservato'
                  : 'Cache locale di Zeno TV'
            }
          ]
        }
      ];
    if (t.group === 'about')
      return [
        {
          id: 'about',
          title: 'Zeno TV · 1.0.0',
          items: [{ action: 'system.refresh', label: 'Aggiorna informazioni' }].concat(systemInfoItems())
        }
      ];
    if (t.group === 'homelock')
      return [
        {
          id: 'homelock',
          title: 'Modifiche alla Home',
          items: [
            {
              action: 'home.lock.off',
              label: 'Modificabile',
              selected: !S.c.homeLocked,
              option: true
            },
            { action: 'home.lock.on', label: 'Bloccata', selected: S.c.homeLocked, option: true }
          ],
          reason:
            'Il blocco protegge ordine, icone e presenza sulla Home. App, sorgenti e Wake on LAN restano utilizzabili.'
        }
      ];
    if (t.group === 'language')
      return [
        {
          id: 'language',
          title: 'Lingua dell’interfaccia',
          items: ZenoI18n.languages.map(function (l) {
            return {
              action: 'language.' + l.id,
              label: l.name,
              selected: ZenoI18n.language() === l.id,
              option: true
            };
          })
        }
      ];
    if (t.group === 'cards')
      return [
        {
          id: 'cardMaterial',
          title: '',
          items: [{ action: 'cards.glass', label: 'Vetro', description: VALUE_NAMES[S.c.material] }]
        },
        {
          id: 'gridStyle',
          title: 'Colori predefiniti',
          items: [
            {
              action: 'cards.auto',
              label: 'Ripristina colori',
              description: 'Colori automatici per tutte le card',
              selected: S.c.gridStyle === 'brand' && !Object.keys(S.c.cardColors).length,
              option: true,
              disabled: S.c.homeLocked
            },
            {
              action: 'choice.gridStyle.glass',
              axis: 'gridStyle',
              value: 'glass',
              label: 'Vetro neutro',
              description: 'Sfondo senza tinta per le card non personalizzate'
            }
          ]
        }
      ];
    if (t.group === 'cardapps')
      return [
        {
          id: 'cardapps',
          title: S.c.homeLocked ? 'Home bloccata' : 'App sulla Home',
          items: (S.c.layout === 'grid' ? ZenoDesktop.ids(S.c.desktop, S.c.home) : S.c.home).map(
            function (id) {
              return {
                action: 'card.configure.' + id,
                label: app(id).name,
                disabled: S.c.homeLocked
              };
            }
          )
        }
      ];
    if (t.group === 'cardcolor' && S.c.homeLocked)
      return [
        {
          id: 'locked',
          title: 'Home bloccata',
          items: [
            {
              info: true,
              label: 'Home bloccata',
              description: 'Sblocca la Home in Personalizza per modificarla.'
            }
          ]
        }
      ];
    if (t.group === 'cardcolor') {
      var savedTint = S.c.cardColors[t.cardApp],
        colorRows = [
          {
            id: 'cardcolor',
            title: app(t.cardApp).name,
            items: [
              {
                action: 'card.color.default',
                label: 'Segui stile griglia',
                description: 'Mantiene lo stile generale scelto per le card',
                selected: !savedTint,
                option: true
              },
              {
                action: 'card.color.auto',
                label: 'Automatico',
                description: 'Colore associato all’app',
                selected: savedTint === 'auto',
                option: true
              },
              {
                action: 'card.color.glass',
                label: 'Vetro neutro',
                selected: savedTint === 'glass',
                option: true
              },
              {
                action: 'card.custom',
                label: 'Colore personalizzato',
                description:
                  savedTint && savedTint.charAt(0) === '#' ? savedTint : 'Scegli un colore esadecimale'
              }
            ]
          }
        ],
        colorKeys = Object.keys(CARD_COLORS);
      for (var cci = 0; cci < colorKeys.length; cci += 3)
        colorRows.push({
          id: 'cardpalette' + cci,
          title: cci === 0 ? 'Palette' : '',
          horizontal: true,
          items: colorKeys.slice(cci, cci + 3).map(function (k) {
            return {
              action: 'card.color.' + k,
              label: CARD_COLORS[k].name,
              colorSwatch: cardHex(CARD_COLORS[k].rgb),
              selected: savedTint === k,
              option: true
            };
          })
        });
      return colorRows;
    }
    if (t.group === 'inputs')
      return [
        {
          id: 'inputs',
          title: 'Profili salvati in Zeno TV',
          items: ZenoSources.all(inputSources).map(function (p) {
            return {
              action: 'input.configure.' + p.key,
              label: p.name,
              description: p.key.replace('-', ' ') + (onHome(ZenoSources.id(p.key)) ? ' · Sulla Home' : ''),
              sourceIcon: p.icon,
              sourceBadge: p.badge,
              sourceShowBadge: p.showBadge
            };
          })
        }
      ];
    if (t.group === 'sourceprofile') {
      var profile = ZenoSources.get(t.sourceKey),
        homeId = ZenoSources.id(t.sourceKey);
      return [
        {
          id: 'input',
          title: profile.type + ' ' + profile.number,
          items: [
            { action: 'input.open', label: 'Apri sorgente' },
            {
              action: 'edit.sourceName',
              label: 'Nome del dispositivo',
              description: profile.name,
              disabled: S.c.homeLocked
            },
            {
              action: 'input.appearance',
              label: 'Icona e sigla',
              description: ZenoSourceIcons.get(profile.icon).name + ' · ' + profile.badge,
              sourceIcon: profile.icon,
              sourceBadge: profile.badge,
              sourceShowBadge: profile.showBadge,
              disabled: S.c.homeLocked
            },
            {
              action: 'input.home',
              label: onHome(homeId) ? 'Rimuovi dalla Home' : 'Aggiungi alla Home',
              disabled: S.c.homeLocked
            },
            {
              action: 'input.network',
              label: 'Wake on LAN',
              description: profile.mac || 'Non configurato'
            }
          ]
        }
      ];
    }
    if (t.group === 'sourceappearance') {
      var visual = ZenoSources.get(t.sourceKey);
      return [
        {
          id: 'sourceappearance',
          title: visual.name,
          items: [
            {
              action: 'input.icon',
              label: 'Icona',
              description: ZenoSourceIcons.get(visual.icon).name,
              sourceIcon: visual.icon,
              sourceBadge: visual.badge,
              sourceShowBadge: visual.showBadge
            },
            { action: 'edit.sourceBadge', label: 'Sigla nell’icona', description: visual.badge },
            {
              action: 'input.badge.toggle',
              label: 'Mostra sigla',
              description: visual.showBadge ? 'Attiva' : 'Disattiva',
              selected: visual.showBadge,
              option: true
            }
          ],
          reason:
            'Fino a 6 caratteri, per esempio PC, PS5 o HDMI 1. La sigla resta leggibile anche senza il nome sotto la card.'
        }
      ];
    }
    if (t.group === 'sourceicon') {
      var iconProfile = ZenoSources.get(t.sourceKey),
        iconRows = [];
      for (var si = 0; si < ZenoSourceIcons.all.length; si += 3)
        iconRows.push({
          id: 'sourceicons' + si,
          title: si === 0 ? 'Scegli il simbolo del dispositivo' : '',
          horizontal: true,
          items: ZenoSourceIcons.all.slice(si, si + 3).map(function (symbol) {
            return {
              action: 'input.icon.' + symbol.id,
              label: symbol.name,
              selected: iconProfile.icon === symbol.id,
              option: true,
              sourceIcon: symbol.id,
              sourceBadge: symbol.badge,
              sourceShowBadge: true
            };
          })
        });
      return iconRows;
    }
    if (t.group === 'sourcenetwork') {
      var network = ZenoSources.get(t.sourceKey);
      return [
        {
          id: 'sourcenetwork',
          title: network.name,
          items: [
            {
              action: 'edit.sourceMac',
              label: 'Indirizzo MAC',
              description: network.mac || 'Da configurare'
            },
            {
              action: 'edit.sourceIp',
              label: 'Indirizzo IP',
              description: network.ip || 'Da configurare'
            },
            {
              action: 'edit.sourceBroadcast',
              label: 'Indirizzo broadcast',
              description: network.broadcast
            },
            { action: 'edit.sourcePort', label: 'Porta UDP', description: String(network.port) },
            { action: 'input.wol', label: 'Invia segnale WoL', disabled: !network.mac }
          ],
          reason:
            'Un click apre la sorgente. OK premuto apre il menu WoL. Il segnale parte solo quando lo scegli.'
        }
      ];
    }
    if (t.group === 'pc')
      return [
        {
          id: 'hdmi',
          title: 'Ingresso PC',
          horizontal: true,
          items: [1, 2, 3, 4].map(function (n) {
            return { action: 'pc.hdmi.' + n, label: 'HDMI ' + n, selected: pc.hdmi === n };
          })
        },
        {
          id: 'pc',
          title: 'OK apre il PC · tieni premuto OK per il menu WoL',
          items: [
            { action: 'edit.mac', label: 'Indirizzo MAC', description: pc.mac || 'Da configurare' },
            {
              action: 'edit.pcIp',
              label: 'Indirizzo IP del PC',
              description: pc.pcIp || 'Da configurare'
            },
            {
              action: 'pc.network',
              label: 'Wake on LAN',
              description: 'Broadcast e porta del segnale'
            }
          ]
        }
      ];
    if (t.group === 'pcnetwork')
      return [
        {
          id: 'pcnetwork',
          title: 'Il pacchetto parte solo quando lo scegli nel menu PC',
          items: [
            { action: 'edit.broadcast', label: 'Indirizzo broadcast', description: pc.broadcast },
            { action: 'edit.port', label: 'Porta UDP', description: String(pc.port) },
            {
              action: 'pc.wol',
              label: 'Invia segnale WoL',
              description: 'Invia il pacchetto al MAC configurato'
            }
          ]
        }
      ];
    if (t.group === 'connection')
      return [
        {
          id: 'connection',
          title: developer.ip
            ? 'Developer Mode ' + (developer.enabled ? 'attiva' : 'disattiva') + ' · Host ' + developer.ip
            : developer.error || 'Lettura stato dal TV…',
          items: [
            {
              action: 'edit.macHost',
              label: 'Indirizzo host di controllo',
              description: pc.macHost || 'Da configurare · sfondi e aggiornamenti'
            },
            {
              action: 'dev.instructions',
              label: 'Configurazione Developer Mode',
              description: 'Questo firmware richiede il menu Samsung per modificarla'
            },
            {
              action: 'dev.refresh',
              label: 'Aggiorna stato',
              description: 'Legge lo stato senza modificarlo'
            }
          ]
        }
      ];
    if (t.group === 'updates')
      return [
        {
          id: 'updates',
          title: 'Repository ufficiale reisxd/TizenTube',
          items: [
            {
              action: 'updates.check',
              label: 'Controlla aggiornamenti',
              description: update.checking
                ? 'Controllo in corso…'
                : update.error ||
                  (update.release
                    ? 'Release disponibile: ' + update.release.tag
                    : 'Controlla il pacchetto TV ufficiale')
            },
            {
              action: 'updates.auto',
              label: 'Controllo automatico',
              description: pc.autoUpdate ? 'Attivo · una volta al giorno' : 'Disattivo'
            },
            {
              action: 'updates.install',
              label: 'Aggiorna pacchetto TV',
              description: update.installMessage || 'Firma e installazione dall’host'
            },
            {
              action: 'updates.info',
              label: 'Aggiornamento delle funzionalità',
              description: 'TizenTube carica già le modifiche dal canale ufficiale'
            }
          ]
        }
      ];
    if (t.group === 'sources')
      return [
        {
          id: 'sources',
          title: inputLoading
            ? 'Ricerca delle sorgenti…'
            : inputError || 'Le sorgenti rilevate dal televisore',
          items: inputSources
            .map(function (source) {
              return {
                action: 'source.' + source.key,
                label: ZenoSources.get(source.key).name,
                description: source.current
                  ? 'Sorgente attuale'
                  : source.connected
                    ? 'Apri nel televisore'
                    : 'Nessun dispositivo collegato'
              };
            })
            .concat([
              {
                action: 'inputs.configure',
                label: 'Configura sorgenti',
                description: 'Nomi, Home e Wake on LAN'
              }
            ])
        }
      ];
    if (t.group === 'extras')
      return [
        {
          id: 'widgets',
          title: '',
          items: [
            {
              action: 'extras.clock',
              label: 'Orologio',
              description: { digital: 'Digitale', compact: 'Compatto', analog: 'Analogico' }[
                ZenoExtras.config().clock
              ]
            },
            {
              action: 'extras.weather',
              label: 'Meteo',
              description: ZenoExtras.config().enabled ? ZenoExtras.locationName() : 'Nascosto'
            },
            {
              action: 'extras.widgetcards',
              label: 'Fondo dei widget',
              description: 'Vetro o senza fondo'
            },
            {
              action: 'extras.motion',
              label: 'Movimento leggero',
              description: ZenoExtras.config().motion ? 'Attivo' : 'Disattivo',
              selected: ZenoExtras.config().motion,
              option: true
            }
          ]
        }
      ];
    if (t.group === 'widgetcards')
      return [
        {
          id: 'widgetcards',
          title: 'Mostra il fondo',
          items: [
            { id: 'clock', label: 'Orologio e calendario' },
            { id: 'weather', label: 'Meteo' },
            { id: 'sources', label: 'Sorgenti' },
            { id: 'settings', label: 'Personalizza' },
            { id: 'player', label: 'Musica' }
          ].map(function (item) {
            return {
              action: 'widget.panel.' + item.id,
              label: item.label,
              description: S.c[item.id + 'Panel'] === 'glass' ? 'Vetro' : 'Senza fondo',
              selected: S.c[item.id + 'Panel'] === 'glass',
              option: true
            };
          }),
          reason: 'Le card mantengono dimensioni e posizione.'
        }
      ];
    if (t.group === 'clockstyle')
      return [
        {
          id: 'clockstyle',
          title: 'Stile',
          horizontal: true,
          items: [
            {
              action: 'clock.digital',
              label: 'Digitale',
              selected: ZenoExtras.config().clock !== 'analog',
              option: true
            },
            {
              action: 'clock.analog',
              label: 'Analogico',
              selected: ZenoExtras.config().clock === 'analog',
              option: true
            }
          ]
        },
        {
          id: 'clockDensity',
          title: 'Dimensione del quadrante',
          horizontal: true,
          items: [
            {
              action: 'widget.density.standard',
              label: 'Standard',
              selected: widgetConfig.clockDensity === 'standard',
              option: true
            },
            {
              action: 'widget.density.compact',
              label: 'Compatta',
              selected: widgetConfig.clockDensity === 'compact',
              option: true
            }
          ]
        },
        {
          id: 'clockoptions',
          title: '',
          items: [
            {
              action: 'widget.seconds',
              label: 'Mostra secondi',
              selected: widgetConfig.seconds,
              option: true
            },
            {
              action: 'widget.open.handcolor',
              label: 'Colore dei secondi',
              colorSwatch: secondsSwatch()
            },
            {
              action: 'widget.open.worldclock',
              label: 'Fuso orario',
              description: ZenoWidgets.zones.filter(function (z) {
                return z.id === widgetConfig.zone;
              })[0].name
            },
            { action: 'widget.open.calendar', label: 'Calendario' },
            { action: 'widget.open.timer', label: 'Timer' }
          ]
        }
      ];
    if (t.group === 'weather')
      return [
        {
          id: 'weather',
          title: '',
          items: [
            {
              action: 'extras.location',
              label: 'Località',
              description: ZenoExtras.locationName()
            },
            {
              action: 'widget.weatherMode',
              label: 'Visualizzazione',
              description: widgetConfig.weatherMode === 'minimal' ? 'Minimale' : 'Dettagliata'
            },
            {
              action: 'widget.animations',
              label: 'Icone animate',
              selected: widgetConfig.animations,
              option: true
            },
            {
              action: 'weather.interval',
              label: 'Aggiornamento',
              description: weatherIntervalLabel(ZenoExtras.config().interval)
            },
            { action: 'extras.refresh', label: 'Aggiorna adesso', description: ZenoExtras.status() }
          ]
        }
      ];
    if (t.group === 'weatherinterval')
      return [
        {
          id: 'weatherinterval',
          title: 'Frequenza',
          items: ['30', '60', '180', 'home'].map(function (v) {
            return {
              action: 'weather.interval.' + v,
              label: weatherIntervalLabel(v),
              selected: ZenoExtras.config().interval === v,
              option: true
            };
          }),
          reason: 'Al rientro in Home aggiorna se sono passati almeno 10 minuti.'
        }
      ];
    if (t.group === 'location')
      return [
        {
          id: 'location',
          title: 'Località attuale',
          items: [
            {
              action: 'location.auto',
              label: 'Automatica da IP',
              description: 'Posizione approssimativa',
              selected: ZenoExtras.config().location === 'auto',
              option: true
            },
            {
              action: 'location.search',
              label: 'Cerca località',
              description: ZenoExtras.locationName()
            }
          ],
          reason: 'Cerca una città o un codice postale, anche fuori dall’Italia.'
        }
      ];
    if (t.group === 'locationresults')
      return [
        {
          id: 'locationresults',
          title: t.query || '',
          items: t.loading
            ? [{ info: true, label: 'Ricerca in corso…' }]
            : t.results && t.results.length
              ? t.results.map(function (place, i) {
                  return {
                    action: 'location.result.' + i,
                    label: place.name,
                    description: place.region
                  };
                })
              : [
                  {
                    info: true,
                    label: t.searchError ? 'Ricerca non disponibile' : 'Nessuna località trovata',
                    description: 'Torna indietro e prova un altro nome.'
                  }
                ]
        }
      ];
    if (t.group === 'remote')
      return [
        {
          id: 'remote',
          title: '',
          items: [
            {
              action: 'remote.keys',
              label: 'Tasti configurabili',
              description: 'Scorciatoie attive solo dentro Zeno TV'
            },
            {
              action: 'remote.voice',
              label: 'Microfono e assistenti',
              description: 'Gestiti dalle impostazioni Samsung'
            },
            {
              info: true,
              label: 'Netflix · Prime Video · Disney+ · TV Plus',
              description: 'Questi tasti non arrivano al launcher.'
            }
          ]
        }
      ];
    if (t.group === 'remotekeys')
      return [
        {
          id: 'remotekeys',
          title: 'Tasti esposti dal TV',
          items: ZenoRemote.keys().length
            ? ZenoRemote.keys().map(function (key) {
                return {
                  action: 'remote.key.' + key.name,
                  label: key.label,
                  description:
                    key.name === 'MediaPlayPause' && !ZenoRemote.mapping(key.name)
                      ? 'Player musicale'
                      : remoteTargetName(ZenoRemote.mapping(key.name))
                };
              })
            : [{ info: true, label: 'Nessun tasto configurabile rilevato' }]
        }
      ];
    if (t.group === 'remotetarget')
      return [
        {
          id: 'remotetarget',
          title: ZenoRemote.label(t.remoteKey),
          items: [
            {
              action: 'remote.target.default',
              label: t.remoteKey === 'MediaPlayPause' ? 'Player musicale' : 'Funzione originale',
              selected: !ZenoRemote.mapping(t.remoteKey),
              option: true
            },
            {
              action: 'remote.target.home',
              label: 'Home',
              selected: ZenoRemote.mapping(t.remoteKey) === 'home',
              option: true
            },
            {
              action: 'remote.target.settings',
              label: 'Personalizza',
              selected: ZenoRemote.mapping(t.remoteKey) === 'settings',
              option: true
            },
            {
              action: 'remote.target.sources',
              label: 'Sorgenti',
              selected: ZenoRemote.mapping(t.remoteKey) === 'sources',
              option: true
            }
          ].concat(
            S.c.home.map(function (id) {
              return {
                action: 'remote.target.app.' + id,
                label: app(id).name,
                selected: ZenoRemote.mapping(t.remoteKey) === 'app.' + id,
                option: true
              };
            })
          )
        }
      ];
    if (t.group === 'background')
      return [
        {
          id: 'bg',
          title: 'Tipo di sfondo',
          horizontal: true,
          items: options('bg', ['photo', 'light', 'dark'])
        },
        {
          id: 'wall',
          title: 'Fotografia',
          items: [
            {
              action: 'background.wallpaper',
              label: wall(S.c.wall).name,
              thumbnail: true,
              disabled: flat
            }
          ]
        },
        {
          id: 'colors',
          title: 'Interfaccia',
          items: [{ action: 'background.colors', label: 'Tema e colori', description: colorDescription() }]
        },
        {
          id: 'rotation',
          title: 'Rotazione',
          items: [{ action: 'background.rotation', label: mode().name, disabled: flat }],
          reason: flat ? 'Scegli Foto per usare fotografie e rotazione.' : ''
        }
      ];
    if (t.group === 'layout')
      return [
        {
          id: 'layout',
          title: 'Layout',
          horizontal: true,
          items: options('layout', ['dock', 'grid', 'list'])
        },
        {
          id: 'apps',
          title: 'Aspetto delle app',
          horizontal: true,
          items: options('apps', ['text', 'icons', 'both'])
        },
        {
          id: 'controls',
          title: 'Controlli Home',
          horizontal: true,
          items: options('controls', ['text', 'icons', 'both'])
        }
      ]
        .concat(
          S.c.layout === 'grid' && S.c.apps === 'icons'
            ? [
                {
                  id: 'gridNames',
                  title: 'Nomi nella griglia',
                  horizontal: true,
                  items: options('gridNames', ['hidden', 'focus'])
                }
              ]
            : []
        )
        .concat([]);
    if (t.group === 'typography')
      return [{ id: 'font', title: '', items: options('font', LOOK_VALUES.font) }];
    if (t.group === 'focus')
      return (
        S.c.layout === 'list'
          ? [
              {
                id: 'focus',
                title: 'Stile di selezione',
                horizontal: true,
                items: options('focus', ['type', 'glass'])
              }
            ]
          : []
      ).concat([
        {
          id: 'material',
          title: 'Materiale',
          items: options('material', ['soft', 'frost', 'tint']),
          reason: 'Vetro condiviso da Home e menu. Icone sempre opache.'
        }
      ]);
    if (t.group === 'rotation')
      return [
        {
          id: 'mode',
          title: '',
          items: options(
            'mode',
            MODES.map(function (m) {
              return m.id;
            }),
            flat
          ),
          reason: flat
            ? 'Scegli Foto nello Sfondo per usare la rotazione.'
            : 'La rotazione si ferma quando apri un pannello o un’altra app.'
        }
      ];
    return [
      {
        id: 'samsung',
        title: '',
        items: [
          {
            action: 'samsung.home',
            label: 'Samsung Home',
            description: 'Apri la schermata Home di Samsung'
          },
          {
            action: 'samsung.settings',
            label: 'Impostazioni Samsung',
            description: 'Immagine, audio e rete'
          }
        ]
      }
    ];
  }
  function parentSettingsLabel() {
    var p = S.stack[S.stack.length - 2];
    return !p || p.id === 'home'
      ? 'Home'
      : p.id === 'appearance'
        ? DETAIL_NAMES[p.group]
        : p.id === 'appdetail'
          ? app(p.app).name
          : p.id === 'apps'
            ? 'Applicazioni'
            : 'Personalizza';
  }
  function saveWidgetOption(k, v) {
    if (!ZenoWidgets.set(k, v)) message('Preferenze', 'Impossibile salvare. Riprova.');
  }
  function timerDuration(seconds) {
    var minutes = Math.floor(seconds / 60),
      rest = seconds % 60;
    return (
      (minutes ? minutes + ' min' : '') + (minutes && rest ? ' ' : '') + (rest || !minutes ? rest + ' s' : '')
    );
  }
  function timerDraft(t) {
    if (!t.timerDraft) t.timerDraft = { id: '', name: 'Timer', note: '', seconds: 600 };
    return t.timerDraft;
  }
  function timerAction(t, action) {
    var draft = timerDraft(t),
      list = ZenoWidgets.config().timers;
    if (action === 'timer.new') {
      openAppearance('timeredit');
      return;
    }
    if (action.indexOf('timer.edit.') === 0) {
      var selected = list.filter(function (v) {
        return v.id === action.slice(11);
      })[0];
      if (selected) {
        openAppearance('timeredit');
        top().timerDraft = selected;
      }
      return;
    }
    if (action.indexOf('timer.field.') === 0) {
      var field = action.slice(12),
        value =
          field === 'minutes'
            ? Math.floor(draft.seconds / 60)
            : field === 'seconds'
              ? draft.seconds % 60
              : draft[field];
      openKeyboard(
        'timer' + field,
        { name: 'Nome timer', minutes: 'Minuti', seconds: 'Secondi', note: 'Nota timer' }[field]
      );
      top().timerDraft = draft;
      top().value = String(value);
      return;
    }
    if (action === 'timer.start') {
      if (!ZenoWidgets.startTimer(draft.seconds, draft.name, draft.note))
        message('Timer', 'Impossibile salvare. Riprova.');
      else {
        message('Timer avviato', draft.name + ' · ' + timerDuration(draft.seconds), draft.note);
      }
      return;
    }
    if (action === 'timer.delete') {
      if (
        !ZenoWidgets.set(
          'timers',
          list.filter(function (v) {
            return v.id !== draft.id;
          })
        )
      )
        message('Timer', 'Impossibile salvare. Riprova.');
      else pop();
      return;
    }
    if (action === 'timer.save') {
      var preset = {
          id:
            draft.id || 't' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000).toString(36),
          name: draft.name.trim(),
          note: draft.note,
          seconds: draft.seconds
        },
        index = -1;
      list.forEach(function (v, i) {
        if (v.id === preset.id) index = i;
      });
      if (index >= 0) list[index] = preset;
      else list.push(preset);
      if (ZenoWidgets.set('timers', list)) {
        draft.id = preset.id;
        message('Timer salvato', preset.name + ' · ' + timerDuration(preset.seconds), preset.note);
      } else message('Timer', 'Impossibile salvare. Riprova.');
    }
  }
  function timerRemaining() {
    var seconds = Math.max(0, Math.ceil((ZenoWidgets.config().timer - Date.now()) / 1000));
    return Math.floor(seconds / 60) + ' min ' + ('0' + (seconds % 60)).slice(-2) + ' s';
  }
  function calendarDate(t) {
    return t.calendarDate || new Date();
  }
  function calendarSections(t) {
    return [
      {
        id: 'calendarNav',
        title: '',
        horizontal: true,
        items: [
          { action: 'calendar.prev', label: 'Precedente' },
          { action: 'calendar.today', label: 'Oggi' },
          { action: 'calendar.next', label: 'Successivo' }
        ]
      }
    ];
  }
  function calendarHTML(t) {
    var d = calendarDate(t),
      y = d.getFullYear(),
      m = d.getMonth(),
      first = new Date(y, m, 1),
      offset = (first.getDay() + 6) % 7,
      total = new Date(y, m + 1, 0).getDate(),
      today = new Date(),
      html =
        '<div class="zeno-calendar"><h3>' +
        esc(d.toLocaleDateString(ZenoI18n.locale(), { month: 'long', year: 'numeric' })) +
        '</h3><div class="calendar-days">';
    for (var wd = 0; wd < 7; wd++)
      html +=
        '<span class="calendar-weekday">' +
        esc(new Date(2024, 0, 1 + wd).toLocaleDateString(ZenoI18n.locale(), { weekday: 'short' })) +
        '</span>';
    for (var n = 0; n < 42; n++) {
      var day = n - offset + 1,
        valid = day > 0 && day <= total,
        isToday = valid && y === today.getFullYear() && m === today.getMonth() && day === today.getDate();
      html +=
        '<span class="calendar-day' +
        (!valid ? ' is-empty' : '') +
        (isToday ? ' is-today' : '') +
        '">' +
        (valid ? day : '') +
        '</span>';
    }
    return html + '</div></div>';
  }
  /* Detail pages are navigated as rows: Back on top, then each section (a horizontal
     section is one row of several items), then Retry when a change failed. */
  function detailRows(t) {
    var rows = [[{ action: 'settings.back', label: parentSettingsLabel() }]];
    detailSections(t).forEach(function (section) {
      var usable = section.items.filter(function (item) {
        return !item.disabled && !item.info;
      });
      if (!usable.length) return;
      if (section.horizontal) rows.push(usable);
      else
        usable.forEach(function (item) {
          rows.push([item]);
        });
    });
    if (S.lookError) rows.push([{ action: 'settings.retry', label: 'Riprova' }]);
    return rows;
  }
  /* Where the focused action sits in detailRows(); the first row if it is gone. */
  function detailLocation(t) {
    var rows = detailRows(t),
      at = { row: 0, column: 0 };
    rows.forEach(function (items, r) {
      items.forEach(function (item, c) {
        if (item.action === t.f.action) at = { row: r, column: c };
      });
    });
    return { rows: rows, row: at.row, column: at.column, item: rows[at.row][at.column] };
  }
  function detailFocus(t, item, column) {
    t.f.action = item.action;
    if (item.action !== 'settings.back') S.detailFocus[t.group] = item.action;
    if (column !== undefined) t.f.column = column;
    if (item.axis) S.appearanceFocus = item.axis;
  }
  /* Rotation only applies over a photograph; it is saved like any other look change. */
  function applyRotation(value) {
    if (S.c.bg !== 'photo') return;
    S.err = null;
    S.lookError = null;
    if (value === S.c.mode) return;
    var c = next(S.c.home.slice(), S.c.recent.slice());
    c.mode = value;
    if (!write(c, 'Wallpaper rotation'))
      S.lookError = { type: 'save', patch: { mode: value }, row: 'mode', transient: false };
  }
  function detailBack() {
    cancelLook();
    S.err = null;
    pop();
  }
  function detailOk(t, item) {
    var patch = {},
      error = S.lookError;
    if (item.info) return;
    if (item.action === 'settings.back') {
      detailBack();
      return;
    }
    if (item.disabled || S.pending) return;
    if (item.action === 'settings.retry') {
      if (error && error.patch[error.row] !== undefined)
        detailFocus(t, choice(error.row, error.patch[error.row]), 0);
      if (error && error.row === 'mode') applyRotation(error.patch.mode);
      else if (error) setLook(error.patch, { row: error.row });
    } else if (item.axis === 'mode') applyRotation(item.value);
    else if (item.axis) {
      patch[item.axis] = item.value;
      if (item.axis === 'inkColor') patch.colorMode = 'manual';
      setLook(patch, { row: item.axis });
    } else if (item.action.indexOf('widget.size.') === 0) {
      if (!S.c.homeLocked)
        setLook({ desktop: ZenoDesktop.resize(S.c.desktop, S.c.home, t.cardApp, item.action.slice(12)) }, {});
    } else if (item.action === 'desktop.peeks') {
      var viewDesktop = ZenoDesktop.copy(S.c.desktop);
      viewDesktop.peeks = !viewDesktop.peeks;
      if (!S.c.homeLocked) setLook({ desktop: viewDesktop }, {});
    } else if (item.action.indexOf('desktop.size.') === 0) {
      if (!S.c.homeLocked) {
        var size = item.action.slice(13).split('x'),
          desktop = ZenoDesktop.copy(S.c.desktop);
        desktop.columns = Number(size[0]);
        desktop.rows = Number(size[1]);
        setLook({ desktop: desktop }, {});
      }
    } else if (item.action.indexOf('desktop.widget.') === 0) {
      var widget = item.action.slice(15);
      if (!setDesktopWidget(widget, !S.c.desktop.widgets[widget]))
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action.indexOf('widget.open.') === 0) openAppearance(item.action.slice(12));
    else if (item.action.indexOf('widget.density.') === 0)
      saveWidgetOption('clockDensity', item.action.slice(15));
    else if (item.action === 'widget.seconds') saveWidgetOption('seconds', !ZenoWidgets.config().seconds);
    else if (item.action === 'widget.animations')
      saveWidgetOption('animations', !ZenoWidgets.config().animations);
    else if (item.action === 'widget.weatherMode') {
      saveWidgetOption(
        'weatherMode',
        ZenoWidgets.config().weatherMode === 'minimal' ? 'detailed' : 'minimal'
      );
      if (ZenoExtras.config().enabled) ZenoExtras.refresh(true);
    } else if (item.action === 'widget.hand.custom') {
      openKeyboard('handHex', 'Colore dei secondi');
      top().value = secondsSwatch();
    } else if (item.action.indexOf('widget.hand.') === 0)
      saveWidgetOption('handColor', item.action.slice(12));
    else if (item.action.indexOf('widget.zone.') === 0) saveWidgetOption('zone', item.action.slice(12));
    else if (item.action.indexOf('widget.timer.') === 0) {
      if (
        !(item.action === 'widget.timer.stop'
          ? ZenoWidgets.stopTimer()
          : ZenoWidgets.startTimer(Number(item.action.slice(13)) * 60, 'Timer', ''))
      )
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action.indexOf('widget.media.') === 0) ZenoWidgets.media(item.action.slice(13));
    else if (item.action.indexOf('widget.track.') === 0) {
      var trackIds = ZenoWidgets.tracks().map(function (track) {
        return track.id;
      });
      ZenoWidgets.selectTrack(trackIds.indexOf(item.action.slice(13)));
      ZenoWidgets.media('MediaPlay', function (e) {
        if (e) {
          message('Musica', 'Il TV non ha avviato l’audio.');
          after();
        }
      });
    } else if (item.action.indexOf('timer.') === 0) timerAction(t, item.action);
    else if (item.action === 'widget.audio') activateDesktopWidget('player');
    else if (item.action.indexOf('calendar.') === 0) {
      var cal = calendarDate(t),
        dir = item.action === 'calendar.prev' ? -1 : 1;
      if (item.action === 'calendar.today') t.calendarDate = new Date();
      else t.calendarDate = new Date(cal.getFullYear(), cal.getMonth() + dir, 1);
    } else if (item.action === 'inputs.configure') openAppearance('inputs');
    else if (item.action === 'home.lock.on' || item.action === 'home.lock.off') {
      var locked = next(S.c.home.slice(), S.c.recent.slice());
      locked.homeLocked = item.action === 'home.lock.on';
      write(locked, 'Home lock');
    } else if (item.action.indexOf('input.configure.') === 0) openInputSettings(item.action.slice(16));
    else if (item.action === 'input.appearance' || item.action === 'input.icon') {
      openAppearance(item.action === 'input.icon' ? 'sourceicon' : 'sourceappearance');
      top().sourceKey = t.sourceKey;
    } else if (item.action.indexOf('input.icon.') === 0) {
      if (!ZenoSources.set(t.sourceKey, 'icon', item.action.slice(11)))
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action === 'input.badge.toggle') {
      if (!ZenoSources.set(t.sourceKey, 'showBadge', !ZenoSources.get(t.sourceKey).showBadge))
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action === 'input.network') {
      openAppearance('sourcenetwork');
      top().sourceKey = t.sourceKey;
    } else if (item.action === 'input.open') openInput(t.sourceKey);
    else if (item.action === 'input.home') {
      var inputId = ZenoSources.id(t.sourceKey);
      if (onHome(inputId)) homeRemove(inputId);
      else homeAdd(inputId);
    } else if (item.action === 'input.wol') sendInputSignal(t.sourceKey, false);
    else if (item.action.indexOf('language.') === 0)
      ZenoI18n.set(item.action.slice(9), function (error) {
        if (error) message('Lingua', error.message);
      });
    else if (item.action === 'cards.auto') {
      if (!S.c.homeLocked && (S.c.gridStyle !== 'brand' || Object.keys(S.c.cardColors).length))
        setLook({ gridStyle: 'brand', cardColors: {} }, { row: 'gridStyle' });
    } else if (item.action === 'cards.apps') openAppearance('cardapps');
    else if (item.action === 'cards.glass') openAppearance('focus');
    else if (item.action.indexOf('card.configure.') === 0) {
      openAppearance('cardcolor');
      top().cardApp = item.action.slice(15);
    } else if (item.action.indexOf('card.color.') === 0) {
      var cc = next(S.c.home.slice(), S.c.recent.slice());
      cc.cardColors = cleanCardColors(cc.cardColors);
      if (item.action === 'card.color.default') delete cc.cardColors[t.cardApp];
      else cc.cardColors[t.cardApp] = item.action.slice(11);
      write(cc, 'Card color');
    } else if (item.action === 'card.custom') {
      openKeyboard('cardHex', 'Colore della card');
      top().cardApp = t.cardApp;
      top().value =
        S.c.cardColors[t.cardApp] && S.c.cardColors[t.cardApp].charAt(0) === '#'
          ? S.c.cardColors[t.cardApp]
          : '#808080';
    } else if (item.action === 'background.wallpaper') openWallpaper();
    else if (item.action === 'color.custom') openKeyboard('inkHex', 'Colore personale');
    else if (item.action === 'system.refresh') loadSystemStats();
    else if (item.action === 'system.native') perform('Impostazioni Samsung', ZenoDevice.settings);
    else if (item.action === 'cache.clear') {
      push({
        id: 'message',
        msg: 'cache',
        content: {
          title: 'Pulire la cache degli sfondi?',
          line: 'Vengono rimosse soltanto le copie scaricate che non stai usando.',
          note: 'Sfondo attuale, app e preferenze vengono conservati.',
          actions: [
            ['cache-clear', 'Pulisci'],
            ['back', 'Annulla']
          ]
        },
        f: { b: 1 }
      });
    } else if (item.action === 'background.colors') openAppearance('colors');
    else if (item.action === 'background.rotation') openAppearance('rotation');
    else if (item.action === 'extras.widgetcards') openAppearance('widgetcards');
    else if (item.action.indexOf('widget.panel.') === 0) {
      var panel = item.action.slice(13) + 'Panel';
      if (LOOK_VALUES[panel]) {
        var headerPatch = {};
        headerPatch[panel] = S.c[panel] === 'glass' ? 'none' : 'glass';
        setLook(headerPatch, {});
      }
    } else if (item.action === 'extras.clock') openAppearance('clockstyle');
    else if (item.action.indexOf('clock.') === 0) {
      if (!ZenoExtras.set('clock', item.action.slice(6)))
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action === 'extras.weather') openAppearance('weather');
    else if (item.action === 'weather.enabled') {
      if (!setDesktopWidget('weather', !S.c.desktop.widgets.weather))
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action === 'weather.interval') openAppearance('weatherinterval');
    else if (item.action.indexOf('weather.interval.') === 0) {
      if (!ZenoExtras.set('interval', item.action.slice(17)))
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action === 'location.search') openKeyboard('weatherSearch', 'Cerca località');
    else if (item.action.indexOf('location.result.') === 0) {
      if (ZenoExtras.set('place', t.results[Number(item.action.slice(16))])) pop();
      else message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action === 'remote.keys') openAppearance('remotekeys');
    else if (item.action === 'remote.voice')
      message(
        'Microfono e assistenti',
        'Il microfono resta gestito da Samsung. Puoi scegliere tra gli assistenti disponibili nelle impostazioni del TV.',
        'L’API vocale controlla l’app tramite l’assistente di sistema; non espone l’audio del telecomando a un assistente personalizzato.'
      );
    else if (item.action.indexOf('remote.key.') === 0) {
      openAppearance('remotetarget');
      top().remoteKey = item.action.slice(11);
    } else if (item.action.indexOf('remote.target.') === 0) {
      if (!ZenoRemote.set(t.remoteKey, item.action.slice(14)))
        message('Telecomando', 'Impossibile applicare la scorciatoia.');
    } else if (item.action === 'extras.location') openAppearance('location');
    else if (item.action === 'extras.motion') {
      if (!ZenoExtras.set('motion', !ZenoExtras.config().motion))
        message('Preferenze', 'Impossibile salvare. Riprova.');
    } else if (item.action === 'extras.refresh') ZenoExtras.refresh(true);
    else if (item.action.indexOf('location.') === 0) {
      if (!ZenoExtras.set('location', item.action.slice(9)))
        message('Preferenze', 'Impossibile salvare. Riprova.');
      else pop();
    } else if (item.action.indexOf('source.') === 0) {
      var source = inputSources.filter(function (source) {
        return item.action === 'source.' + source.key;
      })[0];
      if (source)
        perform(source.name, function (done) {
          ZenoDevice.source(source.type, source.number, done);
        });
    } else if (item.action.indexOf('edit.') === 0)
      openKeyboard(item.action.slice(5), item.label, t.sourceKey);
    else if (item.action.indexOf('pc.hdmi.') === 0) ZenoControl.set('hdmi', +item.action.slice(8));
    else if (item.action === 'pc.network') openAppearance('pcnetwork');
    else if (item.action === 'pc.wol') sendPCSignal(false);
    else if (item.action === 'dev.instructions')
      message(
        'Developer Mode',
        'Apri App Samsung e premi 1 2 3 4 5 sul telecomando per il menu Developer Mode.',
        'Host di controllo: ' +
          ZenoControl.config().macHost +
          ' · localhost: 127.0.0.1. YouTube funziona già con l’indirizzo del Mac.'
      );
    else if (item.action === 'dev.refresh') ZenoControl.status();
    else if (item.action === 'dev.mac' || item.action === 'dev.local' || item.action === 'dev.mode')
      confirmDeveloper(item.action);
    else if (item.action === 'updates.check') ZenoControl.checkUpdates();
    else if (item.action === 'updates.auto') ZenoControl.set('autoUpdate', !ZenoControl.config().autoUpdate);
    else if (item.action === 'updates.install')
      perform('Aggiornamento YouTube', function (done) {
        ZenoControl.installUpdate(function (error, value) {
          if (!error)
            message('Aggiornamento YouTube', (value && value.message) || 'Aggiornamento richiesto.');
          done(error);
        });
      });
    else if (item.action === 'updates.info')
      message(
        'TizenTube',
        'Le funzionalità vengono caricate dal canale ufficiale a ogni avvio.',
        'Le nuove versioni del pacchetto TV richiedono anche una firma Samsung: per questo viene usato il servizio sul Mac.'
      );
    else if (item.action === 'samsung.home') perform('Samsung Home', ZenoDevice.home);
    else if (item.action === 'samsung.settings') perform('Impostazioni Samsung', ZenoDevice.settings);
  }
  V.appearance = {
    norm: function (t) {
      var rows = detailRows(t),
        exists = false,
        applied = null;
      var axis = {
        background: 'bg',
        layout: 'layout',
        typography: 'font',
        focus: S.c.layout === 'list' ? 'focus' : 'material',
        rotation: 'mode',
        cards: 'gridStyle'
      }[t.group];
      rows.forEach(function (items) {
        items.forEach(function (item) {
          if (item.action === t.f.action) exists = true;
          if ((axis && item.axis === axis && item.value === S.c[axis]) || item.selected) applied = item;
        });
      });
      if (!exists) detailFocus(t, applied || (rows[1] || rows[0])[0], 0);
      if (t.f.column === undefined) t.f.column = detailLocation(t).column;
    },
    key: function (t, k) {
      var at = detailLocation(t),
        row = at.row,
        column = at.column;
      if (k === 'back') {
        detailBack();
        return;
      }
      if (k === 'ok') {
        detailOk(t, at.item);
        return;
      }
      if (k === 'up' || k === 'down') {
        row = clamp(row + (k === 'up' ? -1 : 1), 0, at.rows.length - 1);
        column = Math.min(t.f.column || 0, at.rows[row].length - 1);
        detailFocus(t, at.rows[row][column]);
      } else if (k === 'left' || k === 'right') {
        column = clamp(column + (k === 'left' ? -1 : 1), 0, at.rows[row].length - 1);
        detailFocus(t, at.rows[row][column], column);
      }
    },
    point: function (t, z, i, action) {
      if (z !== 'detail') return;
      detailRows(t).some(function (items) {
        return items.some(function (item, column) {
          if (item.action !== action) return false;
          detailFocus(t, item, column);
          detailOk(t, item);
          return true;
        });
      });
    }
  };
  function openPCSource() {
    openInput(ZenoSources.pcKey());
  }
  function openInput(key) {
    var p = ZenoSources.get(key);
    if (p)
      perform(p.name, function (done) {
        ZenoDevice.source(p.type, p.number, done);
      });
  }
  function openInputSettings(key) {
    openAppearance('sourceprofile');
    top().sourceKey = key;
  }
  function sendInputSignal(key, open) {
    var p = ZenoSources.get(key);
    perform(p.name, function (done) {
      ZenoSources.wol(key, function (error) {
        if (error) {
          done(error);
          return;
        }
        if (open) ZenoDevice.source(p.type, p.number, done);
        else {
          message(
            p.name,
            'Segnale WoL inviato.',
            'L’invio non conferma lo stato di accensione del dispositivo.'
          );
          done();
        }
      });
    });
  }
  function sendPCSignal(open) {
    sendInputSignal(ZenoSources.pcKey(), open);
  }
  function openPCMenu(key) {
    push({ id: 'pc', sourceKey: key || ZenoSources.pcKey(), f: { i: 0 } });
    after();
  }
  var PC_ACTIONS = [
    ['wol', 'Invia segnale WoL'],
    ['both', 'Invia e apri'],
    ['source', 'Apri sorgente'],
    ['setup', 'Configura sorgente']
  ];
  function inputActions(t) {
    var actions = (ZenoSources.get(t.sourceKey).mac ? PC_ACTIONS : PC_ACTIONS.slice(2)).slice();
    if (!S.c.homeLocked && onHome(ZenoSources.id(t.sourceKey)))
      actions = actions
        .concat([
          ['move', 'Sposta'],
          ['remove', 'Rimuovi dalla Home']
        ])
        .concat(S.c.layout === 'grid' ? [['color', 'Colore della card']] : []);
    actions.push(['settings', 'Personalizza']);
    return actions;
  }
  V.pc = {
    sheet: true,
    norm: function (t) {
      t.f.i = clamp(t.f.i, 0, inputActions(t).length - 1);
    },
    key: function (t, k) {
      var actions = inputActions(t);
      if (k === 'back') {
        pop();
        return;
      }
      if (k === 'up') t.f.i = Math.max(0, t.f.i - 1);
      if (k === 'down') t.f.i = Math.min(actions.length - 1, t.f.i + 1);
      if (k === 'ok') {
        var a = actions[t.f.i][0],
          key = t.sourceKey,
          id = ZenoSources.id(key);
        pop();
        if (a === 'source') openInput(key);
        else if (a === 'setup') openInputSettings(key);
        else if (a === 'move') startHomeMove(id);
        else if (a === 'remove') removeHomeItem(id);
        else if (a === 'color') {
          openAppearance('cardcolor');
          top().cardApp = id;
        } else if (a === 'settings') openSettings();
        else sendInputSignal(key, a === 'both');
      }
    },
    point: function (t, z, i) {
      t.f.i = i;
      this.key(t, 'ok');
    }
  };
  function homeActions(t) {
    var a = app(t.app),
      actions = [['open', a.widget ? 'Apri widget' : 'Apri app']];
    if (a.widget) {
      if (['clock', 'weather', 'player'].indexOf(a.widget) >= 0)
        actions.push(['configure', 'Configura widget']);
      if (!S.c.homeLocked)
        actions.push(
          ['move', 'Sposta'],
          ['size', 'Dimensione'],
          ['remove', 'Rimuovi dalla Home'],
          ['color', 'Colore della card'],
          ['panel', 'Mostra / nascondi fondo']
        );
      if (a.widget !== 'settings') actions.push(['settings', 'Personalizza']);
      return actions;
    }
    if (!S.c.homeLocked) {
      actions.push(['move', 'Sposta']);
      if (S.c.home.length > 1) actions.push(['remove', 'Rimuovi dalla Home']);
      if (S.c.layout === 'grid') actions.push(['color', 'Colore della card']);
    }
    if (a.id !== 'tv') actions.push(['manage', 'Gestisci app']);
    actions.push(['settings', 'Personalizza']);
    return actions;
  }
  function openHomeActions(id) {
    var a = app(id);
    if (!a || top().id !== 'home' || top().move) return;
    if (a.sourceKey) openPCMenu(a.sourceKey);
    else {
      push({ id: 'homeactions', app: id, f: { i: 0 } });
      after();
    }
  }
  function removeHomeItem(id) {
    if (app(id) && app(id).widget) {
      setDesktopWidget(app(id).widget, false);
      return;
    }
    var index = S.c.home.indexOf(id);
    if (homeRemove(id)) setSel(S.c.home[clamp(index, 0, S.c.home.length - 1)]);
  }
  V.homeactions = {
    sheet: true,
    norm: function (t) {
      t.f.i = clamp(t.f.i, 0, homeActions(t).length - 1);
    },
    key: function (t, k) {
      if (k === 'back') {
        pop();
        return;
      }
      var actions = homeActions(t);
      if (k === 'up') t.f.i = Math.max(0, t.f.i - 1);
      if (k === 'down') t.f.i = Math.min(actions.length - 1, t.f.i + 1);
      if (k === 'ok') {
        var action = actions[t.f.i][0],
          id = t.app;
        pop();
        if (action === 'open') launch(id);
        else if (action === 'move') startHomeMove(id);
        else if (action === 'remove') removeHomeItem(id);
        else if (action === 'color') {
          openAppearance('cardcolor');
          top().cardApp = id;
        } else if (action === 'size') {
          openAppearance('widgetsize');
          top().cardApp = id;
        } else if (action === 'settings') openSettings();
        else if (action === 'configure')
          openAppearance(
            app(id).widget === 'clock'
              ? 'clockstyle'
              : app(id).widget === 'weather'
                ? 'weather'
                : app(id).widget === 'player'
                  ? 'player'
                  : 'widgetcards'
          );
        else if (action === 'panel') {
          var p = {};
          p[app(id).widget + 'Panel'] = S.c[app(id).widget + 'Panel'] === 'none' ? 'glass' : 'none';
          setLook(p, {});
        } else openAppDetail(id);
      }
    },
    point: function (t, z, i) {
      t.f.i = i;
      this.key(t, 'ok');
    }
  };
  function startHomeMove(id) {
    if (S.c.homeLocked) return;
    if (S.c.layout === 'grid' && ZenoDesktop.ids(S.c.desktop, S.c.home).indexOf(id) >= 0) {
      var root = S.stack[0];
      S.stack = [root];
      root.f.zone = 'apps';
      root.move = {
        id: id,
        desktop: true,
        draft: ZenoDesktop.copy(S.c.desktop),
        order: S.c.home.slice()
      };
      S.desktopSel = id;
      return;
    }
    if (!onHome(id)) return;
    var t = S.stack[0];
    S.stack = [t];
    t.f.zone = 'apps';
    t.move = { id: id, order: S.c.home.slice(), snap: snap() };
    setSel(id);
  }
  function moveHomeTo(t, index) {
    var order = t.move.order,
      from = order.indexOf(t.move.id);
    index = clamp(index, 0, order.length - 1);
    if (index === from) return;
    order.splice(from, 1);
    order.splice(index, 0, t.move.id);
    setSel(t.move.id);
  }
  function homeMoveKey(t, k) {
    if (t.move.desktop) {
      if (k === 'back') {
        t.move = null;
        S.err = null;
        return;
      }
      if (k === 'ok') {
        var changed = next(S.c.home.slice(), S.c.recent.slice());
        changed.desktop = t.move.draft;
        if (write(changed, 'Posizione')) t.move = null;
        return;
      }
      t.move.draft = ZenoDesktop.move(t.move.draft, S.c.home, t.move.id, k);
      return;
    }
    var move = t.move,
      i = move.order.indexOf(move.id),
      n = move.order.length,
      target = i;
    if (k === 'back') {
      t.move = null;
      S.err = null;
      return;
    }
    if (k === 'ok') {
      if (same(move.order, S.c.home) || homeMove(move.order.slice(), move.id, move.snap)) t.move = null;
      return;
    }
    if (S.c.layout === 'grid') {
      if (k === 'left' && i % 4 > 0) target = i - 1;
      if (k === 'right' && i % 4 < 3 && i + 1 < n) target = i + 1;
      if (k === 'up' && i >= 4) target = i - 4;
      if (k === 'down' && Math.floor(i / 4) < Math.floor((n - 1) / 4)) target = Math.min(i + 4, n - 1);
    } else if (S.c.layout === 'list') target = i + (k === 'up' ? -1 : k === 'down' ? 1 : 0);
    else target = i + (k === 'left' ? -1 : k === 'right' ? 1 : 0);
    moveHomeTo(t, target);
  }
  function confirmDeveloper(action) {
    var dev = ZenoControl.developer(),
      c = ZenoControl.config(),
      change = {
        enabled: action === 'dev.mode' ? !dev.enabled : true,
        ip: action === 'dev.local' ? '127.0.0.1' : action === 'dev.mac' ? c.macHost : dev.ip
      };
    if (!ZenoControl.valid('macHost', change.ip || '')) {
      message('Connessione TV', 'Configura prima un indirizzo valido.');
      return;
    }
    push({
      id: 'message',
      msg: 'developer',
      developerChange: change,
      content: {
        title: 'Cambiare connessione TV?',
        line: change.enabled ? 'Developer Mode attiva · Host ' + change.ip : 'Disattivare Developer Mode',
        note: 'Il Mac può perdere l’accesso. Il TV potrebbe richiedere un riavvio manuale. Puoi tornare al profilo Mac da questo menu.',
        actions: [
          ['developer-apply', 'Applica'],
          ['back', 'Annulla']
        ]
      },
      f: { b: 1 }
    });
  }
  function weatherIntervalLabel(v) {
    return {
      30: 'Ogni 30 minuti · consigliato',
      60: 'Ogni ora',
      180: 'Ogni 3 ore',
      home: 'Al rientro in Home'
    }[v];
  }
  function searchWeatherLocation(query) {
    openAppearance('locationresults');
    var target = top();
    target.query = query;
    target.loading = true;
    target.results = [];
    target.cancelSearch = ZenoExtras.search(
      query,
      ZenoI18n.language().split('-')[0],
      function (error, results) {
        target.loading = false;
        target.searchError = !!error;
        target.results = results || [];
        if (top() === target) {
          V.appearance.norm(target);
          render();
        }
      }
    );
  }
  function remoteTargetName(target) {
    return !target
      ? 'Funzione originale'
      : target === 'home'
        ? 'Home'
        : target === 'settings'
          ? 'Personalizza'
          : target === 'sources'
            ? 'Sorgenti'
            : app(target.slice(4))
              ? app(target.slice(4)).name
              : 'App non disponibile';
  }
  function keyboardKeys(t) {
    var letters =
      t.field === 'sourceName' ||
      t.field === 'sourceBadge' ||
      t.field === 'weatherSearch' ||
      t.field === 'timername' ||
      t.field === 'timernote'
        ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ -_.,'"
        : t.field === 'inkHex' || t.field === 'cardHex' || t.field === 'handHex'
          ? 'ABCDEF#'
          : t.field === 'mac' || t.field === 'sourceMac'
            ? 'ABCDEF:'
            : t.field === 'port' ||
                t.field === 'sourcePort' ||
                t.field === 'timerminutes' ||
                t.field === 'timerseconds'
              ? ''
              : '.';
    return '1234567890'.split('').concat(letters.split('')).concat(['delete', 'clear', 'save']);
  }
  function openKeyboard(field, label, sourceKey) {
    var source = sourceKey && ZenoSources.get(sourceKey),
      map = {
        sourceName: 'name',
        sourceBadge: 'badge',
        sourceMac: 'mac',
        sourceIp: 'ip',
        sourceBroadcast: 'broadcast',
        sourcePort: 'port'
      };
    push({
      id: 'keyboard',
      field: field,
      label: label,
      sourceKey: sourceKey,
      value:
        field === 'inkHex'
          ? INK_COLORS[S.c.inkColor]
            ? INK_COLORS[S.c.inkColor].hex
            : S.c.inkColor
          : String(source && map[field] ? source[map[field]] : ZenoControl.config()[field] || ''),
      error: '',
      f: { i: 0 }
    });
  }
  V.keyboard = {
    sheet: true,
    key: function (t, k) {
      var keys = keyboardKeys(t);
      if (k === 'back') {
        pop();
        return;
      }
      if (k === 'left') t.f.i = Math.max(0, t.f.i - 1);
      if (k === 'right') t.f.i = Math.min(keys.length - 1, t.f.i + 1);
      if (k === 'up') t.f.i = Math.max(0, t.f.i - 10);
      if (k === 'down') t.f.i = Math.min(keys.length - 1, t.f.i + 10);
      if (k === 'ok') {
        var value = keys[t.f.i];
        t.error = '';
        if (value === 'delete') t.value = t.value.slice(0, -1);
        else if (value === 'clear') t.value = '';
        else if (value === 'save') {
          if (t.field === 'weatherSearch') {
            if (t.value.trim().length < 2) t.error = 'Inserisci almeno due caratteri.';
            else {
              var query = t.value.trim();
              pop();
              searchWeatherLocation(query);
            }
          } else if (t.field === 'handHex') {
            if (/^#[a-f0-9]{6}$/i.test(t.value)) {
              if (ZenoWidgets.set('handColor', t.value.toLowerCase())) pop();
              else t.error = 'Impossibile salvare. Riprova.';
            } else t.error = 'Usa # e sei cifre esadecimali.';
          } else if (t.field.indexOf('timer') === 0) {
            var field = t.field.slice(5),
              number = Number(t.value),
              duration =
                field === 'minutes'
                  ? number * 60 + (t.timerDraft.seconds % 60)
                  : Math.floor(t.timerDraft.seconds / 60) * 60 + number;
            if (field === 'minutes' || field === 'seconds') {
              if (
                !/^\d{1,4}$/.test(t.value) ||
                number < 0 ||
                number > (field === 'minutes' ? 1440 : 59) ||
                duration > 86400
              )
                t.error = 'Durata non valida.';
              else {
                t.timerDraft.seconds = duration;
                pop();
              }
            } else if (field === 'name' && !t.value.trim()) t.error = 'Inserisci un nome.';
            else {
              t.timerDraft[field] = t.value.trim();
              pop();
            }
          } else if (t.field === 'cardHex') {
            if (/^#[a-f0-9]{6}$/i.test(t.value) && !S.c.homeLocked) {
              var cc = next(S.c.home.slice(), S.c.recent.slice());
              cc.cardColors = cleanCardColors(cc.cardColors);
              cc.cardColors[t.cardApp] = t.value.toLowerCase();
              if (write(cc, 'Card color')) pop();
              else t.error = 'Impossibile salvare. Riprova.';
            } else t.error = 'Usa # e sei cifre esadecimali.';
          } else if (t.field === 'inkHex') {
            if (/^#[a-f0-9]{6}$/i.test(t.value)) {
              pop();
              setLook({ inkColor: t.value.toLowerCase(), colorMode: 'manual' }, {});
            } else t.error = 'Usa # e sei cifre esadecimali.';
          } else {
            var fields = {
                sourceName: 'name',
                sourceBadge: 'badge',
                sourceMac: 'mac',
                sourceIp: 'ip',
                sourceBroadcast: 'broadcast',
                sourcePort: 'port'
              },
              ok = fields[t.field]
                ? ZenoSources.set(t.sourceKey, fields[t.field], t.value)
                : ZenoControl.set(t.field, t.value);
            if (ok) pop();
            else t.error = 'Valore non valido oppure salvataggio non riuscito.';
          }
        } else if (
          t.value.length <
          (t.field === 'weatherSearch'
            ? 70
            : t.field === 'sourceName'
              ? 48
              : t.field === 'sourceBadge'
                ? 6
                : t.field === 'timername'
                  ? 40
                  : t.field === 'timernote'
                    ? 96
                    : t.field === 'timerminutes'
                      ? 4
                      : t.field === 'timerseconds'
                        ? 2
                        : 24)
        )
          t.value += value;
      }
    },
    point: function (t, z, i) {
      t.f.i = i;
      this.key(t, 'ok');
    }
  };
  function messageContent(t) {
    return t.content || MSG[t.msg];
  }
  V.message = {
    sheet: true,
    key: function (t, k) {
      var A = messageContent(t).actions,
        a;
      if (k === 'left') t.f.b = Math.max(0, t.f.b - 1);
      else if (k === 'right') t.f.b = Math.min(A.length - 1, t.f.b + 1);
      else if (k === 'back') pop();
      else if (k === 'ok') {
        a = A[t.f.b][0];
        var developerChange = t.developerChange,
          appTarget = t.appTarget,
          appOperation = t.appOperation,
          requestId = t.requestId;
        pop();
        if (a === 'app-confirm') executeAppAction(appTarget, appOperation, requestId);
        else if (a === 'samsung') perform('Samsung Home', ZenoDevice.home);
        else if (a === 'cache-clear')
          perform('Cache sfondi', function (done) {
            ZenoSystem.clearCache(S.c.wall, function (error) {
              if (!error) loadSystemStats();
              done(error);
            });
          });
        else if (a === 'developer-apply')
          perform('Connessione TV', function (done) {
            ZenoControl.setDeveloper(developerChange, done);
          });
      }
    },
    point: function (t, z, i) {
      if (z === 'act') {
        t.f.b = i;
        this.key(t, 'ok');
      }
    }
  };

  /* Zeno: restrained palettes, card navigation and app information. */
  var INK_COLORS = {
    pearl: { name: 'Perla', hex: '#f6f3ed' },
    white: { name: 'Bianco', hex: '#ffffff' },
    ice: { name: 'Ghiaccio', hex: '#d5edff' },
    mint: { name: 'Menta', hex: '#d9f7e7' },
    sand: { name: 'Sabbia', hex: '#ffe9c7' },
    lilac: { name: 'Lilla', hex: '#e7ddff' },
    rose: { name: 'Rosa', hex: '#ffdce8' },
    ink: { name: 'Grafite', hex: '#172333' }
  };
  function validInk(value) {
    return (
      typeof value === 'string' &&
      (Object.prototype.hasOwnProperty.call(INK_COLORS, value) || /^#[a-f0-9]{6}$/i.test(value))
    );
  }
  function colorDescription() {
    return S.c.colorMode === 'auto'
      ? 'Automatico · privilegia il contrasto'
      : S.c.colorMode === 'wallpaper'
        ? 'In armonia con ogni sfondo'
        : 'Personale · ' + (INK_COLORS[S.c.inkColor] ? INK_COLORS[S.c.inkColor].name : S.c.inkColor);
  }
  function resolvedInk(w) {
    var palette = (window.ZenoWallpaperColors || {})[w.id] ||
        w.palette || { neutral: 'pearl', harmony: 'ice' },
      id =
        S.c.colorMode === 'manual'
          ? S.c.inkColor
          : S.c.bg === 'light'
            ? 'ink'
            : S.c.bg === 'dark'
              ? 'pearl'
              : S.c.colorMode === 'wallpaper'
                ? palette.harmony
                : palette.neutral;
    return INK_COLORS[id] ? INK_COLORS[id].hex : id;
  }
  function wallpaperAccent(w) {
    var p = (window.ZenoWallpaperColors || {})[w.id] || w.palette || {},
      hex = resolvedInk(w),
      darkInk =
        parseInt(hex.substr(1, 2), 16) * 0.2126 +
          parseInt(hex.substr(3, 2), 16) * 0.7152 +
          parseInt(hex.substr(5, 2), 16) * 0.0722 <
        130;
    return S.c.bg === 'photo'
      ? (darkInk ? p.accentDark : p.accent) || (darkInk ? '#3478f6' : '#8fc1ff')
      : darkInk
        ? '#3478f6'
        : '#8fc1ff';
  }
  function secondsSwatch() {
    var color = ZenoWidgets.config().handColor;
    return color === 'auto'
      ? resolvedInk(wall(S.c.wall))
      : color === 'wallpaper'
        ? wallpaperAccent(wall(S.c.wall))
        : color;
  }
  function rgba(hex, alpha) {
    return (
      'rgba(' +
      parseInt(hex.substr(1, 2), 16) +
      ',' +
      parseInt(hex.substr(3, 2), 16) +
      ',' +
      parseInt(hex.substr(5, 2), 16) +
      ',' +
      alpha +
      ')'
    );
  }
  var inkApplied = '';
  function applyZenoInk(w) {
    var hex = resolvedInk(w),
      signature = [
        S.c.clockPanel,
        S.c.weatherPanel,
        S.c.sourcesPanel,
        S.c.settingsPanel,
        hex,
        S.c.menuTheme,
        homeFont(),
        S.c.material,
        S.c.gridStyle,
        S.c.gridNames,
        S.c.bg,
        w.id,
        IMG && IMG.field ? IMG.field.src : ''
      ].join('|');
    if (signature === inkApplied) return;
    var menuLight = S.c.menuTheme === 'light' || (S.c.menuTheme === 'auto' && S.c.bg === 'light'),
      menuHex = menuLight ? '#172333' : '#f4f6fa',
      dark =
        parseInt(hex.substr(1, 2), 16) * 0.2126 +
          parseInt(hex.substr(3, 2), 16) * 0.7152 +
          parseInt(hex.substr(5, 2), 16) * 0.0722 <
        130;
    homeEl.style.setProperty('--zeno-clock-accent', wallpaperAccent(w));
    stage.style.setProperty('--zeno-font', '"' + Fonts.family(homeFont()) + '",Manrope,Arial,sans-serif');
    stage.setAttribute('data-ink-tone', dark ? 'dark' : 'light');
    stage.setAttribute('data-menu-theme', menuLight ? 'light' : 'dark');
    stage.style.setProperty('--zeno-menu-ink', menuHex);
    stage.style.setProperty('--zeno-ink', menuHex);
    stage.style.setProperty('--zeno-muted', rgba(menuHex, 0.73));
    stage.style.setProperty('--zeno-faint', rgba(menuHex, 0.52));
    homeEl.style.setProperty('--zeno-ink', hex);
    homeEl.style.setProperty('--zeno-muted', rgba(hex, 0.73));
    homeEl.style.setProperty('--zeno-faint', rgba(hex, 0.52));
    stage.style.setProperty('--zeno-surface', dark ? 'rgba(248,250,255,.46)' : 'rgba(16,23,36,.32)');
    stage.style.setProperty('--zeno-side', dark ? 'rgba(240,246,255,.18)' : 'rgba(10,18,32,.18)');
    stage.style.setProperty('--zeno-veil', dark ? 'rgba(239,244,252,.26)' : 'rgba(8,14,24,.26)');
    stage.style.setProperty('--zeno-border', menuLight ? 'rgba(255,255,255,.42)' : 'rgba(235,243,255,.23)');
    stage.style.setProperty('--zeno-sheen', dark ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)');
    stage.style.setProperty('--zeno-control', menuLight ? 'rgba(255,255,255,.14)' : 'rgba(226,238,255,.055)');
    stage.style.setProperty('--zeno-focus', menuLight ? 'rgba(255,255,255,.38)' : 'rgba(226,238,255,.16)');
    stage.style.setProperty('--zeno-edge', menuLight ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.25)');
    // The palette is applied once per render, with no image reads or live filters.
    ['--ink', '--ph-ink', '--home-app-ink', '--clock-ink', '--dock-clock-ink'].forEach(function (key) {
      stage.style.setProperty(key, hex);
    });
    stage.style.setProperty('--ink', menuHex);
    stage.style.setProperty('--mute', rgba(menuHex, 0.73));
    stage.style.setProperty('--faint', rgba(menuHex, 0.52));
    homeEl.style.setProperty('--ink', hex);
    homeEl.style.setProperty('--mute', rgba(hex, 0.73));
    homeEl.style.setProperty('--faint', rgba(hex, 0.52));
    homeEl.style.setProperty('--zeno-edge', dark ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.25)');
    ['tl', 'tr', 'br'].forEach(function (zone) {
      ['ink', 'clock-ink', 'rest-ink', 'peer-ink'].forEach(function (key) {
        stage.style.setProperty('--' + zone + '-' + key, hex);
      });
    });
    stage.style.setProperty('--solid', dark ? '#24364d' : '#f2f5fc');
    stage.style.setProperty('--solid-ink', dark ? '#f2f5fc' : '#182336');
    stage.style.setProperty('--solid-mute', dark ? '#d0d9e7' : '#43536a');
    ['clock', 'weather', 'sources', 'settings'].forEach(function (part) {
      stage.setAttribute('data-' + part + '-panel', S.c[part + 'Panel']);
    });
    stage.setAttribute('data-grid-style', S.c.gridStyle);
    stage.setAttribute('data-grid-names', S.c.gridNames);
    applyGlassMaterial(menuLight);
    stage.style.setProperty('--zeno-menu-surface', stage.style.getPropertyValue('--zeno-surface'));
    applyGlassMaterial(dark, homeEl);
    if (IMG && IMG.field) stage.style.setProperty('--zeno-card-field', 'url("' + IMG.field.src + '")');
    inkApplied = signature;
  }
  function gridHomeKey(t, k, i, U) {
    var d = t.move && t.move.desktop ? t.move.draft : S.c.desktop,
      ids = ZenoDesktop.ids(d, S.c.home),
      id = desktopSelection(d);
    t.f.zone = 'apps';
    if (k === 'back') {
      openMessage('leave');
      return;
    }
    if (k === 'ok') {
      launch(id);
      return;
    }
    if (['left', 'right', 'up', 'down'].indexOf(k) >= 0) {
      S.desktopSel = ZenoDesktop.neighbour(d, S.c.home, id, k);
      if (onHome(S.desktopSel)) setSel(S.desktopSel);
    }
  }
  var gridTop = 0,
    gridRenderKey = '',
    gridFocused = null;
  function renderGridHome() {
    renderDesktop(top());
  }
  var desktopKey = '',
    desktopFocus = null,
    desktopPositions = '',
    desktopPan = '',
    desktopWidgetKey = '',
    desktopPaletteKey = '',
    desktopPalette = null,
    iconColorsRevision = 0;
  function desktopSelection(d) {
    var ids = ZenoDesktop.ids(d, S.c.home);
    if (ids.indexOf(S.desktopSel) < 0) S.desktopSel = ids.indexOf(S.sel) >= 0 ? S.sel : ids[0];
    return S.desktopSel;
  }
  function desktopWidgetHTML(kind) {
    var w = ZenoExtras.data(),
      cfg = ZenoWidgets.config();
    if (kind === 'clock') return ZenoWidgets.clockHTML(ZenoExtras.config().clock, ZenoI18n.locale());
    if (kind === 'weather') {
      if (!w)
        return (
          '<div class="desk-weather is-empty"><span class="desk-weather-city">Meteo</span><strong>—°</strong><span class="desk-weather-description">' +
          esc(ZenoExtras.status()) +
          '</span><small>OK aggiorna</small></div>'
        );
      var metrics =
        cfg.weatherMode === 'detailed'
          ? '<div class="desk-weather-metrics"><span><b>' +
            (w.apparent === null ? '—' : w.apparent + '°') +
            '</b><small>Percepita</small></span><span><b>' +
            (w.humidity === null ? '—' : w.humidity + '%') +
            '</b><small>Umidità</small></span><span><b>' +
            (w.wind === null ? '—' : w.wind) +
            '</b><small>km/h</small></span></div>'
          : '';
      return (
        '<div class="desk-weather weather-' +
        cfg.weatherMode +
        '"><span class="desk-weather-icon">' +
        ZenoExtras.weatherIcon() +
        '</span><strong>' +
        w.temperature +
        '°</strong><span class="desk-weather-city" data-i18n-ignore>' +
        esc(w.name) +
        '</span><span class="desk-weather-description">' +
        esc(w.description) +
        '</span>' +
        metrics +
        '</div>'
      );
    }
    if (kind === 'player') {
      var p = ZenoWidgets.player();
      return (
        '<div class="desk-player"><span class="desk-music-art">♫</span><span class="desk-player-name">' +
        esc(p.title) +
        '</span><small>' +
        esc(p.note) +
        '</small><span class="desk-player-state">' +
        esc(p.error || (p.playing ? 'Ⅱ  Pausa' : '▶  Riproduci')) +
        '</span></div>'
      );
    }
    return (
      '<div class="desk-command">' +
      icon(kind === 'sources' ? 'tv' : 'settings') +
      '<span>' +
      esc(kind === 'sources' ? 'Sorgenti' : 'Personalizza') +
      '</span></div>'
    );
  }
  function renderDesktop(t) {
    var d = t.move && t.move.desktop ? t.move.draft : S.c.desktop,
      ids = ZenoDesktop.ids(d, S.c.home),
      selected = desktopSelection(d),
      g = ZenoDesktop.geometry(d);
    gridHome.hidden = false;
    gridHome.className = 'zeno-desktop';
    if (!gridHome._deskTrack) {
      gridHome.innerHTML =
        '<div class="desk-viewport"><div class="desk-track"></div></div><div class="desk-edges"></div>';
      gridHome._deskTrack = gridHome.querySelector('.desk-track');
    }
    var viewport = gridHome.querySelector('.desk-viewport');
    if (gridHome._deskTrack.style.left !== g.left + 'px') gridHome._deskTrack.style.left = g.left + 'px';
    if (gridHome._deskTrack.style.top !== g.top + 'px') gridHome._deskTrack.style.top = g.top + 'px';
    gridHome.classList.toggle('peeks-hidden', !d.peeks);
    S.desktopCamera = ZenoDesktop.camera(d, selected, S.desktopCamera);
    var paletteKey = S.c.home.join('|') + '|' + catalog.revision + '|' + iconColorsRevision;
    if (paletteKey !== desktopPaletteKey) {
      desktopPaletteKey = paletteKey;
      desktopPalette = ZenoCardColors.resolve(
        S.c.home.map(function (id) {
          var a = app(id);
          return {
            id: a.id,
            appId: a.appId,
            color: cardColor(a),
            sourceKey: a.sourceKey,
            sourceIcon: a.sourceIcon
          };
        })
      );
    }
    var cam = S.desktopCamera,
      autoPalette = desktopPalette,
      weather = ZenoExtras.data(),
      key = [
        ids
          .map(function (id) {
            var a = app(id);
            return id + '~' + a.name + '~' + appVisualKey(a);
          })
          .join('|'),
        homeFont(),
        S.c.apps,
        S.c.controls,
        S.c.material,
        S.c.gridStyle,
        S.c.gridNames,
        JSON.stringify(S.c.cardColors),
        paletteKey,
        JSON.stringify(d.sizes),
        S.c.clockPanel,
        S.c.weatherPanel,
        S.c.sourcesPanel,
        S.c.settingsPanel,
        S.c.playerPanel,
        ZenoWidgets.revision(),
        ZenoExtras.config().clock,
        JSON.stringify(weather),
        ZenoWidgets.player().playing,
        ZenoWidgets.player().error,
        ZenoWidgets.player().title,
        ZenoI18n.language()
      ].join('|');
    if (key !== desktopKey) {
      desktopKey = key;
      desktopPositions = '';
      keyed(
        gridHome._deskTrack,
        ids.map(function (id) {
          return { key: id, id: id };
        }),
        function (el, it, i) {
          var a = app(it.id),
            widget = a.widget,
            value = S.c.cardColors[it.id],
            tint = CARD_COLORS[value],
            neutral = value === 'glass' || (!value && S.c.gridStyle === 'glass'),
            rgb = tint
              ? tint.rgb
              : value && value.charAt(0) === '#'
                ? hexRGB(value)
                : autoPalette[it.id] ||
                  {
                    clock: '55,84,119',
                    weather: '41,118,154',
                    player: '139,76,106',
                    sources: '63,115,108',
                    settings: '83,86,110'
                  }[widget] ||
                  '62,75,94';
          el.className = 'desk-card' + (widget ? ' is-widget widget-' + widget : '');
          el.setAttribute('data-widget', widget || '');
          var size = d.sizes[it.id] || 'full';
          el.setAttribute('data-size', size);
          el.style.setProperty('--desk-card-width', size === 'full' ? '388px' : '176px');
          el.style.setProperty('--desk-card-height', size === 'quarter' ? '92px' : '208px');
          el.setAttribute('data-card-tint', neutral ? 'glass' : 'color');
          el.style.setProperty('--zeno-card-rgb', rgb);
          el.classList.toggle('is-no-panel', !!widget && S.c[widget + 'Panel'] === 'none');
          var contentKey = [
            it.id,
            a.name,
            appVisualKey(a),
            ZenoI18n.language(),
            widget === 'clock'
              ? ZenoExtras.config().clock +
                '|' +
                ZenoWidgets.config().clockDensity +
                '|' +
                ZenoWidgets.config().seconds +
                '|' +
                ZenoWidgets.config().handColor +
                '|' +
                ZenoWidgets.config().zone
              : widget === 'weather'
                ? JSON.stringify(weather) + '|' + ZenoWidgets.config().weatherMode
                : widget === 'player'
                  ? ZenoWidgets.player().playing +
                    '|' +
                    ZenoWidgets.player().error +
                    '|' +
                    ZenoWidgets.player().title
                  : ''
          ].join('|');
          setContent(
            el,
            contentKey,
            '<span class="desk-art"><span class="desk-glass" aria-hidden="true"></span><span class="desk-content">' +
              (widget
                ? desktopWidgetHTML(widget)
                : '<span class="desk-app-mark">' +
                  appMark(a, 180, 116, 100) +
                  '</span><span class="desk-app-title">' +
                  esc(a.name) +
                  '</span>') +
              '</span></span><span class="desk-label">' +
              esc(a.name) +
              '</span>'
          );
          attrs(el, 'desk', i, 'home.app.' + it.id);
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', ZenoI18n.t(a.name));
        }
      );
      desktopFocus = null;
      ZenoI18n.render(gridHome);
      ZenoWidgets.tick(gridHome, ZenoI18n.locale());
    }
    var positionKey =
      JSON.stringify(d.positions) +
      '|' +
      JSON.stringify(d.sizes) +
      '|' +
      d.columns +
      '|' +
      d.rows +
      '|' +
      cam.x +
      '|' +
      cam.y;
    if (positionKey !== desktopPositions) {
      desktopPositions = positionKey;
      ids.forEach(function (id) {
        var p = d.positions[id],
          el = Zeno.dom.child(gridHome._deskTrack, id),
          pos = ZenoDesktop.point(d, p),
          cp = ZenoDesktop.point(d, cam),
          x = pos.x,
          y = pos.y,
          tx = g.left + pos.x - cp.x,
          ty = g.top + pos.y - cp.y,
          transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + g.scale + ')';
        if (el.style.transform !== transform) el.style.transform = transform;
        var glass = el.querySelector('.desk-glass');
        glass.style.backgroundSize = 1920 / g.scale + 'px ' + 1080 / g.scale + 'px';
        glass.style.backgroundPosition = -tx / g.scale + 'px ' + -ty / g.scale + 'px';
      });
      gridHome._deskTrack.style.transform =
        'translate3d(' + -ZenoDesktop.point(d, cam).x + 'px,' + -ZenoDesktop.point(d, cam).y + 'px,0)';
    }
    ids.forEach(function (id) {
      var p = d.positions[id],
        span = ZenoDesktop.span(d, id),
        peek =
          p.x < cam.x || p.y < cam.y || p.x + span.x > cam.x + d.columns || p.y + span.y > cam.y + d.rows;
      Zeno.dom.child(gridHome._deskTrack, id).classList.toggle('is-peek', peek);
    });
    var focus = t.id === 'home' ? Zeno.dom.child(gridHome._deskTrack, selected) : null;
    if (desktopFocus !== focus) {
      if (desktopFocus) desktopFocus.classList.remove('is-focus');
      if (focus) focus.classList.add('is-focus');
      desktopFocus = focus;
    }
    gridHome.classList.toggle('is-moving', !!t.move);
    var outside = { left: false, right: false, up: false, down: false };
    ids.forEach(function (id) {
      var p = d.positions[id];
      if (p.x < cam.x) outside.left = true;
      if (p.x >= cam.x + d.columns) outside.right = true;
      if (p.y < cam.y) outside.up = true;
      if (p.y >= cam.y + d.rows) outside.down = true;
    });
    setHTML(
      gridHome.querySelector('.desk-edges'),
      Object.keys(outside)
        .filter(function (k) {
          return outside[k];
        })
        .map(function (k) {
          return (
            '<span class="desk-edge edge-' +
            k +
            '">' +
            icon(k === 'up' ? 'up' : k === 'down' ? 'down' : k) +
            '</span>'
          );
        })
        .join('')
    );
  }
  function activateDesktopWidget(kind) {
    if (kind === 'sources') {
      openSources();
      return;
    }
    if (kind === 'settings') {
      openSettings();
      return;
    }
    if (kind === 'clock') {
      openAppearance('clockhub');
      return;
    }
    if (kind === 'weather') {
      if (!ZenoExtras.config().enabled) ZenoExtras.set('enabled', true);
      ZenoExtras.refresh(true);
      return;
    }
    if (kind === 'player')
      ZenoWidgets.toggleAudio(function (e) {
        if (e) {
          message('Musica', 'Il TV non ha avviato l’audio.');
          after();
        }
      });
  }
  function setDesktopWidget(kind, enabled) {
    if (S.c.homeLocked) return false;
    var previous = S.c,
      c = next(S.c.home.slice(), S.c.recent.slice());
    c.desktop = ZenoDesktop.copy(c.desktop);
    c.desktop.widgets[kind] = enabled;
    if (!write(c, 'Widget')) return false;
    if (kind === 'weather' && !ZenoExtras.set('enabled', enabled)) {
      write(previous, 'Widget rollback');
      return false;
    }
    if (kind === 'player' && !enabled) ZenoWidgets.pauseAudio();
    return true;
  }
  var CARD_COLORS = {
    blue: { name: 'Blu', rgb: '36,112,220' },
    sky: { name: 'Azzurro', rgb: '38,165,220' },
    teal: { name: 'Petrolio', rgb: '22,125,140' },
    mint: { name: 'Menta', rgb: '25,155,125' },
    green: { name: 'Verde', rgb: '55,140,67' },
    sand: { name: 'Sabbia', rgb: '195,126,30' },
    orange: { name: 'Arancio', rgb: '215,102,30' },
    red: { name: 'Rosso', rgb: '196,48,55' },
    rose: { name: 'Rosa', rgb: '198,70,125' },
    lilac: { name: 'Lilla', rgb: '132,84,199' },
    purple: { name: 'Viola', rgb: '96,65,170' },
    ink: { name: 'Grafite', rgb: '46,61,84' }
  };
  function hexRGB(hex) {
    return (
      parseInt(hex.slice(1, 3), 16) +
      ',' +
      parseInt(hex.slice(3, 5), 16) +
      ',' +
      parseInt(hex.slice(5, 7), 16)
    );
  }
  function cardHex(rgb) {
    return (
      '#' +
      rgb
        .split(',')
        .map(function (v) {
          return ('0' + Number(v).toString(16)).slice(-2);
        })
        .join('')
    );
  }
  function cleanCardColors(value) {
    var out = {};
    if (value && typeof value === 'object')
      Object.keys(value)
        .slice(0, 64)
        .forEach(function (k) {
          if (
            safeId(k) &&
            (value[k] === 'auto' ||
              value[k] === 'glass' ||
              Object.prototype.hasOwnProperty.call(CARD_COLORS, value[k]) ||
              /^#[a-f0-9]{6}$/i.test(value[k]))
          )
            out[k] = value[k];
        });
    return out;
  }
  function applyGlassMaterial(dark, target) {
    target = target || stage;
    var level = S.c.material === 'tint' ? 'clear' : S.c.material === 'frost' ? 'frost' : 'soft',
      alpha =
        level === 'clear'
          ? dark
            ? 0.24
            : 0.18
          : level === 'frost'
            ? dark
              ? 0.62
              : 0.5
            : dark
              ? 0.46
              : 0.32;
    target.style.setProperty(
      '--zeno-surface',
      dark ? 'rgba(248,250,255,' + alpha + ')' : 'rgba(16,23,36,' + alpha + ')'
    );
    target.style.setProperty(
      '--zeno-sheen',
      'rgba(255,255,255,' + (level === 'clear' ? 0.075 : level === 'frost' ? 0.2 : 0.12) + ')'
    );
    target.style.setProperty(
      '--zeno-side',
      dark ? 'rgba(240,246,255,' + alpha * 0.45 + ')' : 'rgba(10,18,32,' + alpha * 0.45 + ')'
    );
    target.style.setProperty(
      '--zeno-veil',
      dark ? 'rgba(239,244,252,.2)' : 'rgba(8,14,24,' + (level === 'clear' ? 0.18 : 0.26) + ')'
    );
    target.style.setProperty(
      '--zeno-brand-alpha',
      level === 'clear' ? '.18' : level === 'frost' ? '.5' : '.32'
    );
    target.style.setProperty(
      '--zeno-brand-low',
      level === 'clear' ? '.08' : level === 'frost' ? '.3' : '.18'
    );
  }
  var sourceSyncKey = '';
  function syncSourceApps() {
    var revision = ZenoSources.revision() + '|' + ZenoControl.config().hdmi;
    if (sourceSyncKey === revision) return;
    sourceSyncKey = revision;
    var tv = app('tv');
    tv.sourceIcon = 'tv';
    tv.sourceBadge = 'TV';
    tv.sourceShowBadge = true;
    ZenoSources.all(inputSources).forEach(function (p) {
      var id = ZenoSources.id(p.key),
        a = app(id);
      if (!a) {
        a = { id: id, appId: 'zeno.source.' + p.key };
        APPS.push(a);
      }
      a.sourceKey = p.key;
      a.name = p.name;
      a.sourceIcon = p.icon;
      a.sourceBadge = p.badge;
      a.sourceShowBadge = p.showBadge;
    });
  }
  function systemInfoItems() {
    var d = systemData || {},
      v = d.device || {},
      items = [
        { info: true, label: 'Modello', description: v.model || 'Non disponibile' },
        { info: true, label: 'Software', description: v.firmware || v.build || 'Non disponibile' },
        {
          info: true,
          label: 'Sistema operativo',
          description: v.platform ? 'Tizen ' + v.platform : 'Non disponibile'
        },
        { info: true, label: 'Pannello', description: v.panel || 'Non disponibile' },
        { info: true, label: 'Risoluzione interfaccia', description: v.display || '1920 × 1080' },
        { info: true, label: 'Rete', description: v.network || 'Non disponibile' }
      ];
    return items;
  }
  var systemData = null,
    systemLoading = false,
    systemError = '';
  function loadSystemStats() {
    if (systemLoading) return;
    systemLoading = true;
    systemError = '';
    ZenoSystem.stats(function (error, value) {
      systemLoading = false;
      systemError = error ? error.message : '';
      systemData = value;
      after();
    });
  }
  function statValue(value) {
    return ZenoSystem.bytes(value);
  }
  function appDetailActions(t) {
    var actions = [{ id: 'open', name: 'Apri app', note: 'Avvia ' + app(t.app).name }];
    if (!S.c.homeLocked)
      actions.push({
        id: 'home',
        name: onHome(t.app) ? 'Rimuovi dalla Home' : 'Aggiungi alla Home',
        note: 'L’app rimane installata'
      });
    if (app(t.app) && ZenoDevice.isYouTube(app(t.app).appId))
      actions.push({
        id: 'youtube',
        name: 'Impostazioni YouTube',
        note: 'TizenTube · aggiornamenti e canale ufficiale'
      });
    actions.push({
      id: 'native',
      name: 'Gestisci in Samsung',
      note: 'Disinstallazione e gestione nativa'
    });
    actions.push({
      id: 'data',
      name: 'Memoria e cache Samsung',
      note: 'Apri le impostazioni del TV'
    });
    actions.push({
      id: 'refresh',
      name: 'Aggiorna informazioni',
      note: 'Legge nuovamente spazio e stato'
    });
    if (t.bridge && t.bridge.available) {
      if (t.info && t.info.running)
        actions.push({
          id: 'stop',
          name: 'Chiudi app',
          note: 'Tramite questo Mac · lascia installata l’app'
        });
      if (!S.c.homeLocked || !onHome(t.app))
        actions.push({
          id: 'uninstall',
          name: 'Disinstalla app',
          note: 'Tramite questo Mac · richiede conferma'
        });
    }
    return actions;
  }
  function openAppDetail(id) {
    if (id === 'pc') {
      openAppearance('pc');
      return;
    }
    var t = push({
      id: 'appdetail',
      app: id,
      loading: true,
      info: null,
      error: '',
      bridge: null,
      f: { i: 0 }
    });
    ZenoControl.appBridge(app(id).appId, function (e, v) {
      if (S.stack.indexOf(t) < 0) return;
      t.bridge = v;
      after();
    });
    loadAppDetail(t);
  }
  function loadAppDetail(t) {
    t.loading = true;
    ZenoSystem.details(app(t.app).appId, function (error, value) {
      if (S.stack.indexOf(t) < 0) return;
      t.loading = false;
      t.info = value;
      t.error = error ? error.message : '';
      after();
    });
  }
  V.appdetail = {
    sheet: true,
    norm: function (t) {
      t.f.i = clamp(t.f.i, 0, appDetailActions(t).length - 1);
    },
    key: function (t, k) {
      if (k === 'back') {
        pop();
        return;
      }
      if (k === 'up') t.f.i = Math.max(0, t.f.i - 1);
      if (k === 'down') t.f.i = Math.min(appDetailActions(t).length - 1, t.f.i + 1);
      if (k === 'ok') {
        var a = appDetailActions(t)[t.f.i].id;
        if (a === 'open') launch(t.app);
        else if (a === 'home') {
          if (onHome(t.app)) homeRemove(t.app);
          else homeAdd(t.app);
        } else if (a === 'youtube') openAppearance('updates');
        else if (a === 'native') perform('Gestione app Samsung', ZenoSystem.nativeManager);
        else if (a === 'data') perform('Impostazioni Samsung', ZenoDevice.settings);
        else if (a === 'stop' || a === 'uninstall') confirmAppAction(t, a);
        else loadAppDetail(t);
      }
    },
    point: function (t, z, i) {
      if (z === 'appdetail-back') {
        pop();
        return;
      }
      t.f.i = i;
      this.key(t, 'ok');
    }
  };

  var appOperationBusy = false;
  function confirmAppAction(t, operation) {
    if (appOperationBusy) return;
    var a = app(t.app);
    push({
      id: 'message',
      msg: 'app-action',
      appTarget: t.app,
      appOperation: operation,
      requestId: 'zeno-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
      content: {
        title: operation === 'uninstall' ? 'Disinstallare ' + a.name + '?' : 'Chiudere ' + a.name + '?',
        line:
          operation === 'uninstall'
            ? 'L’app e i suoi dati locali verranno rimossi dal televisore.'
            : 'La riproduzione o le attività dell’app potrebbero interrompersi.',
        note: 'Il comando viene eseguito tramite questo Mac.',
        actions: [
          ['app-confirm', operation === 'uninstall' ? 'Disinstalla' : 'Chiudi app'],
          ['back', 'Annulla']
        ]
      },
      f: { b: 1 }
    });
  }
  function executeAppAction(target, operation, requestId) {
    if (appOperationBusy) return;
    var a = app(target);
    if (!a) return;
    if (operation === 'uninstall' && S.c.homeLocked && onHome(target)) {
      message('Home bloccata', 'Sblocca la Home in Personalizza per modificarla.');
      return;
    }
    appOperationBusy = true;
    var detail = S.stack.filter(function (t) {
      return t.id === 'appdetail' && t.app === target;
    })[0];
    if (detail)
      detail.operation = operation === 'uninstall' ? 'Disinstallazione in corso…' : 'Chiusura in corso…';
    ZenoControl.appAction(operation, a.appId, requestId, function (error) {
      appOperationBusy = false;
      if (detail) detail.operation = '';
      if (error) {
        message(a.name, error.message || 'Operazione non completata.');
        after();
        return;
      }
      if (operation === 'uninstall') {
        var h = without(S.c.home, target),
          r = without(S.c.recent, target),
          c = next(h.length ? h : ['tv'], r);
        if (c.lastApp === target) c.lastApp = c.home[0];
        write(c, 'Disinstallazione ' + a.name);
        if (top().id === 'appdetail' && top().app === target) pop();
        refreshCatalog();
      } else if (detail && S.stack.indexOf(detail) >= 0) loadAppDetail(detail);
      after();
    });
  }
  /* ---------- Dispatch ---------- */
  function norm() {
    var t = top(),
      v = V[t.id];
    if (v.norm) v.norm(t);
  }
  function press(k) {
    if (k === 'home') {
      returnHome();
      return;
    }
    norm();
    var t = top(),
      config = S.c,
      fast =
        t.id === 'home' &&
        S.c.layout === 'grid' &&
        ['left', 'right', 'up', 'down'].indexOf(k) >= 0 &&
        !S.err &&
        !S.pending &&
        !S.reflow;
    V[t.id].key(t, k);
    norm();
    if (fast && top() === t && S.c === config) {
      renderDesktop(t);
      renderHomeEditHint(t);
    } else render();
    syncRotation();
  }

  /* ---------- Rendering ---------- */
  var $ = function (id) {
    return document.getElementById(id);
  };
  var stage = $('stage'),
    homeEl = $('home'),
    caption = $('caption'),
    utilsEl = $('utils');
  var utilFocusLabel = $('utilFocusLabel'),
    utilFocusKey = '',
    appFocusName = $('appFocusName');
  var gridHome = document.createElement('div');
  gridHome.className = 'zeno-grid';
  gridHome.hidden = true;
  homeEl.appendChild(gridHome);
  var homeEditHint = document.createElement('div');
  homeEditHint.id = 'homeEditHint';
  homeEditHint.className = 'home-edit-hint';
  homeEditHint.hidden = true;
  homeEl.appendChild(homeEditHint);
  function renderHomeEditHint(t) {
    homeEditHint.hidden = t.id !== 'home' || !t.move;
    if (!homeEditHint.hidden) {
      setHTML(
        homeEditHint,
        '<span class="home-moving-name">' +
          esc(app(t.move.id).name) +
          '</span>' +
          remoteHelp(S.err ? 'Riprova' : 'Posiziona', 'Annulla')
      );
      ZenoI18n.render(homeEditHint);
    }
  }
  var dock = $('dock'),
    shelf = $('shelf'),
    track = $('track'),
    plate = $('plate'),
    matScrim = $('matScrim'),
    dockEmpty = $('dockEmpty');
  var cueL = $('cueL'),
    cueR = $('cueR');
  var focusStatus = $('focusStatus'),
    sceneEl = $('scene'),
    appearanceEl = $('appearance'),
    appearanceRows = $('appearanceRows'),
    appearanceDesc = $('appearanceDesc');
  var appearanceBack = $('appearanceBack'),
    appearanceTitle = $('appearanceTitle'),
    appearanceStatus = $('appearanceStatus');
  var phScene = $('phScene'),
    phPlate = $('phPlate'),
    phField = $('phField'),
    phList = $('phList'),
    phRows = $('phRows'),
    phEmpty = $('phEmpty');
  var phPlates = [phPlate, $('phPlateAlt')],
    phFields = [phField, $('phFieldAlt')],
    photoPlateIndex = 0,
    photoPlateKey = null;
  var utPlates = [$('utLens'), $('utLensAlt')],
    utFields = [$('utField'), $('utFieldAlt')],
    utPlateIndex = 0,
    utPlateKey = null;
  var sheetEl = $('sheet'),
    sheetView = $('sheetView');
  var IMG = {
    photo: $('photo'),
    mat: $('matImg'),
    bg: $('sheetBg'),
    field: $('phFieldImg'),
    fieldAlt: $('phFieldImgAlt'),
    utility: $('utFieldImg'),
    utilityAlt: $('utFieldImgAlt')
  };
  var sheetKey = '',
    slotEls = {},
    dockEdgeFrame = 0,
    dockEdgeUntil = 0,
    dockAnchorCenter = 960;
  var appliedPalette = null,
    appliedPhoto = null,
    appliedFont = null,
    appliedFontMetrics = null;

  /* ---------- Adaptive ink ----------
     Each bundled photograph has measured text colours for the three corners Home writes
     in (top-left clock, top-right controls, bottom-right). They are applied as CSS
     variables; "locked" palettes keep the hand-tuned classes instead. */
  var INK_CORNERS = ['tl', 'tr', 'br'];
  var INK_FIELDS = [
    ['ink', 'ink'],
    ['clock-ink', 'clockInk'],
    ['rest-ink', 'restInk'],
    ['peer-ink', 'peerInk'],
    ['rest', 'restAlpha'],
    ['peer', 'peerAlpha'],
    ['under', 'halo'],
    ['shadow', 'shadow']
  ];
  var INK_RUNGS = ['light', 'mist', 'mist-high', 'dark', 'dark-halo'];
  function paletteUsable(palette) {
    return !!(
      S.c.bg === 'photo' &&
      palette &&
      !palette.locked &&
      palette.light &&
      palette.tl &&
      palette.tr &&
      palette.br
    );
  }
  function applyAdaptiveInk(palette) {
    var usable = paletteUsable(palette),
      onPhoto = S.c.bg === 'photo';
    if (appliedPalette === palette && appliedPhoto === onPhoto) return usable;
    appliedPalette = palette;
    appliedPhoto = onPhoto;
    INK_CORNERS.forEach(function (corner) {
      var spec = usable ? palette[corner] : null;
      INK_FIELDS.forEach(function (field) {
        var value = spec ? spec[field[1]] : null,
          name = '--' + corner + '-' + field[0];
        if (spec && field[0] === 'clock-ink' && value == null) value = spec.ink;
        if (value == null) stage.style.removeProperty(name);
        else stage.style.setProperty(name, String(value));
      });
    });
    if (usable) stage.style.setProperty('--home-app-ink', palette.light);
    else stage.style.removeProperty('--home-app-ink');
    return usable;
  }
  function inkRungClasses(palette, usable) {
    if (!usable) return '';
    return INK_CORNERS.map(function (corner) {
      var rung = palette[corner].rung;
      return INK_RUNGS.indexOf(rung) >= 0 ? ' ink-' + corner + '-' + rung : '';
    }).join('');
  }

  /* ---------- Frame ---------- */
  /* The stage carries every look decision as a class, so CSS can style each
     combination without the script knowing about it. */
  function stageClasses(t, shown, palette, adaptive, sheet) {
    var font = homeFont(),
      cls = [
        'stage',
        'bg-' + S.c.bg,
        'l-' + S.c.layout,
        'v-' + S.variant,
        'm-' + (materialApplies() ? S.c.material : 'none'),
        'f-' + S.c.focus,
        'a-' + S.c.apps,
        'u-' + S.c.controls,
        'g-' + S.geom,
        'tone-' + shown.tone,
        'tr-' + (adaptive && palette.tr ? palette.tr.pol : shown.ut.tr),
        'br-' + (adaptive && palette.br ? palette.br.pol : shown.ut.br)
      ];
    var extra = wallClasses(shown) + inkRungClasses(palette, adaptive) + ' at-' + t.id;
    if (t.move) extra += ' is-home-moving';
    extra += ' font-' + font;
    if (font !== Fonts.BASELINE) extra += ' font-custom';
    if (S.fontSwitch) extra += ' is-font-switch';
    if (adaptive) extra += ' has-adaptive-ink adaptive-tl-' + palette.tl.pol;
    else {
      if (shown.clockInk) extra += ' has-clock-ink';
      if (shown.dockClockInk) extra += ' has-dock-clock-ink';
    }
    if (registeredMaterial(shown.id)) extra += ' registered-material';
    if (sheet) extra += ' is-sheet';
    if (S.reflow) extra += ' is-reflow';
    return cls.join(' ') + extra;
  }
  function render() {
    syncSourceApps();
    var t = top(),
      sheet = !!V[t.id].sheet,
      shown = wall(S.shown ? S.shown.wall : S.c.wall),
      palette = ADAPTIVE_INK[shown.id];
    var adaptive = applyAdaptiveInk(palette),
      cls = stageClasses(t, shown, palette, adaptive, sheet);
    if (stage.className !== cls) stage.className = cls;
    stage.setAttribute('data-settings-group', t.group || '');
    applyHomeFont();
    applyZenoInk(shown);
    if (!sheet) renderHome(t);
    renderSheet(t, sheet);
    renderAppearance(t);
    renderFocusStatus(t);
    ZenoI18n.render(stage);
  }

  /* Typeface variables for Home: families, weights and the per-role optical shifts. */
  function applyHomeFont() {
    var id = homeFont(),
      face = Fonts.get(id),
      metrics = Fonts.metrics(id);
    if (appliedFont === id && appliedFontMetrics === metrics) return;
    appliedFont = id;
    appliedFontMetrics = metrics;
    var primary = fontRole(id, 'primary'),
      ui = fontRole(id, 'ui');
    var vars = [
      ['display-family', '"' + face.family + '"'],
      ['ui-family', '"' + ui.family + '"'],
      ['primary-family', '"' + primary.family + '"'],
      ['display-weight', face.weights.display],
      ['ui-weight', ui.weight],
      ['primary-weight', primary.weight],
      ['clock-weight', face.weights.clock],
      ['clock-shift', px(fontShift('clock', 48))],
      ['utility-shift', px(fontShift('ui', 28))],
      ['action-shift', px(fontShift('ui', 30))],
      ['heading-shift', px(fontShift('ui', 48))],
      ['full-name-shift', px(fontShift('primary', 30))],
      ['clock-digit', px(metrics ? (metrics.digitCell * 82) / 48 : 0)]
    ];
    vars.forEach(function (v) {
      homeEl.style.setProperty('--font-' + v[0], String(v[1]));
    });
  }

  /* What Home should show for a stack entry: the items, the focused index and zone. */
  function homeState(t) {
    var list = t.move ? t.move.order : S.c.home;
    var hs = {
      mode: 'browse',
      zone: null,
      u: -1,
      lifted: false,
      from: -1,
      arr: null,
      i: Math.max(0, t.move ? list.indexOf(t.move.id) : ensureSel()),
      items: list.map(function (id) {
        return { key: id, kind: 'app', id: id };
      })
    };
    if (isSettingsDetail(t)) hs.zone = 'preview';
    else if (t.id === 'home') {
      hs.zone = t.f.zone;
      hs.u = t.f.u;
    }
    return hs;
  }
  function renderHome(t) {
    if (S.c.layout === 'grid') {
      renderDesktop(t);
      renderHomeEditHint(t);
      return;
    }
    var hs = homeState(t);
    gridHome.hidden = true;
    renderCaption(t, hs);
    renderUtils(hs);
    if (S.c.layout === 'list') renderList(hs);
    else renderDock(hs);
    renderAppFocusName(hs);
    renderHomeEditHint(t);
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function clockText() {
    var now = new Date();
    return pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  }
  /* Faces without tabular digits get each digit in a fixed-width cell. */
  function clockHtml() {
    var text = clockText(),
      metrics = Fonts.metrics(homeFont());
    return metrics && metrics.digitCell ? text.replace(/\d/g, '<span class="clock-digit">$&</span>') : text;
  }
  var analogKey = '',
    analogMarkup = '';
  function analogClock(now) {
    var key = now.getHours() + ':' + now.getMinutes();
    if (key === analogKey) return analogMarkup;
    analogKey = key;
    var marks = '',
      i;
    for (i = 0; i < 12; i++)
      marks += '<path d="M70 9v' + (i % 3 === 0 ? 10 : 5) + '" transform="rotate(' + i * 30 + ' 70 70)"/>';
    return (analogMarkup =
      '<svg class="zeno-analog-clock" viewBox="0 0 140 140" aria-label="' +
      clockText() +
      '"><circle class="clock-face" cx="70" cy="70" r="66"/><g class="clock-marks">' +
      marks +
      '</g><path class="clock-hour" d="M70 70V36" transform="rotate(' +
      ((now.getHours() % 12) * 30 + now.getMinutes() * 0.5) +
      ' 70 70)"/><path class="clock-minute" d="M70 70V20" transform="rotate(' +
      now.getMinutes() * 6 +
      ' 70 70)"/><circle cx="70" cy="70" r="4" fill="currentColor"/></svg>');
  }
  function renderCaption(t, hs) {
    var cfg = ZenoExtras.config(),
      now = new Date(),
      style = cfg.clock,
      clock = style === 'analog' ? analogClock(now) : '<span class="clock">' + clockHtml() + '</span>',
      date = now.toLocaleDateString(ZenoI18n.locale(), {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }),
      html =
        '<span class="zeno-header-glass" aria-hidden="true"></span><div class="zeno-clock-group clock-style-' +
        style +
        '">' +
        clock +
        '<span class="zeno-date">' +
        (style === 'analog'
          ? '<span class="clock-date-weekday">' +
            esc(now.toLocaleDateString(ZenoI18n.locale(), { weekday: 'long' })) +
            '</span><span class="clock-date-long">' +
            esc(now.toLocaleDateString(ZenoI18n.locale(), { day: 'numeric', month: 'long' })) +
            '</span>'
          : esc(date)) +
        '</span></div>';
    if (
      S.c.apps !== 'icons' &&
      hs.items[hs.i] &&
      (S.c.layout === 'list'
        ? photoLabel(hs.items[hs.i].id).size < 88 || photoLabel(hs.items[hs.i].id).ellipsis
        : hs.zone === 'apps' && reducedDockLabel(hs.items[hs.i].id))
    )
      html += '<span class="cap-line full-name">' + esc(app(hs.items[hs.i].id).name) + '</span>';
    setHTML(caption, html);
    ZenoI18n.render(caption);
    var w = ZenoExtras.data(),
      widget = $('weatherWidget');
    widget.hidden = !w;
    if (w)
      setHTML(
        widget,
        '<span class="zeno-header-glass" aria-hidden="true"></span><span class="weather-widget-art">' +
          ZenoExtras.weatherIcon() +
          '</span><span class="weather-widget-copy"><span class="weather-widget-place" data-i18n-ignore>' +
          esc(w.name) +
          '</span><span class="weather-widget-temp">' +
          w.temperature +
          '°</span><span class="weather-widget-description">' +
          esc(w.description) +
          (w.stale ? ' · ' + esc(ZenoI18n.t('Da aggiornare')) : '') +
          '</span></span>'
      );
  }

  /* ---------- Home controls ---------- */
  function utilBtn(z, i, action, inner, extra, name) {
    return (
      '<button type="button" tabindex="-1" class="u' +
      (extra || '') +
      '" data-z="' +
      z +
      '" data-i="' +
      i +
      '" data-action="' +
      action +
      '" aria-label="' +
      esc(name) +
      '">' +
      '<span class="zeno-header-glass" aria-hidden="true"></span><span class="u-content">' +
      inner +
      '</span></button>'
    );
  }
  function renderUtils(hs) {
    var style = S.c.controls,
      iconsOnly = style === 'icons',
      focused = null;
    utilsEl.className =
      'utils quiet-utils is-' + style + (hs.zone === 'util' || hs.zone === 'ctl' ? ' is-awake' : '');
    setHTML(
      utilsEl,
      utils()
        .map(function (u, i) {
          var spec = UTIL[u],
            label =
              '<span class="u-label" style="--header-label-size:' +
              fitSettingText(spec[0], 150, 23) +
              'px">' +
              spec[0] +
              '</span>';
          return utilBtn('util', i, 'util.' + u, icon(spec[1], '', true) + label, '', spec[0]);
        })
        .join('')
    );
    Array.prototype.forEach.call(utilsEl.querySelectorAll('.u'), function (b) {
      var on = hs.zone === b.getAttribute('data-z') && hs.u === Number(b.getAttribute('data-i'));
      b.className = b.className.replace(/\s+is-focus/g, '') + (on ? ' is-focus' : '');
      if (on) focused = b;
    });
    renderUtilFocusLabel(iconsOnly ? focused : null);
    renderUtilityLens(focused, iconsOnly);
  }
  /* Stage coordinates (1920-wide) of an element, whatever the window scale. */
  function stageBox(el) {
    var r = el.getBoundingClientRect(),
      s = sceneEl.getBoundingClientRect(),
      k = s.width / 1920 || 1;
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  /* Icon-only controls show their name in a caption under the focused one. */
  function renderUtilFocusLabel(button) {
    if (!button) {
      utilFocusLabel.className = 'util-focus-label';
      utilFocusKey = '';
      return;
    }
    var text = S.err ? 'Non salvato. Premi OK per riprovare.' : button.getAttribute('aria-label');
    var key = [button.getAttribute('data-action'), text, homeFont()].join('|');
    if (key !== utilFocusKey) {
      utilFocusLabel.className = 'util-focus-label';
      utilFocusLabel.textContent = text;
      void utilFocusLabel.offsetWidth;
      utilFocusKey = key;
    }
    var box = stageBox(button),
      width = Math.ceil(textWidth(text, 28, 500, -0.2) + 8),
      list = S.c.layout === 'list';
    var x = list ? 1730 - width : box.x + box.w / 2 - width / 2;
    var y = list ? box.y + box.h / 2 - 19 : 298;
    utilFocusLabel.style.width = width + 'px';
    utilFocusLabel.style.left = clamp(x, 112, 1808 - width) + 'px';
    utilFocusLabel.style.top = y + fontShift('ui', 28) + 'px';
    utilFocusLabel.className = 'util-focus-label is-on';
  }
  /* In the list layout with glass focus, the focused control gets a glass lens that
     runs to the right edge. Two lenses alternate like the photo plates. */
  function renderUtilityLens(button, iconsOnly) {
    if (!button || S.c.focus !== 'glass' || S.c.layout !== 'list') {
      utPlates.forEach(function (lens) {
        lens.className = 'ph-plate ut-lens is-outgoing';
      });
      utPlateKey = null;
      return;
    }
    var label = iconsOnly ? utilFocusLabel : button.querySelector('.u-label');
    var x = stageBox(label).x - 24,
      y = stageBox(button).y + 2,
      width = 1800 - x;
    var key = [button.getAttribute('data-action'), x, y, width].join('|');
    if (key !== utPlateKey) {
      utPlates[utPlateIndex].className = 'ph-plate ut-lens is-outgoing';
      utPlateIndex = 1 - utPlateIndex;
      var lens = utPlates[utPlateIndex];
      lens.className = 'ph-plate ut-lens is-preparing';
      lens.style.width = width + 'px';
      lens.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      fieldTransform(utFields[utPlateIndex], x, y, width, 60);
      void lens.offsetWidth;
      utPlateKey = key;
    }
    fieldTransform(utFields[utPlateIndex], x, y, width, 60);
    utPlates[utPlateIndex].className = 'ph-plate ut-lens is-current on-focus';
  }
  /* With icon-only apps, the focused app's name is written beside (list) or under (dock) it. */
  function renderAppFocusName(hs) {
    var it = hs.items[hs.i];
    if (S.c.layout === 'grid' || S.c.apps !== 'icons' || hs.mode !== 'browse' || hs.zone !== 'apps' || !it) {
      appFocusName.className = 'app-focus-name';
      return;
    }
    var name = app(it.id).name,
      list = S.c.layout === 'list',
      size = list ? 40 : 36,
      x,
      y;
    var width = Math.min(list ? 1056 : 1640, Math.ceil(textWidth(name, size, 500, -0.6, 'primary') + 8));
    if (list) {
      var p = phFields[photoPlateIndex]._placement;
      x = 280;
      y = p.y + p.height / 2 - 24;
    } else {
      x = clamp(dockAnchorCenter - width / 2, 140, 1780 - width);
      y = 932;
    }
    appFocusName.textContent = name;
    appFocusName.style.width = width + 'px';
    appFocusName.style.left = x + 'px';
    appFocusName.style.top = y + fontShift('primary', size) + 'px';
    appFocusName.className = 'app-focus-name is-on';
  }

  /* ---------- Dock ---------- */
  function dockGeom(n) {
    return Zeno.geometry.dock(n, S.c.apps, S.geom === 'broad');
  }
  function dockOffset(n, i, g) {
    return Zeno.geometry.dockOffset(n, i, g, scroll, S.reflow);
  }

  function dockLabel(a) {
    var size = dockLabelSize(a.id),
      top = (S.c.apps === 'text' ? 28 : 128) + fontShift('primary', size);
    return (
      '<span class="label" style="font-size:' +
      size +
      'px;top:' +
      top +
      'px"><span class="label-ink">' +
      esc(a.name) +
      '</span></span>'
    );
  }
  function dockTileHtml(a) {
    var style = S.c.apps,
      mark = style === 'icons' ? appMark(a, 136, 88, 72) : style === 'both' ? appMark(a, 120, 72, 58) : '';
    return mark + (style === 'icons' ? '' : dockLabel(a));
  }

  /* In a broad dock a long label can cross the shelf edge before its icon does.
     Tiles whose visible content is fully outside the shelf are flagged so icon and
     label fade together; this is re-checked every frame while the track moves. */
  function syncDockEdges() {
    var broad = S.c.layout === 'dock' && S.geom === 'broad',
      clip = shelf.getBoundingClientRect(),
      pending = [];
    Array.prototype.forEach.call(track.querySelectorAll('.tile'), function (tile) {
      var part = tile.querySelector(S.c.apps === 'text' ? '.label-ink' : '.mark'),
        box = part && part.getBoundingClientRect();
      var outside = !!(broad && box && (box.right <= clip.left || box.left >= clip.right));
      var cls = tile.className.replace(/\s+is-outside-icon/g, '') + (outside ? ' is-outside-icon' : '');
      if (cls !== tile.className) pending.push([tile, cls]);
    });
    pending.forEach(function (p) {
      p[0].className = p[1];
    });
  }
  function trackDockEdges() {
    dockEdgeFrame = 0;
    if (S.c.layout !== 'dock' || S.geom !== 'broad') return;
    syncDockEdges();
    if (Date.now() < dockEdgeUntil) dockEdgeFrame = window.requestAnimationFrame(trackDockEdges);
  }
  function watchDockEdges(ms) {
    dockEdgeUntil = Date.now() + ms;
    if (!dockEdgeFrame) dockEdgeFrame = window.requestAnimationFrame(trackDockEdges);
  }

  /* The glass mat and its scrim are full-stage images positioned inside the dock so the
     blur lines up exactly with the photograph behind it. */
  function placeDockFrame(g) {
    var mid = g.y + g.h / 2;
    dock.style.left = g.x + 'px';
    dock.style.top = g.y + 'px';
    dock.style.width = g.w + 'px';
    dock.style.height = g.h + 'px';
    dock.style.setProperty('--tile-w', g.tw + 'px');
    dock.style.setProperty('--tile-h', g.th + 'px');
    dock.style.setProperty('--dock-h', g.h + 'px');
    dock.style.setProperty('--nudge-top', (g.th - 48) / 2 + 'px');
    IMG.mat.style.left = -g.x + 'px';
    IMG.mat.style.top = -g.y + 'px';
    IMG.mat.style.transformOrigin = '960px ' + mid + 'px';
    matScrim.style.left = -g.x + 'px';
    matScrim.style.top = SCRIM_Y - g.y + 'px';
    matScrim.style.transformOrigin = '960px ' + (mid - SCRIM_Y) + 'px';
    shelf.style.width = g.shelf + 'px';
  }
  function placeDockCues(g, n, empty) {
    var paged = !g.broad && !empty;
    cueL.style.left = g.x - 72 + 'px';
    cueR.style.left = g.x + g.w + 24 + 'px';
    cueL.style.top = cueR.style.top = g.y + g.h / 2 - 24 + 'px';
    cueL.className = 'cue' + (paged && scroll.first > 0 ? ' is-on' : '');
    cueR.className = 'cue' + (paged && scroll.first + g.vis < n ? ' is-on' : '');
  }

  function renderDock(hs) {
    var items = hs.items,
      n = items.length,
      empty = !n,
      g = dockGeom(empty ? -1 : n);
    var anchor = clamp(hs.i, 0, Math.max(0, n - 1)),
      off = empty ? 0 : dockOffset(n, anchor, g);
    var onTiles = hs.zone === 'apps',
      marked = hs.zone === 'util' || hs.zone === 'preview';

    dock.className = 'dock' + (empty ? ' is-empty' : '');
    placeDockFrame(g);
    dockAnchorCenter = g.x + 16 + anchor * g.pitch - off + g.tw / 2;
    shelf.className =
      'shelf' +
      (g.broad && off > 0 ? ' fade-l' : '') +
      (g.broad && off + g.shelf < n * g.pitch - 8 ? ' fade-r' : '');

    keyed(track, items, function (el, it, i) {
      var a = app(it.id),
        x = i * g.pitch,
        here = i === anchor,
        cls = ['tile', 'k-app'];
      if (onTiles && here) cls.push('is-focus');
      if (marked && here) cls.push('is-sel');
      if (g.broad && (x - off < -1 || x + g.tw - off > g.shelf + 1)) cls.push('is-partial');
      if (!hasMark(a)) cls.push('is-text');
      if (S.press === it.id) cls.push('is-press');
      setContent(
        el,
        ['app', it.id, dockLabelSize(it.id), S.c.bg, S.c.apps, homeFont(), a.name, appVisualKey(a)].join('|'),
        '<span class="tile-content">' + dockTileHtml(a) + '</span>'
      );
      el.className = cls.join(' ');
      el.style.transform = 'translate3d(' + x + 'px,0,0)';
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', a.name);
      attrs(el, 'app', i, 'home.app.' + it.id);
    });
    track.style.transform = 'translate3d(' + -off + 'px,0,0)';
    syncDockEdges();
    if (g.broad) watchDockEdges(220);

    plate.className =
      'plate' + (empty || hs.zone === null ? '' : onTiles ? ' on-focus' : marked ? ' on-sel' : '');
    plate.style.transform = 'translate3d(' + anchor * g.pitch + 'px,0,0)';
    placeDockCues(g, n, empty);
    setHTML(dockEmpty, empty ? emptyHomeHtml(hs.zone === 'empty') : '');
  }

  /* ---------- Photo list ---------- */
  /* ---------- Photo list ---------- */
  /* Two plates alternate: when focus moves to a row of a different size, the idle plate
     is sized and placed while invisible, then the two cross-fade. Plates never animate
     size or position, and each one's blurred field stays registered to the stage. */
  function renderPhotoPlate(id, width, height, y, state) {
    var key = [id, width, height, y].join('|');
    if (key !== photoPlateKey) {
      var leaving = phPlates[photoPlateIndex];
      leaving.className = leaving.className.replace(' is-current', '') + ' is-outgoing';
      photoPlateIndex = 1 - photoPlateIndex;
      var coming = phPlates[photoPlateIndex];
      coming.className = 'ph-plate is-preparing';
      coming.style.width = width + 'px';
      coming.style.height = height + 'px';
      coming.style.transform = 'translate3d(0,' + y + 'px,0)';
      fieldTransform(phFields[photoPlateIndex], 112, y, width, height);
      void coming.offsetWidth; /* commit opacity 0 before the cross-fade starts */
      photoPlateKey = key;
    }
    fieldTransform(phFields[photoPlateIndex], 112, y, width, height);
    phPlates[photoPlateIndex].className = 'ph-plate is-current' + (state ? ' ' + state : '');
  }
  /* A field shows the stage-sized blurred photo through a plate at (x, y). The clear
     glass finish is scaled up a little so its edges never show while it drifts. */
  function fieldTransform(el, x, y, width, height) {
    el._placement = { x: x, y: y, width: width, height: height };
    el.style.transformOrigin = x + width / 2 + 'px ' + (y + height / 2) + 'px';
    var zoom = S.c.bg === 'photo' && S.c.material === 'tint' && !REDUCED_MOTION ? ' scale(1.04)' : '';
    el.style.transform = 'translate3d(' + -x + 'px,' + -y + 'px,0)' + zoom;
  }
  function emptyHomeHtml(focused) {
    return (
      '<p>Nessuna app sulla Home</p><button type="button" tabindex="-1" class="btn' +
      (focused ? ' is-focus' : '') +
      '" data-z="empty" data-i="0" data-action="home.add-apps">' +
      icon('plus') +
      '<span>Aggiungi app</span></button>'
    );
  }
  var LIST_MARKS = { icons: [88, 88, 72], both: [84, 64, 54] };
  function listRowHtml(a, type) {
    var dims = LIST_MARKS[S.c.apps],
      body = dims ? appMark(a, dims[0], dims[1], dims[2]) : '';
    if (S.c.apps !== 'icons')
      body +=
        '<span class="ph-name" style="font-size:' +
        type.size +
        'px;top:' +
        type.top +
        'px">' +
        esc(a.name) +
        '</span>';
    return '<span class="ph-group">' + body + '</span>';
  }
  function hideBrokenMark(row) {
    var img = row.querySelector('.mark img');
    if (!img) return;
    img.onerror = function () {
      this.style.visibility = 'hidden';
    };
    if (img.complete && !img.naturalWidth) img.style.visibility = 'hidden';
  }

  function renderList(hs) {
    var L = Zeno.geometry.LIST,
      items = hs.items,
      n = items.length,
      anchor = clamp(hs.i, 0, Math.max(0, n - 1));
    var onRows = hs.zone === 'apps',
      marked = hs.zone === 'util' || hs.zone === 'preview';
    var first = (scroll.photo = Zeno.geometry.listFirst(scroll.photo, anchor, n));

    phList.className = 'ph-list';
    phList.style.height = Zeno.geometry.LIST_HEIGHT + 'px';
    phRows.style.top = L.rowsTop + 'px';
    keyed(phRows, items, function (row, it, i) {
      var a = app(it.id),
        type = photoLabel(it.id),
        here = i === anchor,
        cls = ['ph-row', 'k-app'];
      setContent(
        row,
        [it.id, a.name, appVisualKey(a), type.size, S.c.bg, S.c.apps, homeFont()].join('|'),
        listRowHtml(a, type)
      );
      hideBrokenMark(row);
      if (onRows && here) cls.push('is-focus');
      if (marked && here) cls.push('is-sel');
      if (S.press === it.id) cls.push('is-press');
      row.className = cls.join(' ');
      row.style.width = '1200px';
      row.style.height = L.pitch + 'px';
      row.style.transform = 'translate3d(0,' + i * L.pitch + 'px,0)';
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', a.name);
      attrs(row, 'app', i, 'home.app.' + it.id);
    });
    phRows.style.transform = 'translate3d(0,' + -first * L.pitch + 'px,0)';

    var glass = S.c.focus === 'glass';
    var state = !n || hs.zone === null ? '' : glass && onRows ? 'on-focus' : glass && marked ? 'on-sel' : '';
    renderPhotoPlate(
      items[anchor] ? items[anchor].id : '',
      items[anchor] ? listPlateWidth(items[anchor].id) : 360,
      L.plateH,
      L.plateTop + (anchor - first) * L.pitch,
      state
    );
    phEmpty.className = 'ph-empty' + (n ? '' : ' is-on');
    setHTML(phEmpty, n ? '' : emptyHomeHtml(hs.zone === 'empty'));
  }

  /* ---------- Sheets and detail pages ----------
     A sheet's frame (its fixed markup) is built once per view and kind; on later
     renders only the named [data-slot] elements are filled, so persistent scrollers
     keep their transforms and can animate. */
  function renderSheet(t, sheet) {
    var detail = isSettingsDetail(t);
    sheetEl.hidden = !(sheet || detail);
    sheetView.hidden = !sheet;
    if (sheet) sheetView.setAttribute('aria-modal', 'true');
    else sheetView.removeAttribute('aria-modal');
    sceneEl.setAttribute('aria-hidden', sheet || detail ? 'true' : 'false');
    if (!sheet) {
      sheetView.innerHTML = '';
      sheetKey = '';
      return;
    }
    var key = [t.id, t.mode || '', t.msg || '', S.variant, S.c.bg].join('|');
    if (key !== sheetKey) {
      sheetView.innerHTML = FRAMES[t.id](t);
      sheetKey = key;
      slotEls = {};
      Array.prototype.forEach.call(sheetView.querySelectorAll('[data-slot]'), function (el) {
        slotEls[el.getAttribute('data-slot')] = el;
      });
    }
    FILLS[t.id](t, slotEls);
  }

  function detailTitle(t) {
    if (t.group === 'sourceprofile') return ZenoSources.get(t.sourceKey).name;
    if (t.group === 'focus') return S.c.layout === 'list' ? 'Vetro e selezione' : 'Vetro';
    return DETAIL_NAMES[t.group];
  }
  /* One row of a detail page. Axis rows are radio choices with a tick; option rows are
     toggles; anything else opens something and gets a forward chevron. */
  function detailCommand(t, item, inner, extraClass) {
    var applied = item.selected || (item.axis && S.c[item.axis] === item.value);
    var loading = !!(
      item.axis &&
      S.pending &&
      S.pending.target[item.axis] === item.value &&
      S.pending.row === item.axis
    );
    var cls =
      'setting-choice' +
      (extraClass ? ' ' + extraClass : '') +
      (t.f.action === item.action ? ' is-focus' : '') +
      (item.disabled ? ' is-disabled' : '') +
      (applied ? ' is-applied' : '') +
      (loading ? ' is-loading' : '');
    var role = item.axis
      ? ' role="radio" aria-checked="' + !!applied + '"'
      : item.selected !== undefined
        ? ' aria-pressed="' + !!applied + '"'
        : '';
    var label = item.axis && item.value === 'both' ? 'Icone e nomi' : item.label;
    var tick = item.axis
      ? '<span class="setting-tick" aria-hidden="true">' + (applied ? icon('check') : '') + '</span>'
      : '';
    return (
      '<button type="button" tabindex="-1" class="' +
      cls +
      '"' +
      role +
      ' aria-label="' +
      esc(label) +
      '" aria-disabled="' +
      !!item.disabled +
      '" aria-busy="' +
      loading +
      '"' +
      ' data-z="detail" data-i="0" data-id="' +
      item.action +
      '" data-action="' +
      item.action +
      '">' +
      inner +
      tick +
      '</button>'
    );
  }
  function detailItemBody(item, section, t) {
    var body = '';
    if (item.colorSwatch)
      body += '<span class="zeno-swatch" style="background:' + item.colorSwatch + '"></span>';
    if (item.axis === 'inkColor')
      body += '<span class="zeno-swatch" style="background:' + INK_COLORS[item.value].hex + '"></span>';
    if (item.sourceIcon)
      body += ZenoSourceIcons.mark(item.sourceIcon, item.sourceBadge, item.sourceShowBadge, 84, 64);
    if (item.axis === 'bg' || item.thumbnail) {
      body +=
        item.value === 'light' || item.value === 'dark'
          ? '<span class="setting-swatch swatch-' + item.value + '" aria-hidden="true"></span>'
          : '<img class="setting-swatch" src="' + thumbSrc(wall(S.c.wall)) + '" alt="">';
    }
    var description = item.description
      ? '<span class="setting-description" style="font-size:' +
        fitSettingText(item.description, section.horizontal ? 140 : 540, 23) +
        'px">' +
        esc(item.description) +
        '</span>'
      : '';
    body +=
      '<span class="setting-copy"><span class="setting-name" style="font-size:' +
      settingLabelSize(item, section, t) +
      'px">' +
      esc(item.label) +
      '</span>' +
      description +
      '</span>';
    if (!item.axis)
      body +=
        item.selected !== undefined
          ? '<span class="setting-option-state">' + (item.selected ? icon('check') : '') + '</span>'
          : icon('right', 'setting-forward');
    return body;
  }
  function detailSectionHtml(section, t) {
    var radios = section.items[0] && section.items[0].axis;
    var group = radios
      ? ' role="radiogroup" aria-label="' +
        esc(section.title || LOOK_NAMES[section.id] || DETAIL_NAMES[t.group]) +
        '"'
      : '';
    var items = section.items
      .map(function (item) {
        if (item.info)
          return (
            '<div class="setting-info"><span class="setting-info-label">' +
            esc(item.label) +
            '</span><span class="setting-info-value">' +
            esc(item.description || '') +
            '</span></div>'
          );
        return detailCommand(
          t,
          item,
          detailItemBody(item, section, t),
          item.description ? 'has-description' : ''
        );
      })
      .join('');
    return (
      '<section class="setting-section' +
      (section.horizontal ? ' is-horizontal' : '') +
      ' section-' +
      section.id +
      '">' +
      (section.title
        ? '<h3 class="setting-label" id="setting-' + section.id + '">' + section.title + '</h3>'
        : '') +
      '<div class="setting-options"' +
      group +
      '>' +
      items +
      '</div>' +
      (section.reason
        ? '<p class="setting-reason" style="font-size:' +
          fitSettingText(section.reason, 640, 24) +
          'px">' +
          esc(section.reason) +
          '</p>'
        : '') +
      '</section>'
    );
  }
  /* Keeps the focused row inside the scrolling column, with 8px to spare. */
  function scrollDetailToFocus(t) {
    if (t._scrollGroup !== t.group) {
      appearanceRows.scrollTop = 0;
      t._scrollGroup = t.group;
    }
    if (t.group === 'location' || t.group === 'about') return;
    var focus = appearanceRows.querySelector('.is-focus');
    if (!focus) return;
    var k = stage.getBoundingClientRect().width / 1920,
      box = appearanceRows.getBoundingClientRect(),
      r = focus.getBoundingClientRect();
    if (r.bottom > box.bottom) appearanceRows.scrollTop += (r.bottom - box.bottom) / k + 8;
    else if (r.top < box.top) appearanceRows.scrollTop -= (box.top - r.top) / k + 8;
  }
  function detailStatus(t) {
    if (S.pending)
      return (
        '<p>Caricamento di ' +
        esc(S.pending.row === 'font' ? Fonts.name(S.pending.target.font) : 'la scelta') +
        '…</p><p>Indietro annulla la modifica.</p>'
      );
    var e = S.lookError;
    if (!e) return '';
    var what =
      e.type === 'save'
        ? 'Impossibile salvare questa modifica.'
        : e.type === 'font'
          ? 'Impossibile caricare ' + esc(Fonts.name(e.font)) + '.'
          : esc(e.reason || 'Impossibile caricare questo aspetto.');
    return (
      '<p class="setting-error">' +
      what +
      ' La scelta attuale viene conservata.</p>' +
      detailCommand(
        t,
        { action: 'settings.retry', label: 'Riprova' },
        '<span>Riprova</span>',
        'setting-retry'
      )
    );
  }
  /* The verb shown next to OK in the remote help line. */
  function detailHint(item) {
    var a = item.action;
    if (item.disabled) return '';
    if (a === 'settings.back') return 'Torna a ' + parentSettingsLabel();
    if (a === 'settings.retry') return 'Riprova questa modifica';
    if (item.axis) return 'Applica';
    if (a === 'background.wallpaper') return 'Scegli una fotografia';
    if (a === 'background.rotation') return 'Scegli un intervallo';
    if (a === 'system.refresh') return 'Aggiorna informazioni';
    if (item.option || item.selected !== undefined) return 'Applica';
    if (a.indexOf('edit.') === 0) return 'Modifica';
    if (a.indexOf('source.') === 0 || a === 'input.open') return 'Apri sorgente';
    return 'Apri';
  }
  function renderAppearance(t) {
    appearanceEl.hidden = !isSettingsDetail(t);
    if (appearanceEl.hidden) {
      appearanceEl.removeAttribute('aria-modal');
      return;
    }
    appearanceEl.setAttribute('aria-modal', 'true');
    if (t.id === 'wallpaper') {
      renderWallpaper(t);
      return;
    }
    V.appearance.norm(t);
    appearanceEl.className = 'appearance detail-' + t.group;
    appearanceRows.className = 'appearance-rows';
    appearanceTitle.textContent = detailTitle(t);
    var back = parentSettingsLabel();
    setHTML(
      appearanceBack,
      detailCommand(
        t,
        { action: 'settings.back', label: back },
        icon('left') + '<span>' + back + '</span>',
        'setting-back'
      )
    );
    setHTML(
      appearanceRows,
      detailSections(t)
        .map(function (section) {
          return detailSectionHtml(section, t);
        })
        .join('')
    );
    if (t.group === 'calendar') {
      var stale = appearanceRows.querySelector('.zeno-calendar'),
        holder = document.createElement('div');
      if (stale) stale.parentNode.removeChild(stale);
      holder.innerHTML = calendarHTML(t);
      appearanceRows.appendChild(holder.firstChild);
    }
    scrollDetailToFocus(t);
    setHTML(appearanceStatus, detailStatus(t));
    setHTML(appearanceDesc, remoteHelp(detailHint(detailLocation(t).item)));
  }
  /* Font size that makes `text` fit `width` at the UI weight, never above `size` or below 18px. */
  function fitSettingText(text, width, size) {
    var measured = textWidth(ZenoI18n.t(text), size, 400, 0, 'ui');
    return Math.max(18, Math.min(size, Math.floor((size * width) / Math.max(1, measured))));
  }
  function settingLabelSize(item, section, t) {
    var swatches = item.axis === 'inkColor' || !!item.colorSwatch,
      picker = t.group === 'sourceicon',
      base = picker || swatches ? 22 : section.horizontal ? 28 : 32,
      width = section.horizontal ? (640 - (section.items.length - 1) * 12) / section.items.length : 640,
      space = picker ? width - 20 : width - (section.horizontal ? 52 : 92) - (item.sourceIcon ? 104 : 0),
      measured = textWidth(ZenoI18n.t(item.label), base, 400, 0, 'ui');
    return Math.max(picker ? 18 : 20, Math.min(base, Math.floor((base * space) / Math.max(1, measured))));
  }
  function fillHomeActions(t, el, actions, zone, prefix) {
    setHTML(
      el.actions,
      actions
        .map(function (a, i) {
          return (
            '<button class="pc-option' +
            (i === t.f.i ? ' is-focus' : '') +
            '" data-z="' +
            zone +
            '" data-i="' +
            i +
            '" data-action="' +
            prefix +
            a[0] +
            '">' +
            esc(a[1]) +
            '</button>'
          );
        })
        .join('')
    );
    var active = el.actions.querySelector('.is-focus');
    if (active) {
      if (active.offsetTop < el.actions.scrollTop) el.actions.scrollTop = active.offsetTop;
      else if (active.offsetTop + active.offsetHeight > el.actions.scrollTop + el.actions.clientHeight)
        el.actions.scrollTop = active.offsetTop + active.offsetHeight - el.actions.clientHeight;
    }
  }
  function pickerNote(t, shown, candidate) {
    if (t.failedId) {
      var name = wall(t.failedId).name;
      return S.err
        ? 'Impossibile salvare ' + name + '.'
        : Materials.downloadError() || 'Impossibile caricare ' + name + '.';
    }
    if (candidate.download && shown.id !== candidate.id && !S.wallPending)
      return 'OK scarica da internet e applica · poi disponibile offline';
    if (t.previewDue) return 'Preparazione di ' + candidate.name + '…';
    if (S.wallPending)
      return (t.applyPending ? 'Applicazione di ' : 'Caricamento di ') + candidate.name + '…';
    return shown.id === S.c.wall ? 'Applicato' : 'Anteprima';
  }
  function pickerHint(t, candidate) {
    if (t.f.zone === 'back') return 'Torna a Sfondo e colori';
    if (t.f.zone === 'retry') return 'Riprova questa fotografia';
    if (t.f.zone === 'photo' && candidate.id === S.c.wall && !S.pending && !t.failedId) return '';
    return 'Applica fotografia';
  }
  function pickerRow(row, item, i, t) {
    var w = item.wall,
      inView = i >= t.top && i < t.top + PICKER.rows,
      applied = w.id === S.c.wall;
    var thumb = inView ? '<img src="' + thumbSrc(w) + '" alt="">' : '';
    setContent(
      row,
      w.id + '|' + inView,
      '<span class="wallpaper-thumb">' +
        thumb +
        '</span><span class="setting-copy"><span class="setting-name">' +
        esc(w.name) +
        '</span></span><span class="setting-tick" aria-hidden="true"></span>'
    );
    row.className =
      'setting-choice wallpaper-choice' +
      (t.f.zone === 'photo' && t.i === i ? ' is-focus' : '') +
      (applied ? ' is-applied' : '');
    row.style.transform = 'translate3d(0,' + i * PICKER.pitch + 'px,0)';
    row.style.visibility = inView ? 'visible' : 'hidden';
    var aria = {
      role: 'radio',
      tabindex: '-1',
      'aria-label': w.name,
      'aria-checked': String(applied),
      'aria-posinset': String(i + 1),
      'aria-setsize': String(WALLS.length),
      'aria-busy': String(t.previewDue === w.id || S.wallPending === w.id)
    };
    Object.keys(aria).forEach(function (name) {
      row.setAttribute(name, aria[name]);
    });
    attrs(row, 'wall-choice', i, 'wallpaper.choose.' + w.id);
    setHTML(row.querySelector('.setting-tick'), applied ? icon('check') : '');
    var img = row.querySelector('img');
    if (!img || img._watched) return;
    img._watched = true;
    img.onerror = function () {
      this.parentNode.className = 'wallpaper-thumb is-missing';
    };
    if (img.complete && !img.naturalWidth) img.onerror();
  }
  function renderWallpaper(t) {
    V.wallpaper.norm(t);
    var shown = wall(S.wallShown) || wall(S.c.wall),
      candidate = WALLS[t.i];
    appearanceEl.className = 'appearance detail-wallpaper';
    appearanceTitle.textContent = 'Fotografia';
    appearanceRows.className = 'appearance-rows wallpaper-picker';
    setHTML(
      appearanceBack,
      '<button type="button" tabindex="-1" class="setting-choice setting-back' +
        (t.f.zone === 'back' ? ' is-focus' : '') +
        '" data-z="wall-back" data-action="wallpaper.back">' +
        icon('left') +
        '<span>Sfondo e colori</span></button>'
    );
    setHTML(
      appearanceRows,
      '<div class="wallpaper-edge wallpaper-before" aria-hidden="true">' +
        icon('up') +
        '</div>' +
        '<div class="wallpaper-list" role="radiogroup" aria-label="Fotografia"><div class="wallpaper-rows"></div></div>' +
        '<div class="wallpaper-edge wallpaper-after" aria-hidden="true">' +
        icon('down') +
        '</div>'
    );
    var rows = appearanceRows.querySelector('.wallpaper-rows');
    keyed(
      rows,
      WALLS.map(function (w) {
        return { key: w.id, wall: w };
      }),
      function (row, item, i) {
        pickerRow(row, item, i, t);
      }
    );
    rows.style.transform = 'translate3d(0,' + -t.top * PICKER.pitch + 'px,0)';
    appearanceRows.querySelector('.wallpaper-before').className =
      'wallpaper-edge wallpaper-before' + (t.top > 0 ? ' is-on' : '');
    appearanceRows.querySelector('.wallpaper-after').className =
      'wallpaper-edge wallpaper-after' + (t.top + PICKER.rows < WALLS.length ? ' is-on' : '');
    var status =
      '<p class="wallpaper-preview-name"><span>' +
      esc(shown.name) +
      '</span><span class="wallpaper-count">' +
      (wallIndex(shown.id) + 1) +
      ' di ' +
      WALLS.length +
      '</span></p>' +
      '<p class="wallpaper-preview-state' +
      (t.failedId ? ' setting-error' : '') +
      '">' +
      esc(pickerNote(t, shown, candidate)) +
      '</p>';
    if (t.failedId)
      status +=
        '<button type="button" tabindex="-1" class="setting-choice setting-retry' +
        (t.f.zone === 'retry' ? ' is-focus' : '') +
        '" data-z="wall-retry" data-action="wallpaper.retry">Riprova</button>';
    setHTML(appearanceStatus, status);
    setHTML(appearanceDesc, remoteHelp(pickerHint(t, candidate)));
  }
  /* After a failed save, a short line under the focused control says so; OK retries.
     It is drawn at stage level so it never changes the control itself. */
  var STATUS_DROP = [
    ['home.app.', 171],
    ['apps.order.', 86],
    ['apps.toggle.', 164],
    ['apps.add.', 164],
    ['layout.', 54]
  ];
  function statusDrop(action) {
    var hit = Zeno.util.find(STATUS_DROP, function (rule) {
      return action.indexOf(rule[0]) === 0;
    });
    return hit ? hit[1] : 40;
  }
  function hideFocusStatus() {
    focusStatus.className = 'focus-status';
  }
  function renderFocusStatus(t) {
    Array.prototype.forEach.call(stage.querySelectorAll('.has-local-status'), function (el) {
      el.className = el.className.replace(/\s+has-local-status/g, '');
    });
    if (isSettingsDetail(t) || !S.err) {
      hideFocusStatus();
      return;
    }
    var target = visibleActions('.is-focus[data-action]')[0],
      text = 'Non salvato. Premi OK per riprovare.';
    if (!target) {
      hideFocusStatus();
      return;
    }
    if (target.parentNode === utilsEl && utilsEl.className.indexOf('is-icons') >= 0) {
      renderUtilFocusLabel(target);
      hideFocusStatus();
      return;
    }
    var besidePlate = S.c.layout === 'list' && target.className.indexOf('ph-row') >= 0,
      box = stageBox(target),
      x = box.x,
      y = box.y,
      w = box.w;
    target.className += ' has-local-status';
    if (besidePlate) {
      x = 112 + parseFloat(phPlates[photoPlateIndex].style.width) + 24;
      y += (box.h - 28) / 2;
      w = 400;
    } else y += statusDrop(target.getAttribute('data-action'));
    var solid =
      /(?:^|\s)(?:u|btn|er-rm|set-row)(?:\s|$)/.test(target.className) &&
      target.parentNode !== utilsEl &&
      target.parentNode.className.indexOf('s-head') < 0;
    var width = Math.min(w - 16, 800);
    focusStatus.className =
      'focus-status is-on' + (solid ? ' dark-ink' : '') + (besidePlate ? ' photo-status' : '');
    focusStatus.textContent = text;
    focusStatus.style.left = clamp(x + 8, 112, 1808 - width) + 'px';
    focusStatus.style.top = clamp(y, 72, 988) + 'px';
    focusStatus.style.width = width + 'px';
  }
  /* Header buttons of a sheet: [id, label, extra class, icon]. */
  function headButtons(list, focusIndex, prefix) {
    return list
      .map(function (b, i) {
        var cls = 'btn' + (i === focusIndex ? ' is-focus' : '') + (b[2] ? ' ' + b[2] : ''),
          name = b[0] === 'undo' ? undoCaption() : b[1];
        return (
          '<button type="button" tabindex="-1" class="' +
          cls +
          '" data-z="head" data-i="' +
          i +
          '" data-action="' +
          prefix +
          '.' +
          b[0] +
          '" aria-label="' +
          esc(name) +
          '">' +
          (b[3] ? icon(b[3]) : '') +
          '<span>' +
          b[1] +
          '</span></button>'
        );
      })
      .join('');
  }
  function cue(where, slot) {
    return (
      '<div class="row-cue ' +
      where +
      '" data-slot="' +
      slot +
      '" aria-hidden="true">' +
      icon(slot === 'before' || slot === 'otherBefore' ? 'up' : 'down') +
      '</div>'
    );
  }
  var FRAMES = {
    apps: function () {
      return (
        '<h2 class="s-title" data-slot="title"></h2><p class="s-sub" data-slot="sub"></p><div class="s-head" data-slot="head"></div>' +
        '<div class="grid-view" data-slot="view"><div class="grid-in" data-slot="grid"></div></div>' +
        cue('grid-before', 'before') +
        cue('grid-after', 'after')
      );
    },
    editor: function () {
      return (
        '<h2 class="s-title">App sulla Home</h2><p class="s-sub" data-slot="sub"></p><div class="s-head" data-slot="head"></div>' +
        '<p class="s-label z-home" data-slot="lh"></p><p class="s-label z-other">Altre app</p>' +
        '<div class="ed-home" data-slot="home"></div><div class="ed-order-break" data-slot="break"></div>' +
        '<div class="ed-other-view" data-slot="ov"><div class="ed-other" data-slot="other"></div></div><div class="ed-origin" data-slot="origin"></div>' +
        cue('editor-before', 'otherBefore') +
        cue('editor-after', 'otherAfter')
      );
    },
    pc: function () {
      return (
        '<div class="pc-card"><h2 data-slot="title"></h2><p data-slot="sub"></p><div class="home-actions-list" data-slot="actions"></div><div class="pc-hint">' +
        remoteHelp('Seleziona') +
        '</div></div>'
      );
    },
    homeactions: function () {
      return FRAMES.pc();
    },
    keyboard: function (t) {
      return (
        '<h2 class="s-title">' +
        esc(t.label) +
        '</h2><div class="keyboard-value" data-slot="value"></div><div class="keyboard-grid" data-slot="keys"></div><p class="keyboard-error" data-slot="error"></p>'
      );
    },
    settings: function () {
      return (
        '<div class="zeno-settings-window"><aside class="zeno-sidebar"><div class="zeno-brand">' +
        Zeno.glyphs.logo() +
        '<span>Zeno <b>TV</b></span></div><nav data-slot="sidebar"></nav></aside><section class="zeno-settings-content"><h2 data-slot="title"></h2><p class="zeno-section-note" data-slot="sub"></p><div class="zeno-setting-cards" data-slot="cards"></div><div class="zeno-navigation-note">' +
        remoteHelp('Apri') +
        '</div></section></div>'
      );
    },
    message: function (t) {
      var m = messageContent(t);
      return (
        '<div class="zeno-message-window"><h2 class="msg-title">' +
        esc(m.title) +
        '</h2><p class="msg-line">' +
        esc(m.line) +
        '</p><p class="msg-note">' +
        esc(m.note) +
        '</p><div class="msg-acts" data-slot="acts"></div></div>'
      );
    }
  };
  /* All apps: a five-column grid, three rows visible. */
  var APP_GRID = { cols: 5, colW: 344, rowH: 240, rows: 3 };
  function gridTileHtml(id) {
    var a = app(id),
      state = onHome(id) ? badge(true) + '<span>Sulla Home</span>' : '';
    return (
      '<span class="panel-content">' +
      appMark(a, 120, 72, 58) +
      '<span class="label">' +
      esc(a.name) +
      '</span></span><span class="state">' +
      state +
      '</span>'
    );
  }
  function fillApps(t, el) {
    var f = t.f,
      G = APP_GRID,
      items = appsItems(),
      n = items.length,
      rows = Math.ceil(n / G.cols);
    setHTML(el.title, 'App installate');
    setHTML(
      el.sub,
      esc(catalog.loading ? 'Caricamento delle app…' : catalog.error || (n ? '' : 'Nessuna app trovata.'))
    );
    setHTML(el.head, headButtons(appsHead(), f.zone === 'head' ? 0 : -1, 'apps'));
    el.head.className = 's-head' + (f.zone === 'head' ? ' is-awake' : '');
    if (f.zone === 'grid') t.top = Zeno.nav.windowStart(t.top, Math.floor(f.i / G.cols), G.rows, rows);
    t.top = clamp(t.top, 0, Math.max(0, rows - G.rows));
    keyed(
      el.grid,
      items.map(function (id) {
        return { key: id, id: id };
      }),
      function (tile, it, i) {
        var a = app(it.id);
        setContent(tile, [it.id, a.name, appVisualKey(a), onHome(it.id)].join('|'), gridTileHtml(it.id));
        tile.className = 'gt' + (f.zone === 'grid' && i === f.i ? ' is-focus' : '');
        tile.style.transform =
          'translate3d(' + (i % G.cols) * G.colW + 'px,' + Math.floor(i / G.cols) * G.rowH + 'px,0)';
        tile.setAttribute('role', 'button');
        tile.setAttribute('aria-label', a.name);
        attrs(tile, 'grid', i, 'apps.open.' + it.id);
      }
    );
    el.grid.style.transform = 'translate3d(0,' + -t.top * G.rowH + 'px,0)';
    var above = t.top > 0,
      below = rows - t.top > G.rows;
    el.view.className = 'grid-view' + (above ? ' more-before' : '') + (below ? ' more-after' : '');
    el.before.className = 'row-cue grid-before' + (above ? ' is-on' : '');
    el.after.className = 'row-cue grid-after' + (below ? ' is-on' : '');
  }
  var FILLS = {
    apps: fillApps,
    editor: fillEditor,
    pc: function (t, el) {
      var profile = ZenoSources.get(t.sourceKey);
      setHTML(el.title, esc(profile.name));
      setHTML(el.sub, profile.key.replace('-', ' ') + (S.c.homeLocked ? ' · Home bloccata' : ''));
      fillHomeActions(t, el, inputActions(t), 'pc', 'pcmenu.');
    },
    homeactions: function (t, el) {
      setHTML(el.title, esc(app(t.app).name));
      setHTML(el.sub, S.c.homeLocked ? 'Home bloccata' : '');
      fillHomeActions(t, el, homeActions(t), 'homeaction', 'homeaction.');
    },
    keyboard: function (t, el) {
      setHTML(el.value, esc(t.value || ' '));
      setHTML(
        el.keys,
        keyboardKeys(t)
          .map(function (key, i) {
            return (
              '<button class="keyboard-key' +
              (i === t.f.i ? ' is-focus' : '') +
              '" data-z="key" data-i="' +
              i +
              '" data-action="keyboard.' +
              key +
              '">' +
              (key === 'delete' ? '⌫' : key === 'clear' ? 'Svuota' : key === 'save' ? 'Salva' : key) +
              '</button>'
            );
          })
          .join('')
      );
      setHTML(el.error, esc(t.error));
    },
    settings: function (t, el) {
      var c = settingsCategory(t),
        rows = settingsRows();
      setHTML(
        el.sidebar,
        SETTINGS_CATEGORIES.map(function (category, i) {
          return (
            '<button class="zeno-category' +
            (category.id === c.id ? ' is-current' : '') +
            (t.f.zone === 'sidebar' && category.id === c.id ? ' is-focus' : '') +
            '" data-z="category" data-i="' +
            i +
            '" data-id="' +
            category.id +
            '" data-action="settings.category.' +
            category.id +
            '">' +
            icon(category.icon) +
            '<span>' +
            esc(category.name) +
            '</span></button>'
          );
        }).join('')
      );
      setHTML(el.title, esc(c.title));
      setHTML(el.sub, esc(c.note));
      setHTML(
        el.cards,
        c.cards
          .map(function (id, i) {
            var r = rows.filter(function (r) {
              return r.id === id;
            })[0];
            return (
              '<button class="zeno-setting-card' +
              (t.f.zone === 'cards' && t.f.i === i ? ' is-focus' : '') +
              '" data-z="settingcard" data-i="' +
              i +
              '" data-id="' +
              id +
              '" data-action="settings.' +
              (id === 'editor' ? 'editor' : 'group.' + id) +
              '"><span class="zeno-card-icon">' +
              icon(r.icon) +
              '</span><span class="zeno-card-title">' +
              esc(r.label) +
              '</span><span class="zeno-card-sub">' +
              esc(r.value) +
              '</span>' +
              icon('right', 'zeno-card-arrow') +
              '</button>'
            );
          })
          .join('')
      );
    },
    message: function (t, el) {
      var buttons = messageContent(t).actions.map(function (a, i) {
        var cls = 'btn' + (i === t.f.b ? ' is-focus' : '');
        return (
          '<button type="button" tabindex="-1" class="' +
          cls +
          '" data-z="act" data-i="' +
          i +
          '" data-action="message.' +
          a[0] +
          '"><span>' +
          a[1] +
          '</span></button>'
        );
      });
      setHTML(el.acts, buttons.join(''));
    }
  };

  FRAMES.appdetail = function () {
    return (
      '<div class="zeno-app-window"><button class="zeno-back" data-z="appdetail-back" data-i="0" data-action="appdetail.back">' +
      icon('left') +
      '<span>Applicazioni</span></button><div class="zeno-app-summary" data-slot="summary"></div><div class="zeno-app-actions" data-slot="actions"></div><div class="zeno-app-info" data-slot="info"></div></div>'
    );
  };
  FILLS.appdetail = function (t, el) {
    var a = app(t.app),
      info = t.info,
      p = info && info.package;
    setHTML(
      el.summary,
      '<div class="zeno-app-logo">' +
        appMark(a, 180, 110, 94) +
        '</div><div><p class="zeno-eyebrow">APPLICAZIONI</p><h2>' +
        esc(a.name) +
        '</h2><p>' +
        esc(
          t.operation ||
            (t.loading
              ? 'Lettura informazioni…'
              : t.error || 'Versione ' + ((info && info.version) || (p && p.version) || 'non disponibile'))
        ) +
        '</p></div>'
    );
    setHTML(
      el.actions,
      appDetailActions(t)
        .map(function (action, i) {
          return (
            '<button class="zeno-app-action' +
            (i === t.f.i ? ' is-focus' : '') +
            '" data-z="appdetail" data-i="' +
            i +
            '" data-action="appdetail.' +
            action.id +
            '"><span>' +
            esc(action.name) +
            '</span><small>' +
            esc(action.note) +
            '</small>' +
            icon('right') +
            '</button>'
          );
        })
        .join('')
    );
    var focused = el.actions.querySelector('.is-focus');
    if (focused) {
      if (focused.offsetTop < el.actions.scrollTop) el.actions.scrollTop = focused.offsetTop;
      else if (focused.offsetTop + focused.offsetHeight > el.actions.scrollTop + el.actions.clientHeight)
        el.actions.scrollTop = focused.offsetTop + focused.offsetHeight - el.actions.clientHeight;
    }
    setHTML(
      el.info,
      '<p class="zeno-eyebrow">SUL TELEVISORE</p><dl><div><dt>Stato</dt><dd>' +
        esc(
          !info || info.running === null
            ? 'Non disponibile'
            : info.running
              ? 'In esecuzione'
              : info.serviceRunning
                ? 'Servizio in background'
                : 'Non in esecuzione'
        ) +
        '</dd></div><div><dt>Spazio occupato</dt><dd>' +
        statValue(p && p.totalSize) +
        '</dd></div><div><dt>Dati applicazione</dt><dd>' +
        statValue(p && p.dataSize) +
        '</dd></div><div><dt>RAM processo</dt><dd>' +
        statValue(info && info.memory) +
        '</dd></div></dl><p class="zeno-management-note">' +
        (t.bridge && t.bridge.available
          ? 'Chiusura e disinstallazione disponibili tramite il Mac. Cache e dati delle altre app si gestiscono dal menu Samsung.'
          : 'Mac non collegato: usa la gestione Samsung per disinstallare. Cache e dati delle altre app sono protetti dal sistema.') +
        '</p>'
    );
  };

  /* ---------- Appearance changes ----------
     Changing the look is a small transaction: check the patch, load what it needs
     (a typeface, a set of wallpaper materials), then commit everything in one frame.
     Starting another change, or going Back, cancels whatever is still loading. */
  var Materials = Zeno.materials.create({
    wall: wall,
    quality: function () {
      return S.c.imageQuality;
    },
    remoteURL: function (id, quality, variant) {
      return ZenoControl.wallpaperURL(id, quality, variant);
    },
    download: function (id, quality, done) {
      ZenoControl.prepareWallpaper(id, quality, done);
    }
  });
  var lookTicket = 0,
    committedBundle = null,
    reflowTicket = 0,
    fontTicket = 0;
  function registeredMaterial(id) {
    return S.c.bg === 'photo' && S.c.material === 'soft' && !!wall(id);
  }
  function bundleKey(look) {
    return Materials.key(look);
  }
  function loadBundle(look, ticket, done) {
    Materials.prepare(
      look,
      function () {
        return ticket === lookTicket;
      },
      done
    );
  }
  function installBundle(bundle, look, previewOnly) {
    if (bundle) {
      Materials.mount(bundle, IMG, previewOnly ? { bg: true } : null);
      S.bundleKey = bundle.key;
    }
    S.shown = {
      bg: look.bg,
      wall: look.wall,
      material: look.material,
      font: look.font,
      imageQuality: look.imageQuality
    };
    phFields.concat(utFields).forEach(function (el) {
      var p = el._placement;
      if (p) fieldTransform(el, p.x, p.y, p.width, p.height);
    });
    S.wallShown = look.wall;
    S.wallPending = null;
    S.wallError = null;
  }

  var PATCH_RULES = {
    desktop: function (v) {
      return ZenoDesktop.normalise(v, S.c.home, ZenoExtras.config().enabled);
    },
    cardColors: function (v) {
      return cleanCardColors(v);
    },
    wall: function (v) {
      if (!wall(v)) throw new Error('Unknown wallpaper: ' + v);
      return v;
    },
    inkColor: function (v) {
      if (!validInk(v)) throw new Error('Colore non valido.');
      return v;
    },
    font: function (v) {
      if (!Fonts.exists(v) || !Fonts.isOffered(v)) throw new Error('Unavailable font: ' + v);
      return v;
    }
  };
  function validatePatch(patch) {
    if (!patch || typeof patch !== 'object') throw new Error('look needs an appearance patch');
    var out = {};
    Object.keys(patch).forEach(function (k) {
      if (PATCH_RULES[k]) {
        out[k] = PATCH_RULES[k](patch[k]);
        return;
      }
      if (!LOOK_VALUES[k] || LOOK_VALUES[k].indexOf(patch[k]) < 0)
        throw new Error('Invalid appearance value: ' + k);
      out[k] = patch[k];
    });
    return out;
  }
  function cancelLook() {
    lookTicket++;
    S.pending = null;
    S.wallPending = null;
    S.lookError = null;
  }

  /* is-reflow holds transitions back for the two frames in which labels resize;
     is-font-switch cross-fades text briefly while the typeface changes. */
  function dropStageClass(name) {
    stage.className = stage.className.replace(new RegExp('\\s+' + name, 'g'), '');
  }
  function endReflowSoon(ticket) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (ticket !== reflowTicket) return;
        S.reflow = false;
        dropStageClass('is-reflow');
      });
    });
  }
  function endFontSwitchSoon(ticket) {
    setTimeout(
      function () {
        if (ticket !== fontTicket) return;
        S.fontSwitch = false;
        dropStageClass('is-font-switch');
      },
      REDUCED_MOTION ? 130 : 170
    );
  }

  function setLook(patch, options) {
    var opts = options || {},
      changes = validatePatch(patch),
      target = lookOf(S.c);
    Object.keys(changes).forEach(function (k) {
      target[k] = changes[k];
    });
    var changed = Object.keys(target).some(function (k) {
      return target[k] !== S.c[k];
    });
    cancelLook();
    S.err = null;
    var ticket = lookTicket,
      broken = false,
      bundle = null;
    var needImages =
      target.bg === 'photo' &&
      S.bundleKey !== bundleKey(target) &&
      (!S.shown ||
        S.shown.bg !== 'photo' ||
        target.wall !== S.c.wall ||
        target.imageQuality !== S.c.imageQuality ||
        materialApplies(target));
    var needFont = !Fonts.metrics(target.font),
      waitImages = needImages,
      waitFont = needFont;

    function commit(loaded) {
      var c = next(S.c.home.slice(), S.c.recent.slice()),
        fontChanged = target.font !== S.c.font;
      var relayout = fontChanged || target.apps !== S.c.apps || target.controls !== S.c.controls,
        reflowAt,
        fontAt;
      /* Only the fields this change is about: the rest may have moved on while
         images or fonts were loading (the Home being filled, for one). */
      Object.keys(changes).forEach(function (k) {
        c[k] = target[k];
      });
      S.pending = null;
      S.wallPending = null;
      if (!opts.transient && changed && !write(c, 'Appearance')) {
        S.lookError = {
          type: 'save',
          patch: changes,
          row: opts.row || S.appearanceFocus,
          transient: false
        };
        render();
        syncRotation();
        return;
      }
      if (opts.transient) S.c = c;
      if (relayout) {
        S.reflow = true;
        reflowAt = ++reflowTicket;
      }
      if (fontChanged) {
        S.fontSwitch = true;
        fontAt = ++fontTicket;
      }
      installBundle(loaded, target);
      if (loaded) committedBundle = loaded;
      S.lookError = null;
      S.previewBundle = null;
      render();
      syncRotation();
      if (relayout) endReflowSoon(reflowAt);
      if (fontChanged) endFontSwitchSoon(fontAt);
    }
    function abort(type, reason) {
      if (ticket !== lookTicket || broken) return;
      broken = true;
      S.pending = null;
      S.wallPending = null;
      if (type === 'load') S.wallError = target.wall;
      S.lookError = {
        type: type,
        reason: reason || null,
        patch: changes,
        row: opts.row || (type === 'font' ? 'font' : S.appearanceFocus),
        transient: !!opts.transient,
        wall: target.wall,
        font: target.font
      };
      if (type === 'font')
        log(
          opts.startup
            ? 'font fallback: ' + target.font
            : 'Font kept: ' + Fonts.name(S.c.font) + ' (' + reason + ')'
        );
      /* A personal typeface that fails at startup falls back to the baseline face for this session only. */
      if (type === 'font' && opts.startup && target.font !== Fonts.BASELINE) {
        setLook({ font: Fonts.BASELINE }, { transient: true });
        return;
      }
      render();
      syncRotation();
    }
    function arrived() {
      if (waitImages || waitFont || broken || ticket !== lookTicket) return;
      window.requestAnimationFrame(function () {
        if (!broken && ticket === lookTicket) commit(bundle);
      });
    }

    if (!needImages && !needFont) {
      commit(null);
      return;
    }
    S.pending = {
      patch: changes,
      target: target,
      row: opts.row || (needFont ? 'font' : S.appearanceFocus),
      transient: !!opts.transient,
      preview: false
    };
    if (needImages) {
      S.wallPending = target.wall;
      loadBundle(target, ticket, function (loaded, reason) {
        if (!loaded) {
          abort('load', reason);
          return;
        }
        bundle = loaded;
        waitImages = false;
        arrived();
      });
    }
    if (needFont)
      Fonts.ensure(
        target.font,
        function (ok, reason) {
          if (!ok) {
            abort('font', reason);
            return;
          }
          waitFont = false;
          arrived();
        },
        function () {
          render();
        }
      );
    render();
  }

  /* Wallpaper previews install a bundle without saving it; restoreLook() puts the
     committed look back when the preview is abandoned. */
  function showWall(id, done) {
    var target = lookOf(S.c);
    target.bg = 'photo';
    target.wall = id;
    cancelLook();
    S.wallError = null;
    var ticket = lookTicket;
    S.pending = { patch: { wall: id }, target: target, row: 'bg', preview: true, transient: false };
    S.wallPending = id;
    loadBundle(target, ticket, function (bundle) {
      S.pending = null;
      S.wallPending = null;
      if (!bundle) {
        S.wallError = id;
        done(false);
        return;
      }
      S.previewBundle = bundle;
      installBundle(bundle, target, true);
      done(true);
    });
    render();
  }
  function restoreLook() {
    cancelLook();
    S.previewBundle = null;
    if (S.c.bg === 'photo' && committedBundle && committedBundle.key === bundleKey(S.c))
      installBundle(committedBundle, S.c);
    else if (S.c.bg !== 'photo' || S.bundleKey === bundleKey(S.c)) installBundle(null, S.c);
    else setLook({}, { transient: true });
  }

  /* ---------- Timers, scenes and input ---------- */
  var clockTimer = 0;
  var rotation = Zeno.input.activeCountdown({
    identity: function () {
      return S.c.wall + '|' + S.c.mode;
    },
    active: function () {
      return (
        !document.hidden &&
        top().id === 'home' &&
        !top().move &&
        S.c.bg === 'photo' &&
        !S.pending &&
        mode().min > 0
      );
    },
    period: function () {
      return mode().min * QA.minuteMs;
    },
    elapsed: function () {
      setLook({ wall: WALLS[(wallIndex(S.c.wall) + 1) % WALLS.length].id }, { row: 'bg' });
    }
  });
  function resetRotation() {
    rotation.reset();
  }
  function syncRotation() {
    rotation.sync();
  }

  /* Ticks on the widget interval boundary so the clock changes exactly on the minute
     (or second, while a timer runs). */
  function updateClock() {
    clearTimeout(clockTimer);
    if (document.hidden) return;
    var t = top();
    if (S.c.layout === 'grid') ZenoWidgets.tick(gridHome, ZenoI18n.locale());
    else if (t.id === 'home' || isSettingsDetail(t)) renderCaption(t, homeState(t));
    var minute = Math.floor(Date.now() / 60000);
    if (
      t.id === 'appearance' &&
      (t.group === 'timer' || (t.group === 'worldclock' && t.clockMinute !== minute))
    ) {
      t.clockMinute = minute;
      renderAppearance(t);
    }
    var every = ZenoWidgets.interval();
    clockTimer = setTimeout(updateClock, every - (Date.now() % every) + 30);
  }
  function focusStage() {
    try {
      stage.focus({ preventScroll: true });
    } catch (e) {
      stage.focus();
    }
  }
  var lastSceneId = '';
  function after() {
    norm();
    render();
    syncRotation();
    var id = top().id;
    if (id === 'home' && lastSceneId !== 'home') ZenoExtras.home();
    lastSceneId = id;
  }
  var SCENES = {
    home: function () {},
    apps: function () {
      openApps();
    },
    settings: function () {
      openSettings();
    },
    appearance: function () {
      openSettings();
      top().f.id = 'background';
      S.settingsFocus = 'background';
      openAppearance('background');
    },
    editor: function () {
      openSettings();
      openEditor('settings');
    }
  };
  function goScene(name) {
    if (top().id === 'wallpaper') cancelWallpaperTimer(top());
    S.stack.forEach(function (t) {
      if (t.cancelSearch) t.cancelSearch();
    });
    S.stack = [S.stack[0]];
    S.stack[0].move = null;
    S.stack[0].f.zone = 'apps';
    clearSession();
    restoreLook();
    if (SCENES[name]) SCENES[name]();
    after();
  }
  function fit() {
    Zeno.input.fitStage(stage);
  }

  function currentRoot() {
    return isSettingsDetail(top()) ? appearanceEl : sheetEl.hidden ? homeEl : sheetEl;
  }
  function renderedAction(el) {
    return el.getClientRects().length > 0 && window.getComputedStyle(el).visibility !== 'hidden';
  }
  function visibleActions(selector) {
    return Array.prototype.filter.call(currentRoot().querySelectorAll(selector), renderedAction);
  }
  function focusedAction() {
    var el = visibleActions('.is-focus[data-action]')[0];
    return el ? el.getAttribute('data-action') : null;
  }

  /* Settings actions may name a card in another category; switch to it first. */
  function revealSettingsCard(action) {
    var card = action === 'settings.editor' ? 'editor' : action.replace('settings.group.', '');
    SETTINGS_CATEGORIES.some(function (c) {
      if (c.cards.indexOf(card) < 0) return false;
      top().category = c.id;
      S.settingsCategory = c.id;
      render();
      return true;
    });
  }
  function activate(action) {
    var t = top();
    if (action === 'appearance.bg' && t.id === 'appearance' && t.group === 'background')
      action = 'background.wallpaper';
    if (action === 'settings.appearance' && t.id === 'settings') action = 'settings.group.background';
    if (
      t.id === 'settings' &&
      action.indexOf('settings.') === 0 &&
      action.indexOf('settings.category.') !== 0
    )
      revealSettingsCard(action);
    var match = Zeno.util.find(visibleActions('[data-action]'), function (el) {
      return el.getAttribute('data-action') === action;
    });
    if (!match) return false;
    pointAt(match);
    return true;
  }
  function pointAt(el) {
    var t = top(),
      view = V[t.id];
    norm();
    if (view.point)
      view.point(t, el.getAttribute('data-z'), +el.getAttribute('data-i'), el.getAttribute('data-id'));
    norm();
    render();
    syncRotation();
  }
  function zoneOwner(el, boundary) {
    while (el && el !== boundary && !(el.getAttribute && el.getAttribute('data-z'))) el = el.parentNode;
    return el && el !== boundary ? el : null;
  }

  /* With quiet utilities, hovering a control moves focus to it, as the remote would. */
  utilsEl.addEventListener('mouseover', function (ev) {
    var t = top(),
      b = zoneOwner(ev.target, utilsEl);
    if (utilsEl.className.indexOf('quiet-utils') < 0 || t.lifted || !b) return;
    if (ev.relatedTarget && b.contains(ev.relatedTarget)) return;
    var z = b.getAttribute('data-z'),
      i = Number(b.getAttribute('data-i'));
    if (!((t.id === 'home' && z === 'util') || (t.id === 'arrange' && z === 'ctl'))) return;
    if (t.f.zone === z && t.f.u === i) return;
    t.f.zone = z;
    t.f.u = i;
    if (z === 'util') S.lastUtil = i;
    render();
  });
  stage.addEventListener('click', function (ev) {
    var el = zoneOwner(ev.target, stage);
    focusStage();
    if (el) pointAt(el);
  });

  ZenoI18n.onChange(function () {
    Fonts.forgetWidths();
    sheetKey = '';
    updateClock();
    after();
  });
  ZenoSources.setEditGuard(function () {
    return !S.c || !S.c.homeLocked;
  });
  document.addEventListener('zeno-control-change', function () {
    if (top().id === 'appearance') render();
  });
  document.addEventListener('zeno-icon-colors', function () {
    iconColorsRevision++;
    if (S.c.layout === 'grid' && S.c.gridStyle === 'brand') render();
  });
  document.addEventListener('zeno-source-change', function () {
    sourceSyncKey = '';
  });
  document.addEventListener('zeno-extras-change', function () {
    updateClock();
    if (S.c.layout === 'grid' || top().id === 'appearance') render();
  });
  document.addEventListener('zeno-widget-change', function () {
    updateClock();
    render();
  });
  document.addEventListener('zeno-timer-ended', function () {
    ZenoWidgets.ring();
    var timer = ZenoWidgets.lastTimer();
    message(
      (timer && timer.name) || 'Timer terminato',
      'Il conto alla rovescia è finito. Premi un tasto per spegnere la suoneria.',
      (timer && timer.note) || ''
    );
    after();
  });
  ZenoRemote.listenMedia(function (name) {
    var playerShown =
      S.c.desktop.widgets.player ||
      ZenoWidgets.player().playing ||
      (top().id === 'appearance' && top().group === 'player');
    if (!playerShown) return false;
    return ZenoWidgets.media(name, function (e) {
      if (e) {
        message('Musica', 'Il TV non ha avviato l’audio.');
        after();
      }
    });
  });
  ZenoRemote.listen(function (target) {
    if (document.hidden) return;
    keys.cancelHold();
    if (target === 'home') returnHome();
    else if (target === 'settings') goScene('settings');
    else if (target === 'sources') {
      openSources();
      after();
    } else if (target.indexOf('app.') === 0) {
      var id = target.slice(4);
      if (app(id)) launch(id);
      after();
    }
  });

  /* The Home key relaunches this app with an entry_point request; a new launch stamp
     means the user pressed it again, so leave any menu and go back to Home. */
  var homeRequestStamp = '',
    homeWatch = null;
  function homeStamp() {
    try {
      if (!window.tizen || !tizen.application.getCurrentApplication) return null;
      var request = tizen.application.getCurrentApplication().getRequestedAppControl();
      var fields = (request && request.appControl && request.appControl.data) || [],
        entry = '',
        stamp = '';
      fields.forEach(function (item) {
        if (item.key === 'entry_point') entry = item.value[0];
        else if (item.key === '__K_APP_LAUNCH_START_TIME') stamp = item.value[0];
      });
      return entry === 'smarthub_key' && stamp ? String(stamp) : null;
    } catch (ignore) {
      return null;
    }
  }
  function returnHome() {
    keys.forget();
    goScene('home');
  }
  function checkHomeRequest() {
    var stamp = homeStamp();
    if (!stamp || stamp === homeRequestStamp) return;
    homeRequestStamp = stamp;
    if (top().id !== 'home' || top().move) returnHome();
  }
  function watchHome() {
    clearTimeout(homeWatch);
    if (document.hidden) return;
    checkHomeRequest();
    homeWatch = setTimeout(watchHome, top().id === 'home' && !top().move ? 1200 : 350);
  }
  homeRequestStamp = homeStamp() || '';
  window.addEventListener('appcontrol', checkHomeRequest);
  setTimeout(watchHome, 500);

  function focusedHomeId() {
    var t = top();
    if (t.id !== 'home' || t.move) return null;
    if (S.c.layout === 'grid') return desktopSelection(S.c.desktop);
    return t.f.zone === 'apps' && onHome(S.sel) ? S.sel : null;
  }
  var keys = Zeno.input.attach({ press: press, holdable: focusedHomeId, hold: openHomeActions });
  function cancelPCHold() {
    keys.cancelHold();
  }

  window.addEventListener('focus', function () {
    release();
    focusStage();
    after();
    updateClock();
  });
  document.addEventListener('visibilitychange', function () {
    keys.forget();
    if (document.hidden) {
      rotation.pause();
      clearTimeout(clockTimer);
      clearTimeout(homeWatch);
      return;
    }
    release();
    after();
    updateClock();
    focusStage();
    watchHome();
  });
  window.addEventListener('resize', fit);

  /* ---------- Browser checks ----------
     The checks drive the real state and actions; nothing here fakes an outcome. */
  var NAV = {
    home: 'home',
    left: 'left',
    right: 'right',
    up: 'up',
    down: 'down',
    ok: 'ok',
    enter: 'ok',
    back: 'back',
    escape: 'back'
  };
  function pickerState(t) {
    if (t.id !== 'wallpaper') return null;
    return {
      candidate: WALLS[t.i].id,
      applied: S.c.wall,
      shown: S.wallShown,
      pending: t.previewDue || S.wallPending,
      queuedApplying: !!t.applyPending,
      applyPending: t.applyPending,
      failed: t.failedId,
      zone: t.f.zone,
      top: t.top,
      visible: PICKER.rows,
      backdrop: IMG.bg.src
    };
  }
  QA.state = function () {
    var t = top(),
      out = serialise(S.c),
      item = t.id === 'appearance' ? detailLocation(t).item : null,
      choice = item && item.axis ? item : null;
    out.committed = S.c;
    out.shown = S.shown;
    out.pending = S.pending;
    out.view = t.id;
    out.selected = S.c.layout === 'grid' && t.id === 'home' ? S.desktopSel : S.sel;
    out.focusAction = focusedAction();
    out.writes = S.writes;
    out.failedWrites = S.failed;
    out.error = S.err;
    out.catalog = {
      loading: catalog.loading,
      loaded: catalog.loaded,
      error: catalog.error,
      ids: ALPHA.slice()
    };
    out.fonts = {
      available: LOOK_VALUES.font.slice(),
      loaded: Fonts.loaded(),
      baselineFallback: Fonts.baselineFallback(),
      error: S.lookError && S.lookError.type === 'font' ? S.lookError : null
    };
    out.rotation = rotation.status();
    out.draft = t.lifted ? { id: t.lifted.id, order: t.lifted.order.slice() } : null;
    out.homeMove = t.move
      ? {
          id: t.move.id,
          order: t.move.order.slice(),
          desktop: !!t.move.desktop,
          positions: t.move.desktop ? t.move.draft.positions : null
        }
      : null;
    out.desktopCamera = S.desktopCamera;
    out.desktopSelected = S.desktopSel;
    out.settingsGroup = t.id === 'wallpaper' ? 'wallpaper' : t.id === 'appearance' ? t.group : null;
    out.focusedChoice = choice
      ? { axis: choice.axis, value: choice.value, action: choice.action, disabled: choice.disabled }
      : null;
    out.candidate = choice
      ? {
          axis: choice.axis,
          value: choice.value,
          action: choice.action,
          pending: !!S.pending,
          pendingTarget: S.pending ? S.pending.target : null
        }
      : null;
    out.wallpaperPicker = pickerState(t);
    out.undo = S.undo.map(function (u) {
      return u.label;
    });
    out.storageOk = Prefs.storage.ok;
    return JSON.parse(JSON.stringify(out));
  };
  QA.where = function () {
    var action = focusedAction(),
      focused = Array.prototype.filter.call(stage.querySelectorAll('.is-focus[data-action]'), renderedAction),
      name = '';
    focused.forEach(function (el) {
      if (el.getAttribute('data-action') === action)
        name = el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim();
    });
    var t = top();
    return {
      view: t.id,
      settingsGroup: t.id === 'wallpaper' ? 'wallpaper' : t.id === 'appearance' ? t.group : null,
      focus: name,
      focusAction: action,
      focusCount: focused.length,
      wallpaper: S.wallShown,
      zone: t.f.zone || null
    };
  };
  QA.ready = function () {
    return (
      Fonts.ready() &&
      !S.pending &&
      !!S.shown &&
      S.shown.bg === S.c.bg &&
      S.shown.wall === S.c.wall &&
      S.shown.font === S.c.font
    );
  };
  QA.nav = function () {
    var list =
      arguments.length === 1 && Array.isArray(arguments[0])
        ? arguments[0]
        : Array.prototype.slice.call(arguments);
    list.forEach(function (key) {
      if (!NAV[key]) throw new Error('Unknown key');
      press(NAV[key]);
    });
    return QA.state();
  };
  QA.look = function (patch) {
    setLook(patch, {});
    return QA.state();
  };
  QA.scene = function (name) {
    if (!SCENES.hasOwnProperty(name)) throw new Error('Unknown view');
    goScene(name);
    return QA.state();
  };
  QA.activate = function (action) {
    return activate(action) ? QA.state() : null;
  };
  QA.actions = function () {
    return visibleActions('[data-action]').map(function (el) {
      return el.getAttribute('data-action');
    });
  };

  /* ---------- Start ---------- */
  cueL.innerHTML = icon('left');
  cueR.innerHTML = icon('right');
  syncSourceApps();
  initialise();
  setLook({}, { transient: true, startup: true });
  norm();
  render();
  fit();
  focusStage();
  updateClock();
  syncRotation();
  refreshCatalog(); // names and icons as the TV reports them, and a first Home
})();
