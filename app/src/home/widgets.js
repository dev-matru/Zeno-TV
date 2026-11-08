/* The clock, timer and music widgets.
 *
 * Settings are saved under zeno.widgets.v1. The clock can show another time
 * zone and seconds; the timer survives a restart because it stores its end
 * time. Music plays only when asked to and pauses whenever Zeno goes to the
 * background: four small bundled loops, your own tracks, then whatever the TV
 * has downloaded (src/home/music.js).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zeno.widgets.v1';
  var DAY_SECONDS = 86400;
  var TIMER_NAME_MAX = 40;
  var TIMER_NOTE_MAX = 96;
  var SAVED_TIMERS_MAX = 12;
  var SEEK_SECONDS = 10;

  var ZONES = [
    { id: 'local', name: 'Ora del TV' },
    { id: 'UTC', name: 'UTC' },
    { id: 'Europe/Rome', name: 'Roma' },
    { id: 'Europe/London', name: 'Londra' },
    { id: 'Europe/Paris', name: 'Parigi' },
    { id: 'America/New_York', name: 'New York' },
    { id: 'America/Los_Angeles', name: 'Los Angeles' },
    { id: 'Asia/Dubai', name: 'Dubai' },
    { id: 'Asia/Kolkata', name: 'Nuova Delhi' },
    { id: 'Asia/Shanghai', name: 'Shanghai' },
    { id: 'Asia/Tokyo', name: 'Tokyo' },
    { id: 'Australia/Sydney', name: 'Sydney' }
  ];

  /* Original loops made by scripts/build/build-demo-audio.py. */
  var BUILTIN = [
    { id: 'lounge', title: 'Jazz lounge', note: 'Piano elettrico e contrabbasso' },
    { id: 'piano', title: 'Pianoforte', note: 'Arpeggi lenti con eco' },
    { id: 'pad', title: 'Ambient', note: 'Accordi morbidi che vanno e vengono' },
    { id: 'noise', title: 'Rumore marrone', note: 'Fruscio profondo per concentrarsi o dormire' }
  ].map(function (track) {
    track.src = 'assets/audio/' + track.id + '.m4a';
    track.kind = 'builtin';
    return track;
  });
  var PERSONAL = personalTracks();

  function playlist() {
    return BUILTIN.concat(PERSONAL, window.ZenoMusic ? ZenoMusic.tracks() : []);
  }

  /* Your own tracks, from .local/personal/music in a personal build. */
  function personalTracks() {
    var list = Array.isArray(window.ZenoPersonalMusic) ? window.ZenoPersonalMusic : [];
    return list
      .filter(function (track) {
        return (
          track &&
          typeof track.id === 'string' &&
          typeof track.title === 'string' &&
          /^assets\/music\/[\w.-]+$/.test(track.src)
        );
      })
      .map(function (track) {
        return {
          id: track.id,
          title: track.title,
          note: track.note || 'La tua musica',
          src: track.src,
          kind: 'song'
        };
      });
  }

  var ALARM_SRC = 'assets/audio/alarm.wav';
  var ALARM_LIMIT_MS = 10 * 60 * 1000; // a forgotten alarm stops by itself

  var settings = {
    seconds: false,
    clockDensity: window.ZenoExtras && ZenoExtras.config().clock === 'compact' ? 'compact' : 'standard',
    handColor: '#ff5b52', // a colour, 'auto' (text colour) or 'wallpaper'
    weatherMode: 'minimal',
    animations: true,
    zone: 'local',
    timer: 0, // end time in ms, 0 when no timer runs
    timerLabel: '',
    timerNote: '',
    timers: [], // saved presets: { id, name, note, seconds }
    playMode: 'one', // 'one' repeats the track, 'order' and 'shuffle' go through the playlist
    rotation: [], // the playlist: track ids, empty for every track
    track: '' // the last track picked
  };

  var revision = 0;
  var formatters = {}; // one Intl formatter per time zone
  var notifiedTimer = 0;
  var lastTimer = null; // the timer that just ended, for the message on screen

  /* ---- Settings ---- */

  function isZone(value) {
    return ZONES.some(function (zone) {
      return zone.id === value;
    });
  }

  function isDuration(seconds) {
    return typeof seconds === 'number' && seconds % 1 === 0 && seconds >= 1 && seconds <= DAY_SECONDS;
  }

  function isTimerPreset(timer, seen) {
    return (
      timer &&
      typeof timer.id === 'string' &&
      /^t[a-z0-9-]{1,40}$/.test(timer.id) &&
      !seen[timer.id] &&
      typeof timer.name === 'string' &&
      timer.name.trim() &&
      timer.name.length <= TIMER_NAME_MAX &&
      typeof timer.note === 'string' &&
      timer.note.length <= TIMER_NOTE_MAX &&
      isDuration(timer.seconds)
    );
  }

  function areTimerPresets(list) {
    var seen = {};
    return (
      Array.isArray(list) &&
      list.length <= SAVED_TIMERS_MAX &&
      list.every(function (timer) {
        if (!isTimerPreset(timer, seen)) return false;
        seen[timer.id] = true;
        return true;
      })
    );
  }

  function valid(key, value) {
    switch (key) {
      case 'clockDensity':
        return ['standard', 'compact'].indexOf(value) >= 0;
      case 'timers':
        return areTimerPresets(value);
      case 'timerLabel':
        return typeof value === 'string' && value.length <= TIMER_NAME_MAX;
      case 'timerNote':
        return typeof value === 'string' && value.length <= TIMER_NOTE_MAX;
      case 'seconds':
      case 'animations':
        return typeof value === 'boolean';
      case 'handColor':
        return (
          typeof value === 'string' &&
          (value === 'auto' || value === 'wallpaper' || /^#[0-9a-f]{6}$/i.test(value))
        );
      case 'weatherMode':
        return ['minimal', 'detailed'].indexOf(value) >= 0;
      case 'playMode':
        return ['one', 'order', 'shuffle'].indexOf(value) >= 0;
      case 'rotation':
        return (
          Array.isArray(value) &&
          value.length <= 500 &&
          value.every(function (id) {
            return typeof id === 'string' && /^[a-z0-9-]{1,60}$/.test(id);
          })
        );
      case 'track':
        return typeof value === 'string' && /^[a-z0-9-]{0,60}$/.test(value);
      case 'zone':
        return isZone(value);
      case 'timer':
        return (
          typeof value === 'number' &&
          isFinite(value) &&
          value >= 0 &&
          value < Date.now() + DAY_SECONDS * 1000 + 1
        );
    }
    return false;
  }

  function loadSaved() {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) return;
    Object.keys(settings).forEach(function (key) {
      if (valid(key, saved[key])) settings[key] = saved[key];
    });
  }

  function changed() {
    document.dispatchEvent(new Event('zeno-widget-change'));
  }

  function applyAnimations() {
    document.documentElement.classList.toggle('weather-static', !settings.animations);
  }

  /* Change several settings at once. All values must be valid, or nothing changes. */
  function update(patch) {
    var keys = Object.keys(patch);
    var allValid = keys.every(function (key) {
      return Object.prototype.hasOwnProperty.call(settings, key) && valid(key, patch[key]);
    });
    if (!allValid) return false;

    var next = JSON.parse(JSON.stringify(settings));
    var different = false;
    keys.forEach(function (key) {
      if (JSON.stringify(next[key]) !== JSON.stringify(patch[key])) different = true;
      next[key] = patch[key];
    });
    if (!different) return true;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      return false;
    }
    settings = JSON.parse(JSON.stringify(next));
    revision++;
    applyAnimations();
    changed();
    return true;
  }

  function set(key, value) {
    var patch = {};
    patch[key] = value;
    return update(patch);
  }

  /* ---- Timer ---- */

  function startTimer(seconds, name, note) {
    if (!isDuration(seconds)) return false;
    return update({
      timer: Date.now() + seconds * 1000,
      timerLabel: String(name || 'Timer').slice(0, TIMER_NAME_MAX),
      timerNote: String(note || '').slice(0, TIMER_NOTE_MAX)
    });
  }

  function stopTimer() {
    return update({ timer: 0, timerLabel: '', timerNote: '' });
  }

  /* ---- Clock ---- */

  function secondHandColor() {
    if (settings.handColor === 'auto') return 'currentColor';
    if (settings.handColor === 'wallpaper') return 'var(--zeno-clock-accent,currentColor)';
    return settings.handColor;
  }

  function pad(n) {
    return ('0' + n).slice(-2);
  }

  /* Hours, minutes, seconds and date in a time zone (the chosen one by default). */
  function parts(now, zone) {
    zone = zone || settings.zone;
    try {
      if (!formatters[zone]) {
        var options = {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        };
        if (zone !== 'local') options.timeZone = zone;
        formatters[zone] = new Intl.DateTimeFormat('en-GB', options);
      }
      var values = {};
      formatters[zone].formatToParts(now).forEach(function (part) {
        if (part.type !== 'literal') values[part.type] = Number(part.value);
      });
      return {
        h: values.hour % 24,
        m: values.minute,
        s: values.second,
        year: values.year,
        month: values.month,
        day: values.day
      };
    } catch (e) {
      // Without Intl time zone support, fall back to the TV's own time.
      return {
        h: now.getHours(),
        m: now.getMinutes(),
        s: now.getSeconds(),
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate()
      };
    }
  }

  function time(now, zone) {
    var p = parts(now, zone);
    return pad(p.h) + ':' + pad(p.m);
  }

  function date(now, locale) {
    var options = { weekday: 'long', day: 'numeric', month: 'long' };
    if (settings.zone !== 'local') options.timeZone = settings.zone;
    try {
      return now.toLocaleDateString(locale, options);
    } catch (e) {
      return now.toLocaleDateString(locale);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function zoneName() {
    if (settings.zone === 'local') return '';
    return ZONES.filter(function (zone) {
      return zone.id === settings.zone;
    })[0].name;
  }

  function analogClockHTML() {
    var marks = '';
    for (var hour = 0; hour < 12; hour++) {
      var length = hour % 3 === 0 ? 10 : 5;
      marks += '<path d="M70 9v' + length + '" transform="rotate(' + hour * 30 + ' 70 70)"/>';
    }
    var secondHand = settings.seconds
      ? '<path class="widget-hand-second" d="M70 82V14" stroke="' + secondHandColor() + '"/>'
      : '';
    return (
      '<div class="desk-clock desk-clock-analog density-' +
      settings.clockDensity +
      '">' +
      '<svg class="zeno-analog-clock" viewBox="0 0 140 140">' +
      '<circle class="clock-face" cx="70" cy="70" r="66"/>' +
      '<g class="clock-marks">' +
      marks +
      '</g>' +
      '<path class="clock-hour widget-hand-hour" d="M70 70V36"/>' +
      '<path class="clock-minute widget-hand-minute" d="M70 70V20"/>' +
      secondHand +
      '<circle cx="70" cy="70" r="4" fill="currentColor"/>' +
      '</svg><span class="widget-date-main"></span></div>'
    );
  }

  /* The clock's markup. tick() fills in the time afterwards. */
  function clockHTML(style) {
    if (style === 'analog') return analogClockHTML();
    if (style === 'compact') style = 'digital';
    var seconds = settings.seconds
      ? '<span class="widget-clock-seconds" style="color:' + secondHandColor() + '"></span>'
      : '';
    return (
      '<div class="desk-clock desk-clock-' +
      style +
      ' density-' +
      settings.clockDensity +
      (settings.seconds ? ' has-seconds' : '') +
      '">' +
      '<span class="widget-clock-digital"><span class="widget-clock-time"></span>' +
      seconds +
      '</span>' +
      '<span class="widget-date-main"></span>' +
      '<span class="widget-zone-name">' +
      escapeHtml(zoneName()) +
      '</span>' +
      '</div>'
    );
  }

  // Only touch the DOM when something actually changes: the TV redraws on every write.
  function setText(element, value) {
    if (element && element.textContent !== String(value)) element.textContent = String(value);
  }

  function setAttribute(element, name, value) {
    if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function each(root, selector, apply) {
    Array.prototype.forEach.call(root.querySelectorAll(selector), apply);
  }

  function rotation(degrees) {
    return 'rotate(' + degrees + ' 70 70)';
  }

  /* Update every clock and timer under root to the current time. */
  function tick(root, locale) {
    var now = new Date();
    var p = parts(now);
    each(root, '.widget-clock-time', function (element) {
      setText(element, pad(p.h) + ':' + pad(p.m));
    });
    each(root, '.widget-clock-seconds', function (element) {
      setText(element, ':' + pad(p.s));
    });
    each(root, '.widget-date-main', function (element) {
      setText(element, date(now, locale));
    });
    each(root, '.widget-hand-hour', function (element) {
      setAttribute(element, 'transform', rotation((p.h % 12) * 30 + p.m * 0.5));
    });
    each(root, '.widget-hand-minute', function (element) {
      setAttribute(element, 'transform', rotation(p.m * 6));
    });
    each(root, '.widget-hand-second', function (element) {
      setAttribute(element, 'transform', rotation(p.s * 6));
    });

    if (settings.timer && Date.now() >= settings.timer && notifiedTimer !== settings.timer) {
      notifiedTimer = settings.timer;
      lastTimer = { name: settings.timerLabel || 'Timer', note: settings.timerNote };
      stopTimer();
      document.dispatchEvent(new Event('zeno-timer-ended'));
    }
    var remaining = settings.timer ? Math.max(0, Math.ceil((settings.timer - Date.now()) / 1000)) : 0;
    each(root, '.widget-timer-remaining', function (element) {
      setText(element, pad(Math.floor(remaining / 60)) + ':' + pad(remaining % 60));
    });
  }

  /* ---- Music ----
     Three ways to play: repeat the current track (the default), the playlist in
     order, or shuffled. The playlist is the tracks you picked, or all of them.
     Two audio elements take turns, so a track fades into the next one, or into
     its own beginning when it repeats: field recordings never restart with a
     jump. The built-in loops are made to repeat seamlessly and use the native
     loop instead; in the playlist they stay on for a few minutes. */

  var MODES = ['one', 'order', 'shuffle'];
  var FADE_SECONDS = { song: 3, ambient: 7, manual: 1.2 };
  var LOOP_MIN_SECONDS = 180; // a short built-in loop plays at least this long in a playlist
  var MAX_HISTORY = 50;

  var audio = null; // the element you hear
  var fading = null; // { from, to, start, length, timer }
  var audioError = '';
  var playRequest = 0; // a pause cancels a play that has not started yet
  var trackId = BUILTIN[0].id; // the track survives changes to the playlist
  var pendingSeek = 0; // seconds to seek once the track's length is known
  var looped = 0; // seconds already played by the current track in earlier loops
  var lastTime = 0;
  var history = [];
  var bag = []; // shuffle: tracks not played yet in this round

  function trackIndex() {
    var list = playlist();
    for (var i = 0; i < list.length; i++) if (list[i].id === trackId) return i;
    return 0;
  }

  function current() {
    return playlist()[trackIndex()];
  }

  function byId(id) {
    return playlist().filter(function (t) {
      return t.id === id;
    })[0];
  }

  /* The tracks in rotation: the ones you picked that still exist, else all. */
  function rotation() {
    var all = playlist(),
      picked = all.filter(function (t) {
        return settings.rotation.indexOf(t.id) >= 0;
      });
    return picked.length ? picked : all;
  }

  function nativeLoop(track) {
    return track.kind === 'builtin';
  }

  function fadeLength(track, duration) {
    var seconds =
      track.kind === 'nature' || track.kind === 'builtin' ? FADE_SECONDS.ambient : FADE_SECONDS.song;
    return isFinite(duration) && duration > 0 ? Math.min(seconds, duration / 4) : seconds;
  }

  function player() {
    var track = current();
    return {
      playing: !!(audio && !audio.paused),
      error: audioError,
      position: audio ? audio.currentTime : 0,
      duration: audio && isFinite(audio.duration) ? audio.duration : 0,
      track: trackIndex(),
      tracks: playlist().length,
      id: track.id,
      title: track.title,
      note: track.note,
      loop: settings.playMode === 'one',
      mode: settings.playMode,
      rotation: rotation().length,
      fading: !!fading
    };
  }

  function makeAudio(track) {
    var a = new Audio(track.src);
    a.preload = 'none';
    a.loop = nativeLoop(track) && settings.playMode === 'one';
    a.addEventListener('ended', function () {
      if (a !== audio) return;
      // Normally the fade starts before the end; this covers very short files.
      advance(false);
    });
    a.addEventListener('timeupdate', function () {
      if (a === audio) watch();
    });
    a.addEventListener('loadedmetadata', function () {
      if (a !== audio || !pendingSeek) return;
      var delta = pendingSeek;
      pendingSeek = 0;
      seekAudio(delta);
    });
    a.addEventListener('pause', function () {
      if (a === audio) changed();
    });
    a.addEventListener('playing', function () {
      if (a === audio) changed();
    });
    a.addEventListener('error', function () {
      if (a !== audio) return;
      audioError = 'Audio non disponibile';
      changed();
    });
    return a;
  }

  function ensureAudio() {
    if (!audio) audio = makeAudio(current());
  }

  /* Called a few times a second while playing: count loops, start the fade in time. */
  function watch() {
    if (fading || audio.paused) return;
    var track = current(),
      d = audio.duration,
      t = audio.currentTime;
    if (!isFinite(d) || d <= 0) return;
    if (t + 1 < lastTime) looped += lastTime; // the native loop went back to the start
    lastTime = t;
    if (nativeLoop(track)) {
      // In a playlist, a short loop repeats until it has played a few minutes.
      var stay = settings.playMode === 'one' || looped + d < LOOP_MIN_SECONDS;
      if (audio.loop !== stay) audio.loop = stay;
      if (stay) return;
    }
    if (d - t <= fadeLength(track, d)) advance(true);
  }

  function shuffled(list) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)),
        x = out[i];
      out[i] = out[j];
      out[j] = x;
    }
    return out;
  }

  /* The track after the current one in this mode. */
  function nextId(step) {
    var list = rotation(),
      ids = list.map(function (t) {
        return t.id;
      });
    if (settings.playMode === 'shuffle' && ids.length > 1) {
      bag = bag.filter(function (id) {
        return ids.indexOf(id) >= 0 && id !== trackId;
      });
      if (!bag.length)
        bag = shuffled(ids).filter(function (id) {
          return id !== trackId;
        });
      return bag.shift();
    }
    var at = ids.indexOf(trackId);
    if (at < 0) return ids[0];
    return ids[(at + (step || 1) + ids.length) % ids.length];
  }

  /* At the end of a track: the same one again in "repeat", else the next one. */
  function advance(fade) {
    var id = settings.playMode === 'one' ? trackId : nextId(1);
    if (id !== trackId) remember();
    go(id, fade ? fadeLength(current(), audio && audio.duration) : 0, true);
  }

  function remember() {
    history.push(trackId);
    if (history.length > MAX_HISTORY) history.shift();
  }

  /* Switch to track `id`. While music plays, the two tracks cross-fade over
     `seconds` (0: a clean cut); otherwise the new track simply waits. */
  function go(id, seconds, autoplay) {
    var track = byId(id);
    if (!track) return false;
    var wasPlaying = (audio && !audio.paused) || autoplay;
    endFade();
    pendingSeek = 0;
    audioError = '';
    looped = 0;
    lastTime = 0;
    var changedTrack = id !== trackId;
    trackId = id;
    if (changedTrack && settings.track !== id) update({ track: id });
    var outgoing = audio;
    if (!wasPlaying || !outgoing || !seconds) {
      // No fade: the same element simply changes track, and an idle player stays idle.
      if (outgoing) {
        outgoing.pause();
        outgoing.src = track.src;
        outgoing.loop = nativeLoop(track) && settings.playMode === 'one';
        outgoing.volume = 1;
        try {
          outgoing.load();
        } catch (ignore) {}
      }
      if (wasPlaying) playAudio();
      else changed();
      return true;
    }
    audio = makeAudio(track);
    audio.volume = 0;
    fading = { from: outgoing, to: audio, start: Date.now(), length: seconds * 1000, timer: null };
    fading.timer = setInterval(stepFade, 50);
    playAudio(function (error) {
      if (error) endFade();
    });
    changed();
    return true;
  }

  /* Equal-power fade: the sum stays as loud as either track alone. */
  function stepFade() {
    if (!fading) return;
    var k = Math.min(1, (Date.now() - fading.start) / fading.length);
    try {
      fading.from.volume = Math.cos((k * Math.PI) / 2);
      fading.to.volume = Math.sin((k * Math.PI) / 2);
    } catch (ignore) {}
    if (k >= 1) endFade();
  }

  function endFade() {
    if (!fading) return;
    clearInterval(fading.timer);
    try {
      fading.from.pause();
      fading.from.removeAttribute('src');
      fading.to.volume = 1;
    } catch (ignore) {}
    fading = null;
  }

  function playAudio(done) {
    done = done || function () {};
    ensureAudio();
    if (!audio.paused) {
      done(null);
      return;
    }
    audioError = '';
    var request = ++playRequest;
    try {
      var playing = audio.play();
      if (!playing || !playing.then) {
        done(null);
        return;
      }
      playing.then(
        function () {
          if (request === playRequest) done(null);
        },
        function (error) {
          if (request !== playRequest) return;
          audioError = 'Il TV non ha avviato l’audio';
          changed();
          done(error);
        }
      );
    } catch (error) {
      audioError = 'Audio non disponibile';
      changed();
      done(error);
    }
  }

  function pauseAudio() {
    playRequest++;
    endFade();
    if (audio) audio.pause();
  }

  function toggleAudio(done) {
    if (audio && !audio.paused) {
      pauseAudio();
      audioError = '';
      if (done) done(null);
    } else {
      playAudio(done);
    }
  }

  /* Move by delta seconds. Before the track has loaded, the seek waits for it. */
  function seekAudio(delta) {
    if (!audio || !isFinite(delta)) return false;
    endFade();
    if (!isFinite(audio.duration) || audio.duration <= 0) {
      pendingSeek = Math.max(-DAY_SECONDS, Math.min(DAY_SECONDS, pendingSeek + delta));
      return true;
    }
    try {
      var limit = audio.duration - (audio.loop ? 0.05 : fadeLength(current(), audio.duration) + 0.5);
      audio.currentTime = Math.max(0, Math.min(Math.max(0, limit), audio.currentTime + delta));
      lastTime = audio.currentTime;
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Next and previous: shuffle remembers what it played, so "previous" goes back. */
  function changeTrack(delta) {
    if (!playlist().length) return false;
    var id;
    if (delta < 0 && settings.playMode === 'shuffle' && history.length) id = history.pop();
    else {
      id = nextId(delta);
      if (delta > 0) remember();
    }
    return go(id, FADE_SECONDS.manual, false);
  }

  /* Switch to track `index` of tracks(), carrying on playing if music was playing. */
  function selectTrack(index) {
    var list = playlist();
    if (!(index >= 0 && index < list.length)) return false;
    if (list[index].id === trackId && audio) return true;
    if (list[index].id !== trackId) remember();
    return go(list[index].id, FADE_SECONDS.manual, false);
  }

  function setMode(mode) {
    if (MODES.indexOf(mode) < 0) return false;
    bag = [];
    if (!update({ playMode: mode })) return false;
    if (audio) audio.loop = nativeLoop(current()) && mode === 'one';
    looped = 0;
    return true;
  }

  /* Add or remove a track from the playlist; an empty playlist means every track. */
  function toggleRotation(id) {
    if (!byId(id)) return false;
    var picked = rotation()
      .map(function (t) {
        return t.id;
      })
      .filter(function (x) {
        return settings.rotation.length || x !== id; // from "all": keep everything but this one
      });
    if (settings.rotation.length) {
      var at = picked.indexOf(id);
      if (at >= 0) picked.splice(at, 1);
      else picked.push(id);
    }
    if (!picked.length && settings.rotation.length) return false; // keep at least one
    return setRotation(picked.length === playlist().length ? [] : picked);
  }

  function setRotation(ids) {
    bag = [];
    return update({ rotation: ids });
  }

  function inRotation(id) {
    return !settings.rotation.length || settings.rotation.indexOf(id) >= 0;
  }

  function stopAudio() {
    pauseAudio();
    pendingSeek = 0;
    if (!audio) return;
    try {
      audio.currentTime = 0;
    } catch (ignore) {}
  }

  /* Handle a media key. Returns false for keys the player does not use. */
  function media(name, done) {
    switch (name) {
      case 'MediaPlayPause':
        toggleAudio(done);
        break;
      case 'MediaPlay':
        playAudio(done);
        break;
      case 'MediaPause':
        pauseAudio();
        break;
      case 'MediaStop':
        stopAudio();
        break;
      case 'MediaFastForward':
        seekAudio(SEEK_SECONDS);
        break;
      case 'MediaRewind':
        seekAudio(-SEEK_SECONDS);
        break;
      case 'MediaTrackNext':
        changeTrack(1);
        break;
      case 'MediaTrackPrevious':
        changeTrack(-1);
        break;
      default:
        return false;
    }
    return true;
  }

  /* ---- Timer alarm ----
     It rings in a loop until any key is pressed, or for ten minutes at most.
     Music pauses while it rings. */

  var alarm = null;
  var alarmTimer = null;

  function silence() {
    if (!alarm) return;
    clearTimeout(alarmTimer);
    window.removeEventListener('keydown', silence, true);
    try {
      alarm.pause();
    } catch (ignore) {}
    alarm = null;
    changed();
  }

  function ring() {
    silence();
    pauseAudio();
    try {
      alarm = new Audio(ALARM_SRC);
      alarm.loop = true;
      var playing = alarm.play();
      if (playing && playing.catch) playing.catch(function () {});
    } catch (e) {
      alarm = null;
      return;
    }
    alarmTimer = setTimeout(silence, ALARM_LIMIT_MS);
    // Capture phase: the key that silences the alarm still does its usual job.
    window.addEventListener('keydown', silence, true);
    changed();
  }

  try {
    loadSaved();
  } catch (ignore) {}
  if (settings.track && byId(settings.track)) trackId = settings.track;

  /* A track removed from the TV: move on to the first one. */
  document.addEventListener('zeno-music-change', function () {
    var list = playlist();
    for (var i = 0; i < list.length; i++) if (list[i].id === trackId) return;
    selectTrack(0);
    changed();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      pauseAudio();
      silence();
    }
  });

  window.ZenoWidgets = {
    config: function () {
      return JSON.parse(JSON.stringify(settings));
    },
    set: set,
    update: update,
    startTimer: startTimer,
    stopTimer: stopTimer,
    lastTimer: function () {
      return lastTimer;
    },
    handColor: secondHandColor,
    media: media,
    seekAudio: seekAudio,
    revision: function () {
      return revision;
    },
    zones: ZONES,
    parts: parts,
    time: time,
    date: date,
    clockHTML: clockHTML,
    tick: tick,
    player: player,
    toggleAudio: toggleAudio,
    pauseAudio: pauseAudio,
    selectTrack: selectTrack,
    setMode: setMode,
    toggleRotation: toggleRotation,
    setRotation: setRotation,
    tracks: function () {
      return playlist().map(function (track) {
        return {
          id: track.id,
          title: track.title,
          note: track.note,
          kind: track.kind,
          inRotation: inRotation(track.id)
        };
      });
    },
    ring: ring,
    silence: silence,
    ringing: function () {
      return !!alarm;
    },
    // How often the clock needs a tick, in ms.
    interval: function () {
      return settings.seconds || settings.timer ? 1000 : 60000;
    }
  };

  applyAnimations();
})();
