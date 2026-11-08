/* Extra remote buttons.
 *
 * Shortcuts: the coloured buttons, Info, Tools, Search and Source can each be
 * set to open Home, Settings, Sources or an app. Only buttons the TV lets an app
 * register are offered; voice and branded buttons are not available to apps.
 *
 * Media keys (play, pause, seek...) are always registered and passed to the
 * media handler, which returns true when it used the key.
 *
 * Holding a button acts once, except rewind and fast-forward, which repeat at
 * most every 250 ms.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zeno.remote.v1';
  var SEEK_REPEAT_MS = 250;

  var SHORTCUT_BUTTONS = [
    { name: 'Info', label: 'Informazioni' },
    { name: 'Tools', label: 'Strumenti' },
    { name: 'Search', label: 'Ricerca' },
    { name: 'Source', label: 'Sorgenti' },
    { name: 'ColorF0Red', label: 'Rosso' },
    { name: 'ColorF1Green', label: 'Verde' },
    { name: 'ColorF2Yellow', label: 'Giallo' },
    { name: 'ColorF3Blue', label: 'Blu' },
    { name: 'MediaPlayPause', label: 'Riproduci / Pausa' }
  ];

  var MEDIA_KEYS = [
    'MediaPlayPause',
    'MediaPlay',
    'MediaPause',
    'MediaStop',
    'MediaRewind',
    'MediaFastForward',
    'MediaTrackPrevious',
    'MediaTrackNext'
  ];

  var available = []; // SHORTCUT_BUTTONS this TV supports, with their key codes
  var shortcuts = {}; // button name -> target, as saved
  var shortcutCodes = {}; // key code -> button name, for buttons with a shortcut
  var mediaCodes = {}; // key code -> media key name

  var onShortcut = null;
  var onMedia = null;
  var held = {}; // keys currently held down
  var lastSeek = {}; // key -> time of the last seek step

  function inputDevice() {
    return window.tizen && tizen.tvinputdevice;
  }

  function isMediaKey(name) {
    return MEDIA_KEYS.indexOf(name) >= 0;
  }

  function isTarget(value) {
    return (
      value === 'home' ||
      value === 'settings' ||
      value === 'sources' ||
      (typeof value === 'string' && /^app\.[A-Za-z0-9_.-]{1,120}$/.test(value))
    );
  }

  function buttonNamed(list, name) {
    return list.filter(function (button) {
      return button.name === name;
    })[0];
  }

  function registerKeys() {
    var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    var supported = inputDevice() ? inputDevice().getSupportedKeys() : [];

    supported.forEach(function (key) {
      if (!isMediaKey(key.name)) return;
      try {
        inputDevice().registerKey(key.name);
        mediaCodes[key.code] = key.name;
      } catch (ignore) {}
    });

    available = SHORTCUT_BUTTONS.filter(function (button) {
      return supported.some(function (key) {
        if (key.name !== button.name) return false;
        button.code = key.code;
        return true;
      });
    });

    available.forEach(function (button) {
      if (!isTarget(stored[button.name])) return;
      try {
        inputDevice().registerKey(button.name);
        shortcuts[button.name] = stored[button.name];
        shortcutCodes[button.code] = button.name;
      } catch (ignore) {}
    });
  }

  /* Set a button's shortcut, or 'default' to give the button back to the TV.
     Returns false, changing nothing, if the TV or storage refuses. */
  function set(name, target) {
    var button = buttonNamed(available, name);
    var hadShortcut = shortcuts[name];
    var reset = target === 'default';
    if (!button || (!reset && !isTarget(target))) return false;

    var next = {};
    Object.keys(shortcuts).forEach(function (key) {
      next[key] = shortcuts[key];
    });
    if (reset) delete next[name];
    else next[name] = target;

    // Media keys stay registered even without a shortcut.
    try {
      if (reset && !isMediaKey(name)) inputDevice().unregisterKey(name);
      else inputDevice().registerKey(name);
    } catch (e) {
      return false;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      try {
        if (hadShortcut || isMediaKey(name)) inputDevice().registerKey(name);
        else inputDevice().unregisterKey(name);
      } catch (ignore) {}
      return false;
    }

    shortcuts = next;
    if (reset) delete shortcutCodes[button.code];
    else shortcutCodes[button.code] = name;
    return true;
  }

  function onKeyDown(event) {
    if (document.hidden || event.metaKey || event.ctrlKey || event.altKey) return;

    var shortcut = shortcutCodes[event.keyCode];
    // In a desktop browser there is no TV input device: use the key names directly.
    var media = mediaCodes[event.keyCode] || (!inputDevice() && isMediaKey(event.key) ? event.key : null);
    if (!shortcut && !media) return;

    var key = event.keyCode || event.key;
    var seeking = !shortcut && (media === 'MediaRewind' || media === 'MediaFastForward');
    var repeated = held[key] || event.repeat;
    if (repeated && (!seeking || Date.now() - (lastSeek[key] || 0) < SEEK_REPEAT_MS)) {
      event.preventDefault();
      return;
    }

    var handled = false;
    if (shortcut && onShortcut) {
      onShortcut(shortcuts[shortcut]);
      handled = true;
    } else if (onMedia) {
      handled = onMedia(media) === true;
    }
    if (!handled) return;
    event.preventDefault();
    held[key] = true;
    if (seeking) lastSeek[key] = Date.now();
  }

  function releaseAll() {
    held = {};
  }

  try {
    registerKeys();
  } catch (ignore) {}

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', function (event) {
    delete held[event.keyCode || event.key];
  });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', releaseAll);

  window.ZenoRemote = {
    keys: function () {
      return available.slice();
    },
    mapping: function (name) {
      return shortcuts[name] || '';
    },
    label: function (name) {
      var button = buttonNamed(SHORTCUT_BUTTONS, name);
      return button ? button.label : name;
    },
    set: set,
    listen: function (callback) {
      onShortcut = callback;
    },
    listenMedia: function (callback) {
      onMedia = callback;
    }
  };
})();
