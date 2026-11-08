/* Remote control input and a few timing helpers.
   Keys are reduced to seven intents (four arrows, ok, back, home). OK and Back fire
   once per physical press, and OK on a Home tile waits to see whether it is a long
   press (which opens that tile's actions) before acting. */
(function (Z) {
  'use strict';

  var INTENTS = { 13: 'ok', 36: 'home', 37: 'left', 38: 'up', 39: 'right', 40: 'down', 8: 'back', 27: 'back', 461: 'back', 10009: 'back' };
  var ENTER = 13, TAB = 9, LONG_PRESS = 650;

  /* hooks: press(intent), holdable() -> id|null, hold(id) */
  function attach(hooks) {
    var down = {}, pending = null;

    function cancelHold() { if (pending) clearTimeout(pending.timer); pending = null; }
    function forget() { down = {}; cancelHold(); }

    document.addEventListener('keydown', function (ev) {
      var code = ev.keyCode, intent = INTENTS[code];
      if (code === TAB) { ev.preventDefault(); return; }
      if (!intent || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      ev.preventDefault();
      if (intent === 'ok' || intent === 'back') {
        if (ev.repeat || down[code]) return;
        down[code] = true;
      }
      var id = intent === 'ok' ? hooks.holdable() : null;
      if (id) {
        pending = { id: id, long: false, timer: setTimeout(function () {
          if (!pending || hooks.holdable() !== id) return;
          pending.long = true;
          hooks.hold(id);
        }, LONG_PRESS) };
        return;
      }
      if (intent !== 'ok') cancelHold();
      hooks.press(intent);
    });

    document.addEventListener('keyup', function (ev) {
      delete down[ev.keyCode];
      if (ev.keyCode !== ENTER || !pending) return;
      var was = pending;
      cancelHold();
      if (!was.long && hooks.holdable() === was.id) hooks.press('ok');
    });

    window.addEventListener('blur', forget);
    return { cancelHold: cancelHold, forget: forget };
  }

  /* Counts down only while active() is true, so time spent in menus or with the TV
     app in the background does not count towards the period. */
  function activeCountdown(opts) {
    var spent = 0, since = 0, timer = 0, identity = '';
    function pause() {
      if (since) { spent += Date.now() - since; since = 0; }
      clearTimeout(timer); timer = 0;
    }
    function reset() { pause(); spent = 0; identity = ''; }
    function sync() {
      var id = opts.identity();
      pause();
      if (id !== identity) { spent = 0; identity = id; }
      if (!opts.active()) return;
      since = Date.now();
      timer = setTimeout(function () {
        pause(); spent = 0;
        if (opts.active()) opts.elapsed();
      }, Math.max(10, opts.period() - spent));
    }
    return {
      pause: pause, reset: reset, sync: sync,
      status: function () { return { activeMs: spent + (since ? Date.now() - since : 0), active: !!since }; }
    };
  }

  /* Scales the fixed 1920×1080 stage into the window, letterboxed and centred. */
  function fitStage(stage) {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.left = (window.innerWidth - 1920 * scale) / 2 + 'px';
    stage.style.top = (window.innerHeight - 1080 * scale) / 2 + 'px';
  }

  Z.input = { attach: attach, activeCountdown: activeCountdown, fitStage: fitStage };
})(window.Zeno);
