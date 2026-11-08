/* The main colour of each app's own icon, for the "brand" card style.
 *
 * get(appId, iconUrl) returns 'r,g,b' if the colour is already known, or null.
 * Unknown icons are measured one at a time, a moment later, by drawing them
 * small on a canvas: never while the user is moving around. Results (including
 * "no usable colour") are saved, so each icon is measured once.
 * When a measurement finishes, a 'zeno-icon-colors' event is sent.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zeno.icon-colors.v1';
  var SAMPLE_SIZE = 24;
  var MAX_ENTRIES = 200;
  var DELAY_MS = 400;
  var NONE = 'none';

  var known = {}; // cache key -> 'r,g,b' or NONE
  var queue = [];
  var queued = {};
  var busy = false;

  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved && typeof saved === 'object') known = saved;
  } catch (ignore) {}

  function cacheKey(appId, iconUrl) {
    return appId + '|' + iconUrl;
  }

  function save() {
    var keys = Object.keys(known);
    if (keys.length > MAX_ENTRIES)
      keys.slice(0, keys.length - MAX_ENTRIES).forEach(function (key) {
        delete known[key];
      });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(known));
    } catch (ignore) {}
  }

  /* The most common saturated colour among the pixels, ignoring near-white,
     near-black and transparent ones (backgrounds and outlines). */
  function dominant(pixels) {
    var buckets = {};
    var best = null;
    for (var i = 0; i < pixels.length; i += 4) {
      var r = pixels[i];
      var g = pixels[i + 1];
      var b = pixels[i + 2];
      if (pixels[i + 3] < 200) continue;
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      if (max < 40 || min > 225 || max - min < 40) continue;
      var key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5);
      var bucket = buckets[key] || (buckets[key] = { count: 0, r: 0, g: 0, b: 0 });
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      if (!best || bucket.count > best.count) best = bucket;
    }
    if (!best || best.count < 6) return NONE;
    return [best.r, best.g, best.b]
      .map(function (total) {
        return Math.round(total / best.count);
      })
      .join(',');
  }

  function measure(iconUrl, done) {
    var image = new Image();
    image.onload = function () {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = SAMPLE_SIZE;
        var context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        done(dominant(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data));
      } catch (e) {
        done(NONE); // the TV may refuse to let us read pixels of some icons
      }
    };
    image.onerror = function () {
      done(NONE);
    };
    image.src = iconUrl;
  }

  function next() {
    if (busy || !queue.length) return;
    busy = true;
    var job = queue.shift();
    setTimeout(function () {
      measure(job.iconUrl, function (color) {
        known[job.key] = color;
        delete queued[job.key];
        save();
        busy = false;
        document.dispatchEvent(new Event('zeno-icon-colors'));
        next();
      });
    }, DELAY_MS);
  }

  function get(appId, iconUrl) {
    if (!appId || !iconUrl) return null;
    var key = cacheKey(appId, iconUrl);
    if (Object.prototype.hasOwnProperty.call(known, key)) return known[key] === NONE ? null : known[key];
    if (!queued[key]) {
      queued[key] = true;
      queue.push({ key: key, iconUrl: iconUrl });
      next();
    }
    return null;
  }

  window.ZenoIconColors = { get: get, dominant: dominant };
})();
