/* Icons for HDMI inputs.
 *
 * Each icon is a few SVG strokes drawn on a 160x120 grid in the current text
 * colour. x, y and width say where the badge text ("PC", "HDMI 2"...) sits and
 * how wide it may get.
 */
(function () {
  'use strict';

  var BADGE_MAX = 6;
  var CACHE_SIZE = 128;

  var icons = [
    {
      id: 'tv',
      name: 'TV',
      badge: 'TV',
      x: 80,
      y: 52,
      width: 100,
      paths: '<rect x="16" y="16" width="128" height="76" rx="11"/><path d="M52 108h56M80 92v16"/>'
    },
    {
      id: 'desktop',
      name: 'PC desktop',
      badge: 'PC',
      x: 61,
      y: 48,
      width: 76,
      paths:
        '<rect x="6" y="18" width="110" height="68" rx="9"/><path d="M61 86v20M38 106h46"/><rect x="129" y="20" width="25" height="87" rx="6"/><path d="M137 33h9m-9 10h9m-5 48v1"/>'
    },
    {
      id: 'laptop',
      name: 'Portatile',
      badge: 'PC',
      x: 80,
      y: 47,
      width: 90,
      paths:
        '<rect x="26" y="16" width="108" height="70" rx="8"/><path d="M26 86 9 103a4 4 0 0 0 3 7h136a4 4 0 0 0 3-7l-17-17M62 88v7h36v-7"/>'
    },
    {
      id: 'gamepad',
      name: 'Controller',
      badge: 'GAME',
      x: 80,
      y: 38,
      width: 68,
      paths:
        '<path d="M49 23h62c17 0 25 13 30 30l9 34c3 14-10 21-19 11l-19-20H48L29 98C20 108 7 101 10 87l9-34c5-17 13-30 30-30Z"/><path d="M36 43v23M24.5 54.5h23M119 44v1m11 10v1m-22-1v1m11 10v1"/><circle cx="61" cy="63" r="7"/><circle cx="99" cy="63" r="7"/>'
    },
    {
      id: 'console',
      name: 'Console',
      badge: 'GAME',
      x: 64,
      y: 57,
      width: 56,
      paths:
        '<rect x="26" y="9" width="76" height="99" rx="11"/><path d="M39 22v14M84 89v1M39 105h66"/><path d="M119 69c-7 0-10 6-12 13l-4 16c-2 9 5 12 11 5l6-7h16l6 7c6 7 13 4 11-5l-4-16c-2-7-5-13-12-13Z"/><path d="M118 80v10m-5-5h10m16-5v1m6 6v1"/>'
    },
    {
      id: 'decoder',
      name: 'Decoder',
      badge: 'BOX',
      x: 74,
      y: 62,
      width: 92,
      paths:
        '<rect x="10" y="32" width="140" height="62" rx="12"/><path d="M25 100h14m82 0h14M118 52h16m-8 16v1M48 32V21l17-12"/>'
    },
    {
      id: 'player',
      name: 'Lettore',
      badge: 'DVD',
      x: 58,
      y: 62,
      width: 65,
      paths:
        '<rect x="8" y="30" width="144" height="66" rx="12"/><circle cx="120" cy="63" r="18"/><circle cx="120" cy="63" r="4"/><path d="M25 100h14m82 0h14M24 82h64"/>'
    },
    {
      id: 'projector',
      name: 'Proiettore',
      badge: 'FILM',
      x: 52,
      y: 60,
      width: 58,
      paths:
        '<rect x="8" y="29" width="144" height="66" rx="14"/><circle cx="116" cy="62" r="24"/><circle cx="116" cy="62" r="14"/><path d="M24 99h15m82 0h15M26 81h47M35 18h13m9 0h13"/>'
    },
    {
      id: 'hdmi',
      name: 'HDMI',
      badge: 'HDMI',
      x: 80,
      y: 53,
      width: 98,
      paths: '<path d="M18 20h124v47l-20 25H38L18 67ZM55 92v16m50-16v16M62 108h36"/>'
    }
  ];

  var byId = Object.create(null);
  icons.forEach(function (icon) {
    byId[icon.id] = icon;
  });

  function get(id) {
    return byId[id] || null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Rough width of a badge in letters: narrow ones count less, so "I1" fits bigger than "WM". */
  function badgeUnits(label) {
    var units = 0;
    for (var i = 0; i < label.length; i++) {
      var letter = label.charAt(i);
      if (/[WM]/.test(letter)) units += 1;
      else if (/[I1 ._-]/.test(letter)) units += 0.4;
      else if (/[A-Za-z0-9]/.test(letter)) units += 0.8;
      else units += 1;
    }
    return units;
  }

  function badgeSvg(icon, label) {
    var size = Math.min(28, icon.width / Math.max(1, badgeUnits(label)));
    return (
      '<text class="source-badge" x="' +
      icon.x +
      '" y="' +
      icon.y +
      '" dy=".35em"' +
      ' text-anchor="middle" fill="currentColor" font-size="' +
      size.toFixed(2) +
      '" font-weight="600">' +
      escapeHtml(label) +
      '</text>'
    );
  }

  // The same marks are drawn over and over while navigating, so the HTML is cached.
  var cache = Object.create(null);
  var cacheOrder = [];
  var builds = 0;
  var hits = 0;

  /* HTML for an input's icon at the given size, with its badge if shown. */
  function mark(id, badge, showBadge, width, height) {
    var icon = get(id) || get('hdmi');
    var label = String(badge || '').slice(0, BADGE_MAX);
    var key = [icon.id, label.length + ':' + label, !!showBadge, width, height].join('|');
    if (cache[key]) {
      hits++;
      return cache[key];
    }

    // prettier-ignore
    var html =
      '<span class="mark source-mark" data-source-icon="' + icon.id + '"' +
      ' style="width:' + width + 'px;height:' + height + 'px" aria-hidden="true" data-i18n-ignore="true">' +
      '<svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid meet">' +
      '<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
      icon.paths +
      '</g>' +
      (showBadge && label ? badgeSvg(icon, label) : '') +
      '</svg></span>';

    if (cacheOrder.length >= CACHE_SIZE) delete cache[cacheOrder.shift()];
    cacheOrder.push(key);
    cache[key] = html;
    builds++;
    return html;
  }

  window.ZenoSourceIcons = {
    all: icons,
    get: get,
    mark: mark,
    cacheStats: function () {
      return { builds: builds, hits: hits, entries: cacheOrder.length };
    }
  };
})();
