/* Music downloaded on the TV, through the network service (app/service/music.js).
 *
 * The list of downloaded tracks is kept in localStorage too (zeno.music.v1),
 * so the player knows them at start without waiting for the service. While a
 * music page is open, watch(true) refreshes the state every 1.5 seconds and
 * fires 'zeno-music-change' on the document whenever something changes.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'zeno.music.v1';
  var POLL_MS = 1500;
  var CATALOG = Array.isArray(window.ZenoMusicCatalog) ? window.ZenoMusicCatalog : [];

  var state = { tracks: [], jobs: [], bytes: 0, import: null };
  var error = '';
  var watching = false;
  var timer = null;
  var busy = false;

  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Array.isArray(saved.tracks)) state.tracks = saved.tracks.filter(validTrack);
    } catch (ignore) {}
  }

  function validTrack(t) {
    return (
      t &&
      typeof t.id === 'string' &&
      /^[a-z]{2}-[a-z0-9-]{1,48}$/.test(t.id) &&
      typeof t.title === 'string' &&
      /^(mp3|m4a|ogg|wav|flac|aac|aiff)$/.test(t.ext)
    );
  }

  function changed() {
    document.dispatchEvent(new Event('zeno-music-change'));
  }

  function accept(value) {
    var before = JSON.stringify(state);
    state = {
      tracks: (value.tracks || []).filter(validTrack),
      jobs: value.jobs || [],
      bytes: value.bytes || 0,
      import: value.import || null
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tracks: state.tracks }));
    } catch (ignore) {}
    if (JSON.stringify(state) !== before) changed();
    convertNext();
  }

  /* ---- Uncompressed tracks from the phone become Ogg Opus (src/home/music-convert.js) ---- */

  var converting = null; // { id, progress }
  var convertErrors = {}; // id -> message, not retried until the app restarts

  function raw(t) {
    return t.ext === 'wav' || t.ext === 'aiff';
  }

  function convertNext() {
    if (converting || !window.ZenoConvert || !ZenoConvert.available() || !window.ZenoControl) return;
    var t = state.tracks.filter(function (x) {
      return raw(x) && !convertErrors[x.id];
    })[0];
    if (!t) return;
    converting = { id: t.id, progress: 0 };
    changed();
    ZenoConvert.run(
      ZenoControl.musicURL(t.id, t.ext),
      function (p) {
        if (converting && converting.progress !== p) {
          converting.progress = p;
          changed();
        }
      },
      function (e, blob) {
        if (e) return convertDone(t.id, e);
        ZenoControl.musicConverted(t.id, blob, function (e2, value) {
          if (!e2) accept(value || {});
          convertDone(t.id, e2);
        });
      }
    );
  }

  function convertDone(id, e) {
    if (e) convertErrors[id] = e.message;
    converting = null;
    changed();
    convertNext();
  }

  function command(body, done) {
    if (!window.ZenoControl) {
      done({ message: 'Disponibile sul TV.' });
      return;
    }
    ZenoControl.rpc(body, function (e, value) {
      if (e) {
        error = e.message;
        changed();
      } else {
        error = '';
        accept(value || {});
      }
      if (done) done(e, value);
    });
  }

  function refresh(done) {
    if (busy) {
      if (done) done(null);
      return;
    }
    busy = true;
    command({ op: 'music-state' }, function (e) {
      busy = false;
      if (done) done(e);
    });
  }

  function poll() {
    clearTimeout(timer);
    if (!watching) return;
    refresh(function () {
      if (watching) timer = setTimeout(poll, POLL_MS);
    });
  }

  function watch(on) {
    if (on === watching) return;
    watching = on;
    if (on) poll();
    else clearTimeout(timer);
  }

  function entry(id) {
    return CATALOG.filter(function (e) {
      return e.id === id;
    })[0];
  }

  function downloaded(id) {
    return state.tracks.filter(function (t) {
      return t.id === id;
    })[0];
  }

  function job(id) {
    return state.jobs.filter(function (j) {
      return j.id === id;
    })[0];
  }

  /* "Scott Buckley · CC BY 4.0" and the like. */
  function credit(t) {
    return [t.artist, t.license].filter(Boolean).join(' · ');
  }

  function minutes(seconds) {
    return seconds >= 3600 ? '1 ora' : Math.max(1, Math.round(seconds / 60)) + ' min';
  }

  function megabytes(bytes) {
    return Math.max(1, Math.round(bytes / 1000000)) + ' MB';
  }

  /* Tracks the player can play, catalogue order first, then links in the order added. */
  function tracks() {
    var order = {};
    CATALOG.forEach(function (e, i) {
      order[e.id] = i;
    });
    return state.tracks
      .filter(function (t) {
        return t.ext !== 'aiff'; // the TV plays it only once converted
      })
      .sort(function (a, b) {
        var x = a.id in order ? order[a.id] : 1e6 + (a.added || 0),
          y = b.id in order ? order[b.id] : 1e6 + (b.added || 0);
        return x - y;
      })
      .map(function (t) {
        var e = entry(t.id);
        return {
          id: t.id,
          title: t.title,
          note:
            converting && converting.id === t.id
              ? 'Compressione in corso ' + converting.progress + '%'
              : e && e.kind === 'nature'
                ? [e.place, e.artist].filter(Boolean).join(' · ')
                : credit(t) || (t.origin === 'upload' ? 'Dal tuo telefono' : 'Dal tuo link'),
          kind: e ? e.kind : 'link',
          loop: !!(e && e.kind === 'nature'),
          src: window.ZenoControl ? ZenoControl.musicURL(t.id, t.ext) : ''
        };
      });
  }

  /* Each catalogue entry with what the TV has: state 'ready', 'running', 'queued', 'error' or ''. */
  function catalog() {
    return CATALOG.map(function (e) {
      var j = job(e.id);
      return {
        id: e.id,
        kind: e.kind,
        group: e.group || '',
        title: e.title,
        place: e.place || '',
        artist: e.artist,
        album: e.album || '',
        license: e.license,
        page: e.page,
        original: e.original || '',
        length: minutes(e.seconds),
        size: megabytes(e.bytes),
        state: downloaded(e.id) ? 'ready' : j ? j.state : '',
        progress: j && j.total ? Math.min(99, Math.floor((100 * j.received) / j.total)) : 0,
        error: j && j.error ? j.error : ''
      };
    });
  }

  function links() {
    return state.tracks
      .filter(function (t) {
        return t.origin === 'link' || t.origin === 'upload';
      })
      .map(function (t) {
        var c = converting && converting.id === t.id;
        return {
          id: t.id,
          title: t.title,
          artist: t.artist,
          license: t.license,
          ready: t.ext !== 'aiff',
          state: c ? 'converting' : 'done',
          progress: c ? converting.progress : 0,
          error: convertErrors[t.id] || ''
        };
      })
      .concat(
        state.jobs.filter(function (j) {
          return j.origin === 'link' || j.origin === 'upload';
        })
      );
  }

  function tvIp() {
    try {
      return webapis.network.getIp() || '';
    } catch (e) {
      return '';
    }
  }

  load();

  window.ZenoMusic = {
    catalog: catalog,
    tracks: tracks,
    links: links,
    job: job,
    downloaded: downloaded,
    credit: credit,
    megabytes: megabytes,
    state: function () {
      return { bytes: state.bytes, import: state.import, error: error, jobs: state.jobs.length };
    },
    refresh: refresh,
    watch: watch,
    get: function (id, done) {
      command({ op: 'music-get', track: id }, done);
    },
    remove: function (id, done) {
      command({ op: 'music-remove', track: id }, done);
    },
    openImport: function (done) {
      command({ op: 'music-import', ip: tvIp() }, done);
    },
    closeImport: function (done) {
      if (!state.import) {
        if (done) done(null);
        return;
      }
      command({ op: 'music-import-close' }, done);
    }
  };
})();
