/* Card colours for the "brand" card style.
 *
 * An app's card takes the colour it is given (card.color: from a personal
 * style or measured from the app's own icon). Without one, it gets a colour
 * from the palette, picked by a hash of its id so it never changes. Input tiles
 * (TV, PC, HDMI) then take the palette colours that are furthest in hue from
 * those already on screen, so they stand apart from the apps.
 *
 * Colours are "r,g,b" strings, used as rgba(var, alpha) in CSS.
 */
(function () {
  'use strict';

  // Thirteen hues around the colour wheel, at similar brightness.
  var PALETTE = [
    '208,108,49',
    '192,143,46',
    '167,167,45',
    '109,155,59',
    '52,151,94',
    '39,151,133',
    '43,143,167',
    '51,127,190',
    '74,105,187',
    '111,84,182',
    '151,73,173',
    '183,65,141',
    '193,66,100'
  ];

  var GREY_SPREAD = 24; // below this, a colour has no meaningful hue
  var NEAR_HUE = 28; // degrees
  var NEAR_PENALTY = 18;

  var lastSignature = '';
  var lastResult = null;
  var builds = 0;
  var hits = 0;

  function hash(text) {
    var value = 0;
    for (var i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0;
    return value;
  }

  function isInput(card) {
    return !!(card.sourceIcon || card.sourceKey || card.id === 'tv' || card.id === 'pc');
  }

  function appColor(card) {
    if (card.color) return card.color;
    return PALETTE[hash(card.appId || card.id) % PALETTE.length];
  }

  /* Hue in degrees, or null for greys. */
  function hue(rgb) {
    var channels = rgb.split(',').map(Number);
    var r = channels[0];
    var g = channels[1];
    var b = channels[2];
    var max = Math.max(r, g, b);
    var spread = max - Math.min(r, g, b);
    var sector;
    if (spread < GREY_SPREAD) return null;
    if (max === r) sector = (g - b) / spread;
    else if (max === g) sector = (b - r) / spread + 2;
    else sector = (r - g) / spread + 4;
    return (sector * 60 + 360) % 360;
  }

  function hueDistance(a, b) {
    var difference = Math.abs(a - b);
    return Math.min(difference, 360 - difference);
  }

  function byText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /* Everything that affects a card's colour, to know when to recompute. */
  function signatureOf(card) {
    var input = isInput(card) ? card.sourceKey || card.id : 'app';
    return [card.id, card.color || '', input, card.appId || ''].join('~');
  }

  /* The palette colour whose hue is furthest from the ones already used. */
  function mostDistinct(usedHues) {
    var best = 0;
    var bestScore = -Infinity;
    PALETTE.forEach(function (rgb, index) {
      var own = hue(rgb);
      var nearest = 180;
      var crowding = 0;
      usedHues.forEach(function (used) {
        var distance = hueDistance(own, used);
        nearest = Math.min(nearest, distance);
        if (distance < NEAR_HUE) crowding++;
      });
      var score = nearest - crowding * NEAR_PENALTY;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    return PALETTE[best];
  }

  /* Colours for a set of cards: { cardId: 'r,g,b' }. The same set always gets
     the same colours, whatever its order. */
  function resolve(cards) {
    var ordered = cards.slice().sort(function (a, b) {
      return byText(a.id, b.id);
    });
    var signature = ordered.map(signatureOf).join('|');
    if (signature === lastSignature && lastResult) {
      hits++;
      return lastResult;
    }

    var colors = Object.create(null);
    var usedHues = [];
    var inputs = [];
    ordered.forEach(function (card) {
      if (isInput(card)) {
        inputs.push(card);
        return;
      }
      var rgb = appColor(card);
      var own = hue(rgb);
      colors[card.id] = rgb;
      if (own !== null) usedHues.push(own);
    });

    // TV first, then inputs in HDMI order, so the TV tile keeps its colour.
    inputs.sort(function (a, b) {
      var aKey = a.id === 'tv' ? '0' : a.sourceKey || a.id;
      var bKey = b.id === 'tv' ? '0' : b.sourceKey || b.id;
      return byText(aKey, bKey);
    });
    inputs.forEach(function (card) {
      var rgb = mostDistinct(usedHues);
      colors[card.id] = rgb;
      usedHues.push(hue(rgb));
    });

    lastSignature = signature;
    lastResult = Object.freeze(colors);
    builds++;
    return lastResult;
  }

  window.ZenoCardColors = {
    resolve: resolve,
    fallback: appColor,
    stats: function () {
      return { builds: builds, hits: hits };
    }
  };
})();
