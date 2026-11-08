/* Shared namespace plus the handful of value and DOM helpers every module leans on. */
(function (root) {
  'use strict';
  var Z = root.Zeno = root.Zeno || {};

  var util = Z.util = {
    clamp: function (value, low, high) {
      var v = value > high ? high : value;
      return v < low ? low : v;
    },
    without: function (list, item) {
      var out = [];
      for (var i = 0; i < list.length; i++) if (list[i] !== item) out.push(list[i]);
      return out;
    },
    sameList: function (a, b) {
      if (a.length !== b.length) return false;
      for (var i = a.length - 1; i >= 0; i--) if (a[i] !== b[i]) return false;
      return true;
    },
    /* Case-insensitive lookup in a list of allowed values; returns the canonical spelling. */
    oneOf: function (value, allowed, fallback) {
      var wanted = String(value || '').toLowerCase();
      for (var i = 0; i < allowed.length; i++) if (String(allowed[i]).toLowerCase() === wanted) return allowed[i];
      return fallback;
    },
    find: function (list, test) {
      for (var i = 0; i < list.length; i++) if (test(list[i], i)) return list[i];
      return null;
    },
    indexWhere: function (list, test) {
      for (var i = 0; i < list.length; i++) if (test(list[i], i)) return i;
      return -1;
    }
  };

  var ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

  var dom = Z.dom = {
    byId: function (id) { return document.getElementById(id); },
    escape: function (text) { return String(text).replace(/[&<>"]/g, function (c) { return ENTITIES[c]; }); },
    px: function (n) { return n.toFixed(2) + 'px'; },

    /* Writes markup only when it differs from what the element already holds. */
    html: function (el, markup) {
      if (el.__markup === markup) return;
      el.__markup = markup;
      el.innerHTML = markup;
    },

    /* Like html(), but keyed by a caller signature plus a revision counter, and it
       wires native app icons so a broken image falls back to the monogram behind it. */
    content: function (el, signature, markup, revision) {
      var stamp = signature + '#' + (revision || 0);
      if (el.__stamp === stamp) return;
      el.__stamp = stamp;
      el.innerHTML = markup;
      var imgs = el.querySelectorAll('[data-native-icon]');
      for (var i = 0; i < imgs.length; i++) watchNativeIcon(imgs[i]);
    },

    /* Reconciles absolutely positioned children by key. Existing nodes are updated in
       place so their transforms animate; nodes whose key disappeared are removed. */
    reconcile: function (parent, items, update) {
      var pool = parent.__pool || (parent.__pool = {}), live = {}, key, node, fresh;
      for (var i = 0; i < items.length; i++) {
        key = items[i].key; node = pool[key]; fresh = !node;
        if (fresh) node = pool[key] = document.createElement('div');
        update(node, items[i], i);
        if (fresh) parent.appendChild(node);
        live[key] = true;
      }
      for (key in pool) {
        if (!Object.prototype.hasOwnProperty.call(pool, key) || live[key]) continue;
        if (pool[key].parentNode === parent) parent.removeChild(pool[key]);
        delete pool[key];
      }
    },

    /* The live node reconcile() keeps for a key, if any. */
    child: function (parent, key) { return parent.__pool ? parent.__pool[key] : undefined; },

    /* Pointer targets carry their zone, index and semantic action as data attributes. */
    target: function (el, zone, index, action) {
      el.setAttribute('data-z', zone);
      el.setAttribute('data-i', String(index));
      el.setAttribute('data-action', action);
    }
  };

  function watchNativeIcon(img) {
    var holder = img.parentNode;
    function shown() { holder.classList.add('has-native-icon'); }
    function hidden() { img.style.display = 'none'; holder.classList.remove('has-native-icon'); }
    img.onload = shown;
    img.onerror = hidden;
    if (img.complete) { if (img.naturalWidth) shown(); else hidden(); }
  }

  Z.util = util;
  Z.dom = dom;
})(window);
