/* Interface glyphs (24px line icons drawn for Zeno) and app marks: brand artwork
   when a logo is available, otherwise the platform icon over a monogram. */
(function (Z) {
  'use strict';

  var esc = Z.dom.escape,
    px = Z.dom.px,
    clamp = Z.util.clamp;
  var ICON_DIR = 'assets/icons/';

  var LINES = {
    art: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M3.5 17l5-4.5 3.5 3 3-2.5 5.5 4.5"/>',
    apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    arrange: '<path d="M5 8h13l-3-3M19 16H6l3 3"/>',
    settings:
      '<circle cx="12" cy="12" r="2.8"/><circle cx="12" cy="12" r="6.4"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M5.4 18.6l2.1-2.1M16.5 7.5l2.1-2.1"/>',
    home: '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 10v9.5h4.5V15h3v4.5H18V10"/>',
    undo: '<path d="M8.5 5.5 4.5 9.5l4 4"/><path d="M4.5 9.5H15a5 5 0 0 1 0 10h-3.5"/>',
    check: '<path d="M5 12.8l4.2 4.2L19 7.2"/>',
    plus: '<path d="M12 4.5v15M4.5 12h15"/>',
    left: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
    right: '<path d="M9 4.5l7.5 7.5L9 19.5"/>',
    up: '<path d="M4.5 15 12 7.5l7.5 7.5"/>',
    down: '<path d="M4.5 9l7.5 7.5L19.5 9"/>',
    updown: '<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>',
    sliders:
      '<path d="M4 8h3.5M11.5 8H20M4 16h10M18 16h2"/><circle cx="9.5" cy="8" r="2"/><circle cx="16" cy="16" r="2"/>',
    move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    back: '<path d="M9.5 5.5 4 11l5.5 5.5"/><path d="M4 11h10.5a5 5 0 0 1 0 10H12"/>',
    tv: '<rect x="2.5" y="4" width="19" height="13" rx="2.2"/><path d="M8 20.5h8M12 17v3.5"/>',
    warn: '<path d="M12 3.5 2.5 20h19Z"/><path d="M12 9.5v5M12 17.5v.01"/>'
  };

  /* With `shadowed`, the glyph is drawn twice: an offset underlay for legibility on
     bright photographs, and the ink on top. */
  function icon(name, extraClass, shadowed) {
    var art = LINES[name],
      body = shadowed
        ? '<g class="ut-underlay" transform="translate(0 .5)">' +
          art +
          '</g><g class="ut-ink">' +
          art +
          '</g>'
        : art;
    return (
      '<svg class="ico' +
      (extraClass ? ' ' + extraClass : '') +
      '" viewBox="0 0 24 24" aria-hidden="true">' +
      body +
      '</svg>'
    );
  }

  function badge(on) {
    if (!on)
      return '<svg class="badge is-off" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
    return (
      '<svg class="badge is-on" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/>' +
      '<path class="badge-tick" d="M7.4 12.3l3.1 3.1 6.1-6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    );
  }

  /* ---- Logos (assets/icons/<name>.svg) ---- */
  var style = document.documentElement.style;
  var canMask = 'webkitMaskImage' in style || 'maskImage' in style;
  var probes = {};

  /* Each logo is fetched once; if it is missing, every rendered copy is flagged so CSS
     can reveal the monogram underneath. */
  function probe(id) {
    if (probes[id]) return;
    probes[id] = 'loading';
    var img = new Image();
    img.onload = function () {
      probes[id] = 'ok';
    };
    img.onerror = function () {
      probes[id] = 'bad';
      var copies = document.querySelectorAll('[data-mark="' + id + '"]');
      for (var i = 0; i < copies.length; i++) copies[i].className += ' is-bad';
    };
    img.src = ICON_DIR + id + '.svg';
  }

  function metricsFor(id) {
    var table = window.ZenoIconMetrics;
    return (table && table[id]) || null;
  }

  /* Optical sizing: logos are scaled by the area of their visible ink rather than their
     box, with sparse marks nudged up and dense ones down, then centred on that ink. */
  function placement(m, w, h, size) {
    if (!m) return 'width:' + w + 'px;height:' + h + 'px;left:0;top:0;object-fit:contain';
    var density = clamp(Math.pow(0.45 / m.fill, 0.3), 0.84, 1.25);
    var scale = Math.min(w / m.w, h / m.h, (size * density) / Math.sqrt(m.w * m.h));
    var side = m.n * scale,
      cx = m.x + m.w / 2,
      cy = m.y + m.h / 2;
    return (
      'width:' +
      px(side) +
      ';height:' +
      px(side) +
      ';left:' +
      px(w / 2 - cx * scale) +
      ';top:' +
      px(h / 2 - cy * scale)
    );
  }

  function brandMark(id, w, h, size) {
    var src = ICON_DIR + id + '.svg',
      pos = placement(metricsFor(id), w, h, size);
    probe(id);
    var inner = canMask
      ? '<span class="mk" style="' +
        pos +
        ';-webkit-mask-image:url(' +
        src +
        ');mask-image:url(' +
        src +
        ')"></span>'
      : '<img alt="" src="' + src + '" style="' + pos + '">';
    return (
      '<span class="mark' +
      (probes[id] === 'bad' ? ' is-bad' : '') +
      '" data-mark="' +
      id +
      '" style="width:' +
      w +
      'px;height:' +
      h +
      'px">' +
      inner +
      '</span>'
    );
  }

  function initials(name) {
    var words = String(name).split(/\s+/);
    return (words[0].charAt(0) + (words[1] ? words[1].charAt(0) : '')).toUpperCase();
  }

  function monogram(a, w, h, size) {
    var native = a.icon ? '<img alt="" data-native-icon="true" src="' + esc(a.icon) + '">' : '';
    return (
      '<span class="mark monogram' +
      (a.icon ? ' native-icon' : '') +
      '" style="width:' +
      w +
      'px;height:' +
      h +
      'px;font-size:' +
      Math.round(size * 0.65) +
      'px">' +
      '<span>' +
      esc(initials(a.name)) +
      '</span>' +
      native +
      '</span>'
    );
  }

  /* lightSurface: without CSS masks a logo image cannot be recoloured, so on light
     backgrounds the monogram is used instead. */
  function appMark(a, w, h, size, lightSurface) {
    if (a.sourceIcon)
      return window.ZenoSourceIcons.mark(a.sourceIcon, a.sourceBadge, a.sourceShowBadge, w, h);
    if (a.logo && metricsFor(a.logo) && (canMask || !lightSurface)) return brandMark(a.logo, w, h, size);
    return monogram(a, w, h, size);
  }

  /* The Zeno TV logo, inline so its frame follows the text colour (copy of assets/brand/mark.svg). */
  var LOGO =
    '<defs> <linearGradient id="zeno-mark-sun" x1="0" y1="83.5" x2="0" y2="217" gradientUnits="userSpaceOnUse"> <stop offset="0" stop-color="#61998e"/> <stop offset=".5" stop-color="#a3c3ae"/> <stop offset="1" stop-color="#f5f3df"/> </linearGradient> </defs> <g fill="none" stroke="currentColor" stroke-width="26" stroke-linecap="round"> <rect x="25.5" y="26" width="548" height="333" rx="41"/> <path d="M125.5 372 L99 407 M474.5 372 L501 407"/> </g> <path d="M166.5 217 A133.5 133.5 0 0 1 433.5 217 Z" fill="url(#zeno-mark-sun)"/> <path d="M108.5 236 Q300 220 491.5 236 Q300 252 108.5 236 Z" fill="#58928a"/> <path d="M165 266 Q300 250 435 266 Q300 282 165 266 Z" fill="#669c92"/> <path d="M205 293 Q300 279 395 293 Q300 307 205 293 Z" fill="#74a69b"/> <path d="M250 315 Q300 305 350 315 Q300 325 250 315 Z" fill="#84b2a7"/>';
  function logo(cls) {
    return (
      '<svg class="' + (cls || 'zeno-logo') + '" viewBox="0 0 600 440" aria-hidden="true">' + LOGO + '</svg>'
    );
  }

  Z.glyphs = { icon: icon, badge: badge, appMark: appMark, brandMark: brandMark, logo: logo };
})(window.Zeno);
