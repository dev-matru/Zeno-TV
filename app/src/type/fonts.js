/* Typefaces: which ones exist, loading them, and the measurements Home layout needs.
   Layout is computed in pixels, so each face is measured once after it loads; every
   later question (cap height, label width, clock digit cell) is answered from that record. */
(function (Z) {
  'use strict';

  var BASELINE = 'manrope';
  var SAMPLES = { display: [88, 76, 56], clock: [48], primary: [30, 32, 34, 36, 40], ui: [28, 30, 48] };
  var LOAD_TIMEOUT = 3000;

  var faces = {}, ids = [], offered, measured = {}, failed = {}, widths = {};
  var baselineReady = false, recovering = false;
  var pen = document.createElement('canvas').getContext('2d');
  var ruler = document.createElement('span');
  ruler.setAttribute('aria-hidden', 'true');
  ruler.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;font-synthesis:none;';

  function define(id, spec) {
    if (!faces[id]) ids.push(id);
    faces[id] = {
      id: id, name: spec.name || id, family: spec.family,
      weights: { display: spec.display || 300, ui: spec.ui || 400, clock: spec.clock || 300 },
      optical: !!spec.optical
    };
  }

  (window.ZenoLocalFonts || []).forEach(function (spec) { if (spec && spec.id && spec.family) define(spec.id, spec); });
  define('manrope', { name: 'Manrope', family: 'Manrope', display: 600, ui: 500, clock: 500 });
  define('geist', { name: 'Geist', family: 'Zeno Geist', display: 300, ui: 400, clock: 300 });
  define('newsreader', { name: 'Newsreader', family: 'Zeno Newsreader', display: 400, ui: 400, clock: 400, optical: true });
  offered = window.ZenoFontIDs || ['geist', 'newsreader'];

  function mountRuler() { if (!ruler.parentNode) document.body.appendChild(ruler); return ruler; }

  /* Weight and optical size used for a face in a given typographic role. */
  function role(id, kind, size) {
    var face = faces[id], weight = face.weights[kind === 'display' || kind === 'clock' ? kind : 'ui'], opsz = 0;
    if (face.optical) {
      if (kind === 'display') opsz = 72;
      else if (kind === 'clock') opsz = 48;
      else opsz = kind === 'ui' && (!size || size === 28) ? 28 : 36;
    }
    return { family: face.family, weight: weight, opsz: opsz };
  }

  function variation(opsz) { return opsz ? '"opsz" ' + opsz : 'normal'; }

  function measure(id, loaded) {
    var record = { roles: {}, digits: [], digitCell: 0 };
    /* Canvas ignores optical size, so the loaded face's descriptor is set per role while
       measuring and put back afterwards. CSS sets each role explicitly when rendering. */
    var face = faces[id].optical && loaded && loaded[0] ? loaded[0][0] : null, saved = face ? face.variationSettings : '';
    Object.keys(SAMPLES).forEach(function (kind) {
      var table = record.roles[kind] = {};
      SAMPLES[kind].forEach(function (size) {
        var r = role(id, kind, size), cap, tail;
        if (face) face.variationSettings = r.opsz ? variation(r.opsz) : saved;
        pen.font = r.weight + ' ' + size + 'px "' + r.family + '"';
        cap = pen.measureText('H'); tail = pen.measureText('gjpqy');
        table[size] = {
          cap: cap.actualBoundingBoxAscent || size * 0.72,
          ascent: cap.fontBoundingBoxAscent || size * 1.066,
          descent: cap.fontBoundingBoxDescent || size * 0.3,
          lower: tail.actualBoundingBoxDescent || size * 0.255
        };
      });
    });
    if (face) face.variationSettings = saved;

    var clock = role(id, 'clock'), el = mountRuler(), widest = 0, narrowest = Infinity;
    el.style.font = clock.weight + ' 48px/64px "' + clock.family + '"';
    el.style.letterSpacing = '0';
    el.style.fontVariantNumeric = 'tabular-nums';
    el.style.fontVariationSettings = variation(clock.opsz);
    for (var d = 0; d <= 9; d++) {
      el.textContent = String(d);
      var w = el.getBoundingClientRect().width;
      record.digits.push(w);
      if (w > widest) widest = w;
      if (w < narrowest) narrowest = w;
    }
    /* Faces whose digits are not tabular get a fixed cell so the clock does not jitter. */
    record.digitCell = widest - narrowest > 0.02 ? widest : 0;
    return record;
  }

  /* A FontFace that failed once never retries, so its @font-face rules are re-inserted. */
  function reviveRules(id) {
    var family = faces[id].family;
    for (var s = 0; s < document.styleSheets.length; s++) {
      var sheet = document.styleSheets[s], rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var i = 0; i < rules.length; i++) {
        if (rules[i].type !== 5) continue;
        if (rules[i].style.getPropertyValue('font-family').replace(/["']/g, '').trim() !== family) continue;
        var text = rules[i].cssText;
        sheet.deleteRule(i);
        sheet.insertRule(text, i);
      }
    }
  }

  function settle(id, ok, why, loaded, done) {
    if (ok) {
      measured[id] = measure(id, loaded);
      delete failed[id];
      if (id === BASELINE) baselineReady = true;
    } else if (why !== 'timeout') failed[id] = true;
    done(ok, why);
  }

  function load(id, done) {
    if (measured[id]) { done(true); return; }
    var api = document.fonts;
    if (!api || !api.load) {
      if (id !== BASELINE) { done(false, 'unsupported'); return; }
      measured[id] = measure(id, []); baselineReady = true; done(true); return;
    }
    if (failed[id]) reviveRules(id);
    var face = faces[id], list = [face.weights.display], over = false, timer;
    if (!face.optical && list.indexOf(face.weights.ui) < 0) list.push(face.weights.ui);
    function end(ok, why, loaded) {
      if (over) return;
      over = true; clearTimeout(timer);
      settle(id, ok, why, loaded, done);
    }
    timer = setTimeout(function () { end(false, 'timeout'); }, LOAD_TIMEOUT);
    Promise.all(list.map(function (weight) { return api.load(weight + ' 88px "' + face.family + '"'); })).then(function (loaded) {
      var ok = loaded.every(function (set) {
        return set.length > 0 && set.every(function (f) { return f.status === 'loaded'; });
      });
      end(ok, 'load', loaded);
    }, function () { end(false, 'load'); });
  }

  function useFallbackBaseline() {
    measured[BASELINE] = measure(BASELINE, []);
    measured[BASELINE].fallback = true;
    baselineReady = true;
  }

  /* Loads the baseline first (layout falls back to it), then the requested face.
     If the baseline itself is late, Home starts on the system fallback and swaps
     once every stylesheet font has settled; onRecover lets the caller redraw. */
  function ensure(id, done, onRecover) {
    load(BASELINE, function (ok, why) {
      if (ok) { if (id === BASELINE) done(true, why); else load(id, done); return; }
      if (id !== BASELINE) { done(false, why); return; }
      useFallbackBaseline();
      done(true, why);
      if (recovering || !document.fonts || !document.fonts.ready) return;
      recovering = true;
      document.fonts.ready.then(function () {
        delete measured[BASELINE]; delete failed[BASELINE];
        load(BASELINE, function (loaded) {
          if (!loaded) useFallbackBaseline();
          if (onRecover) onRecover();
        });
      });
    });
  }

  /* Vertical correction that puts another face's cap band where the baseline face's sits. */
  function shift(id, kind, size) {
    var a = measured[BASELINE], b = measured[id];
    if (id === BASELINE || !a || !b) return 0;
    a = a.roles[kind][size]; b = b.roles[kind][size];
    return ((a.ascent - a.descent - a.cap) - (b.ascent - b.descent - b.cap)) / 2;
  }

  function width(id, text, size, weight, spacing, kind) {
    var r = role(id, kind || 'ui', size), key, w;
    if (id !== BASELINE) { weight = r.weight; spacing = kind === 'display' ? -size * 0.01 : 0; }
    key = id + '\u0001' + (kind || 'ui') + '\u0001' + text + '\u0001' + size + '\u0001' + weight + '\u0001' + spacing;
    if (Object.prototype.hasOwnProperty.call(widths, key)) return widths[key];
    if (r.opsz) {
      var el = mountRuler();
      el.style.font = weight + ' ' + size + 'px "' + r.family + '"';
      el.style.fontVariationSettings = variation(r.opsz);
      el.style.fontVariantNumeric = 'normal';
      el.style.letterSpacing = '0';
      el.textContent = text;
      w = el.getBoundingClientRect().width;
    } else {
      pen.font = (weight || 500) + ' ' + size + 'px "' + r.family + '", Arial, sans-serif';
      w = pen.measureText(text).width;
    }
    w += Math.max(0, text.length - 1) * (spacing || 0);
    /* Widths taken before a face has loaded describe the fallback; never keep them. */
    if (measured[id]) widths[key] = w;
    return w;
  }

  Z.fonts = {
    BASELINE: BASELINE,
    get: function (id) { return faces[id]; },
    name: function (id) { return faces[id] ? faces[id].name : id; },
    family: function (id) { return faces[id].family; },
    exists: function (id) { return !!faces[id]; },
    /* Faces the menus may offer: the baseline plus the configured ones that have not failed. */
    choices: function () {
      return ids.filter(function (id) { return id === BASELINE || offered.indexOf(id) >= 0 && !failed[id]; });
    },
    isOffered: function (id) { return id === BASELINE || offered.indexOf(id) >= 0; },
    role: role,
    metrics: function (id) { return measured[id] || null; },
    loaded: function () { return Object.keys(measured).filter(function (id) { return !measured[id].fallback; }); },
    baselineFallback: function () { return !!(measured[BASELINE] && measured[BASELINE].fallback); },
    ready: function () { return baselineReady; },
    ensure: ensure,
    shift: shift,
    width: width,
    forgetWidths: function () { widths = {}; }
  };
})(window.Zeno);
