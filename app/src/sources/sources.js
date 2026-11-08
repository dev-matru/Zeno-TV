/* HDMI inputs as Zeno sees them.
 *
 * Each input can have its own name, icon and badge, plus the network details
 * needed to wake a PC on it (Wake on LAN). These are stored by Zeno only; the
 * names in the TV's own Source menu are never changed.
 *
 * Inputs are identified by keys like 'HDMI-2'. The input set as "PC" in the
 * network settings gets the PC defaults.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zeno.sources.v1';
  var NAME_MAX = 48;
  var BADGE_MAX = 6;
  var HDMI_KEYS = ['HDMI-1', 'HDMI-2', 'HDMI-3', 'HDMI-4'];
  var LOOK_FIELDS = ['name', 'icon', 'badge', 'showBadge'];

  var profiles = {}; // input key -> saved fields
  var revision = 0; // bumped on every change, so views know when to redraw
  var canEditLook = function () {
    return true;
  };

  function isInputKey(key) {
    return /^(TV|HDMI|AV|COMPONENT)-[1-9][0-9]?$/.test(key);
  }

  function pcKey() {
    return 'HDMI-' + ZenoControl.config().hdmi;
  }

  function defaultName(key) {
    if (key === 'TV-1') return 'TV';
    if (key === pcKey()) return 'PC';
    return key.replace('-', ' ');
  }

  function defaultIcon(key) {
    if (key === 'TV-1') return 'tv';
    if (key === pcKey()) return 'desktop';
    return 'hdmi';
  }

  function loadProfiles() {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    Object.keys(saved).forEach(function (key) {
      if (isInputKey(key) && saved[key] && typeof saved[key] === 'object') profiles[key] = saved[key];
    });
  }

  /* Everything about one input, with defaults filled in. The PC input falls back
     to the network settings made before inputs had their own profiles. */
  function get(key) {
    if (!isInputKey(key)) return null;
    var saved = profiles[key] || {};
    var network = key === pcKey() ? ZenoControl.config() : {};
    var source = { key: key, type: key.split('-')[0], number: +key.split('-')[1] };

    source.name = typeof saved.name === 'string' ? saved.name.slice(0, NAME_MAX) : defaultName(key);
    source.icon = ZenoSourceIcons.get(saved.icon) ? saved.icon : defaultIcon(key);
    if (typeof saved.badge === 'string') source.badge = saved.badge.slice(0, BADGE_MAX);
    else if (source.icon === 'hdmi') source.badge = 'HDMI ' + source.number;
    else source.badge = ZenoSourceIcons.get(source.icon).badge;
    source.showBadge = saved.showBadge !== false;

    source.mac = typeof saved.mac === 'string' ? saved.mac : network.mac || '';
    source.ip = typeof saved.ip === 'string' ? saved.ip : network.pcIp || '';
    source.broadcast = ZenoControl.valid('broadcast', saved.broadcast)
      ? saved.broadcast
      : network.broadcast || '255.255.255.255';
    source.port = ZenoControl.valid('port', saved.port) ? +saved.port : network.port || 9;
    return source;
  }

  function all() {
    return HDMI_KEYS.map(get);
  }

  /* The value to store for a field, or undefined if it is not acceptable. */
  function cleanValue(field, value) {
    switch (field) {
      case 'name':
      case 'badge':
        value = String(value).trim();
        var max = field === 'badge' ? BADGE_MAX : NAME_MAX;
        if (!value || value.length > max || /[\u0000-\u001f<>]/.test(value)) return undefined;
        return value;
      case 'icon':
        return ZenoSourceIcons.get(value) ? value : undefined;
      case 'showBadge':
        return typeof value === 'boolean' ? value : undefined;
      case 'mac':
        if (value && !ZenoControl.valid('mac', value)) return undefined;
        return value.toUpperCase();
      case 'ip':
        return !value || ZenoControl.valid('pcIp', value) ? value : undefined;
      case 'broadcast':
        return ZenoControl.valid(field, value) ? value : undefined;
      case 'port':
        return ZenoControl.valid(field, value) ? +value : undefined;
    }
    return undefined;
  }

  /* Change one field of one input. Returns false if the value is refused or
     cannot be saved. */
  function set(key, field, value) {
    if (!isInputKey(key)) return false;
    if (LOOK_FIELDS.indexOf(field) >= 0 && !canEditLook()) return false;
    value = cleanValue(field, value);
    if (value === undefined) return false;

    var next = {};
    var profile = {};
    Object.keys(profiles).forEach(function (other) {
      next[other] = profiles[other];
    });
    var previous = profiles[key] || {};
    Object.keys(previous).forEach(function (name) {
      profile[name] = previous[name];
    });
    profile[field] = value;
    next[key] = profile;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (ignore) {
      return false;
    }
    profiles = next;
    revision++;
    document.dispatchEvent(new Event('zeno-source-change'));
    return true;
  }

  /* Send the Wake on LAN packet for an input, through the network service. */
  function wake(key, done) {
    var source = get(key);
    if (!source || !source.mac) {
      done({ message: 'Configura prima l’indirizzo MAC.' });
      return;
    }
    ZenoControl.rpc({ op: 'wol', mac: source.mac, broadcast: source.broadcast, port: source.port }, done);
  }

  try {
    loadProfiles();
  } catch (ignore) {}

  window.ZenoSources = {
    setEditGuard: function (guard) {
      canEditLook = guard;
    },
    revision: function () {
      return revision;
    },
    all: all,
    get: get,
    set: set,
    pcKey: pcKey,
    validKey: isInputKey,
    wol: wake,
    // The id of the Home tile for an input.
    id: function (key) {
      if (key === 'TV-1') return 'tv';
      if (key === pcKey()) return 'pc';
      return 'source.' + key;
    }
  };
})();
