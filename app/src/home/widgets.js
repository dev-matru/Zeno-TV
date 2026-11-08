/* The clock, timer and music widgets.
 *
 * Settings are saved under zeno.widgets.v1. The clock can show another time
 * zone and seconds; the timer survives a restart because it stores its end
 * time. Music is a single bundled loop that plays only when asked to, and
 * pauses whenever Zeno goes to the background.
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

  /* Original tracks made by scripts/build/build-demo-audio.py; each one loops. */
  var PLAYLIST = [
    { id: 'lounge', title: 'Jazz lounge', note: 'Piano elettrico e contrabbasso' },
    { id: 'piano', title: 'Pianoforte', note: 'Arpeggi lenti con eco' },
    { id: 'pad', title: 'Ambient', note: 'Accordi morbidi che vanno e vengono' },
    { id: 'rain', title: 'Pioggia', note: 'Pioggia leggera e costante' },
    { id: 'waves', title: 'Onde del mare', note: 'Risacca lenta' },
    { id: 'noise', title: 'Rumore marrone', note: 'Fruscio profondo per concentrarsi o dormire' }
  ].map(function (track) {
    track.src = 'assets/audio/' + track.id + '.m4a';
    return track;
  });

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
    timers: [] // saved presets: { id, name, note, seconds }
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

  /* ---- Music ---- */

  var audio = null;
  var audioError = '';
  var playRequest = 0; // a pause cancels a play that has not started yet
  var trackIndex = 0;
  var pendingSeek = 0; // seconds to seek once the track's length is known

  function player() {
    return {
      playing: !!(audio && !audio.paused),
      error: audioError,
      position: audio ? audio.currentTime : 0,
      duration: audio && isFinite(audio.duration) ? audio.duration : 0,
      track: trackIndex,
      tracks: PLAYLIST.length,
      id: PLAYLIST[trackIndex].id,
      title: PLAYLIST[trackIndex].title,
      note: PLAYLIST[trackIndex].note
    };
  }

  function ensureAudio() {
    if (audio) return;
    audio = new Audio(PLAYLIST[trackIndex].src);
    audio.preload = 'none';
    audio.loop = true;
    audio.addEventListener('loadedmetadata', function () {
      if (!pendingSeek) return;
      var delta = pendingSeek;
      pendingSeek = 0;
      seekAudio(delta);
    });
    audio.addEventListener('pause', changed);
    audio.addEventListener('playing', changed);
    audio.addEventListener('error', function () {
      audioError = 'Audio non disponibile';
      changed();
    });
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
    if (!isFinite(audio.duration) || audio.duration <= 0) {
      pendingSeek = Math.max(-DAY_SECONDS, Math.min(DAY_SECONDS, pendingSeek + delta));
      return true;
    }
    try {
      audio.currentTime = Math.max(0, Math.min(audio.duration - 0.05, audio.currentTime + delta));
      return true;
    } catch (e) {
      return false;
    }
  }

  function changeTrack(delta) {
    return selectTrack((trackIndex + delta + PLAYLIST.length) % PLAYLIST.length);
  }

  /* Switch to track `index`, carrying on playing if music was playing. */
  function selectTrack(index) {
    if (!(index >= 0 && index < PLAYLIST.length)) return false;
    if (index === trackIndex) return true;
    var wasPlaying = audio && !audio.paused;
    pauseAudio();
    pendingSeek = 0;
    audioError = '';
    trackIndex = index;
    if (audio) {
      audio.src = PLAYLIST[trackIndex].src;
      audio.load();
    }
    if (wasPlaying) playAudio();
    else changed();
    return true;
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
    tracks: function () {
      return PLAYLIST.map(function (track) {
        return { id: track.id, title: track.title, note: track.note };
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
