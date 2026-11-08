/* Wallpaper materials. A look on a photograph needs several decoded images at once
   (the photo, the glass under the dock, the blurred fields behind plates and sheets).
   They are prepared off-screen as a set and swapped in together, so the screen never
   shows a mix of old and new wallpaper. */
(function (Z) {
  'use strict';

  var DECODE_TIMEOUT = 8000;
  var LOCAL_DIR = 'assets/wallpapers/',
    MATERIAL_DIR = 'assets/materials/';

  /* slot name → [img class, which material it shows] */
  var SLOTS = [
    ['photo', 'photo', 'photo'],
    ['bg', 'sheet-bg', 'field'],
    ['mat', 'mat-img', 'mat'],
    ['field', 'ph-field-img', 'field'],
    ['fieldAlt', 'ph-field-img', 'field'],
    ['utility', 'ph-field-img', 'field'],
    ['utilityAlt', 'ph-field-img', 'field']
  ];
  /* Pre-rendered variants per glass finish. */
  var VARIANT = {
    mat: { soft: 'glass-soft', tint: 'field-clear', frost: 'field-frost' },
    field: { soft: 'field-blur', tint: 'field-clear', frost: 'field-frost' }
  };

  function create(env) {
    var lastDownloadError = '';

    function remote(id) {
      var w = env.wall(id);
      return !!(w && w.download);
    }

    function url(id, variant, quality) {
      if (remote(id)) return env.remoteURL(id, quality || env.quality(), variant);
      if (variant === 'photo') return LOCAL_DIR + id + '.jpg';
      if (variant === 'panel') return LOCAL_DIR + id + '-panel.jpg';
      return MATERIAL_DIR + id + '-' + variant + '.jpg';
    }

    function source(look, kind) {
      if (kind === 'photo') return url(look.wall, 'photo', look.imageQuality);
      return url(look.wall, VARIANT[kind][look.material] || VARIANT[kind].frost, look.imageQuality);
    }

    function key(look) {
      return (
        look.wall +
        '|' +
        look.material +
        (remote(look.wall) ? '|' + (look.imageQuality || env.quality()) : '')
      );
    }

    function image(className, src) {
      var img = document.createElement('img');
      img.className = className;
      img.alt = '';
      img.src = src;
      return img;
    }

    /* Calls back once with true when the image is decoded, false on error or timeout. */
    function decoded(img, done) {
      var settled = false,
        timer = setTimeout(function () {
          settle(false);
        }, DECODE_TIMEOUT);
      function settle(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        done(ok);
      }
      function loaded() {
        if (!img.decode) {
          settle(true);
          return;
        }
        img.decode().then(
          function () {
            settle(true);
          },
          function () {
            settle(false);
          }
        );
      }
      if (!img.complete) {
        img.onload = loaded;
        img.onerror = function () {
          settle(false);
        };
        return;
      }
      if (img.naturalWidth) loaded();
      else settle(false);
    }

    function assemble(look, stillWanted, done) {
      var set = {},
        waiting = SLOTS.length,
        allGood = true;
      SLOTS.forEach(function (slot) {
        set[slot[0]] = image(slot[1], source(look, slot[2]));
      });
      SLOTS.forEach(function (slot) {
        decoded(set[slot[0]], function (ok) {
          allGood = allGood && ok;
          if (--waiting || !stillWanted()) return;
          done(allGood ? { key: key(look), imgs: set } : null);
        });
      });
    }

    /* Online wallpapers are first fetched into the TV's cache by the local service. */
    function prepare(look, stillWanted, done) {
      lastDownloadError = '';
      if (!remote(look.wall)) {
        assemble(look, stillWanted, done);
        return;
      }
      env.download(look.wall, look.imageQuality || env.quality(), function (error) {
        if (!stillWanted()) return;
        if (!error) {
          assemble(look, stillWanted, done);
          return;
        }
        lastDownloadError = error.message;
        done(null, error.message);
      });
    }

    /* Replaces the on-stage images in `slots` with the bundle's, keeping id and style. */
    function mount(bundle, slots, skip) {
      Object.keys(bundle.imgs).forEach(function (name) {
        if (skip && skip[name]) return;
        var current = slots[name],
          next = bundle.imgs[name];
        if (current === next) return;
        next.style.cssText = current.style.cssText;
        if (current.id) next.id = current.id;
        current.parentNode.replaceChild(next, current);
        slots[name] = next;
      });
    }

    return {
      url: url,
      key: key,
      prepare: prepare,
      mount: mount,
      remote: remote,
      downloadError: function () {
        return lastDownloadError;
      }
    };
  }

  Z.materials = { create: create };
})(window.Zeno);
