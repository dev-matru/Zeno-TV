/* Music downloaded on the TV: the catalogue in src/home/music-catalog.js and
 * links sent from a phone.
 *
 * Files live in a private folder next to a small library.json. The app plays
 * them through the service (GET /music/<id>.<ext>, with Range support so the
 * player can seek). A link is either an audio file or a page that names one
 * (Open Graph audio, an <audio> tag, Freesound, the Internet Archive).
 *
 * To add a link, the app opens a small page on the local network for fifteen
 * minutes (port 4798). The QR code on the TV carries a random key: without
 * it, the page answers nothing.
 */
'use strict';
var fs = require('fs'),
  http = require('http'),
  https = require('https'),
  dns = require('dns'),
  os = require('os'),
  crypto = require('crypto'),
  URL = require('url');
var CATALOG = require('../src/home/music-catalog.js');

var options = {
  root: '/home/owner/share/zeno-tv-music',
  port: 4798,
  allowPrivate: false, // only the checks turn this on, to serve files locally
  importMinutes: 15
};
var MAX_BYTES = 150000000;
var MAX_RAW_BYTES = 900000000; // an uncompressed upload, before the app converts it
var MAX_TRACKS = 300;
var MAX_RUNNING = 2;
var PAGE_BYTES = 3000000;
var AGENT = 'ZenoTV/1.0 (Samsung TV music widget)';

var library = null; // [{ id, title, artist, license, page, ext, bytes, kind, origin, added }]
var jobs = {}; // id -> { id, title, received, total, state, error, origin }
var queue = [];
var running = 0;
var lan = null; // { server, key, url, expires, timer, added: [ids] }

/* ---- Library ---- */

function path(name) {
  return options.root + '/' + name;
}

function load() {
  if (library) return library;
  try {
    var saved = JSON.parse(fs.readFileSync(path('library.json'), 'utf8'));
    library = (Array.isArray(saved.tracks) ? saved.tracks : []).filter(function (t) {
      try {
        return (
          validId(t.id) && /^(mp3|m4a|ogg|wav|flac|aac|aiff)$/.test(t.ext) && fs.statSync(file(t)).size > 0
        );
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    library = [];
  }
  return library;
}

function save() {
  if (!fs.existsSync(options.root)) fs.mkdirSync(options.root, 448);
  fs.writeFileSync(path('library.json.part'), JSON.stringify({ version: 1, tracks: library }), { mode: 384 });
  fs.renameSync(path('library.json.part'), path('library.json'));
}

function file(track) {
  return path(track.id + '.' + track.ext);
}

function validId(id) {
  return typeof id === 'string' && /^[a-z]{2}-[a-z0-9-]{1,48}$/.test(id);
}

function find(id) {
  return load().filter(function (t) {
    return t.id === id;
  })[0];
}

function entry(id) {
  return CATALOG.filter(function (e) {
    return e.id === id;
  })[0];
}

function state() {
  var bytes = 0;
  load().forEach(function (t) {
    bytes += t.bytes || 0;
  });
  return {
    tracks: load().slice(),
    jobs: Object.keys(jobs).map(function (id) {
      return jobs[id];
    }),
    bytes: bytes,
    import: lan ? { url: lan.url, expires: lan.expires, added: lan.added.slice() } : null
  };
}

/* ---- Network ---- */

function privateAddress(address) {
  if (/^(127|10|0)\./.test(address) || /^169\.254\./.test(address) || /^192\.168\./.test(address))
    return true;
  var m = /^(172|100)\.(\d+)\./.exec(address);
  if (m && m[1] === '172' && +m[2] >= 16 && +m[2] <= 31) return true;
  if (m && m[1] === '100' && +m[2] >= 64 && +m[2] <= 127) return true;
  return /^(::1?|f[cd][0-9a-f]{2}:|fe80:|::ffff:(127|10|192\.168)\.)/i.test(address);
}

/* Only public hosts: a link must not reach the TV itself or the home network. */
function checkHost(hostname, done) {
  if (options.allowPrivate) return done(null);
  dns.lookup(hostname, { all: true }, function (error, addresses) {
    if (error || !addresses || !addresses.length) return done(Error('Indirizzo non raggiungibile.'));
    if (
      addresses.some(function (a) {
        return privateAddress(a.address);
      })
    )
      return done(Error('Indirizzo non consentito.'));
    done(null);
  });
}

/* GET with up to five redirects: done(error, response, finalUrl). */
function get(address, done, hops) {
  hops = hops || 0;
  var parts = URL.parse(address);
  if (!/^https?:$/.test(parts.protocol || '') || !parts.hostname)
    return done(Error('Il link deve iniziare con http:// o https://'));
  checkHost(parts.hostname, function (error) {
    if (error) return done(error);
    var finished = false;
    function finish(error, res) {
      if (finished) return;
      finished = true;
      done(error, res, address);
    }
    var request = (parts.protocol === 'https:' ? https : http).get(
      {
        protocol: parts.protocol,
        hostname: parts.hostname,
        port: parts.port,
        path: parts.path,
        headers: { 'User-Agent': AGENT, Accept: '*/*' }
      },
      function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (hops >= 5) return finish(Error('Troppi reindirizzamenti.'));
          finished = true;
          return get(URL.resolve(address, res.headers.location), done, hops + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return finish(Error('Il sito ha risposto ' + res.statusCode + '.'));
        }
        finish(null, res);
      }
    );
    request.setTimeout(30000, function () {
      request.destroy();
      finish(Error('Il sito non risponde.'));
    });
    request.on('error', function () {
      finish(Error('Connessione non disponibile.'));
    });
  });
}

/* The audio format from the first bytes of the file, or null. */
function sniff(b) {
  if (b.length < 12) return null;
  if (b.slice(0, 3).toString() === 'ID3') return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  if (b.slice(4, 8).toString() === 'ftyp') return 'm4a';
  if (b.slice(0, 4).toString() === 'OggS') return 'ogg';
  if (b.slice(0, 4).toString() === 'fLaC') return 'flac';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WAVE') return 'wav';
  if (b.slice(0, 4).toString() === 'FORM' && /^AIF[FC]$/.test(b.slice(8, 12).toString())) return 'aiff';
  return null;
}

/* ---- Downloads ---- */

function job(id, title, origin) {
  jobs[id] = { id: id, title: title, received: 0, total: 0, state: 'queued', error: '', origin: origin };
  return jobs[id];
}

function fail(j, error) {
  j.state = 'error';
  j.error = error.message || String(error);
  try {
    fs.unlinkSync(path(j.id + '.part'));
  } catch (ignore) {}
}

function schedule(j, work) {
  queue.push({ job: j, work: work });
  next();
}

function next() {
  while (running < MAX_RUNNING && queue.length) {
    (function (item) {
      running++;
      item.job.state = 'running';
      item.work(function (error) {
        running--;
        if (error) fail(item.job, error);
        next();
      });
    })(queue.shift());
  }
}

/* Write an audio stream into the library as `meta`: done(error). The first bytes
   must be audio; `total` (0 when unknown) is checked against what arrives. */
function store(j, stream, total, meta, done) {
  var limit = meta.raw ? MAX_RAW_BYTES : MAX_BYTES;
  if (total > limit) {
    stream.resume();
    return done(Error('File troppo grande.'));
  }
  if (!fs.existsSync(options.root)) fs.mkdirSync(options.root, 448);
  var part = path(j.id + '.part'),
    out = fs.createWriteStream(part, { mode: 384 }),
    head = null,
    ended = false;
  j.total = total;
  j.received = 0;
  function end(error, value) {
    if (ended) return;
    ended = true;
    done(error, value);
  }
  function stop(error) {
    end(error);
    out.destroy();
    // An upload is drained, so the phone still gets the answer; a download is cut.
    if (meta.drain) stream.resume();
    else stream.destroy();
  }
  stream.on('data', function (chunk) {
    if (ended) return;
    if (!head) {
      head = sniff(chunk);
      if (!head) return stop(Error(meta.notAudio || 'Il link non porta a un file audio.'));
      if (meta.only && head !== meta.only) return stop(Error('Formato inatteso.'));
      if (head !== 'wav' && head !== 'aiff') limit = MAX_BYTES; // only raw audio may be larger
    }
    j.received += chunk.length;
    if (j.received > limit) return stop(Error('File troppo grande.'));
    if (j.cancelled) return stop(Error('Annullato.'));
    out.write(chunk);
  });
  stream.on('error', function () {
    out.destroy();
    end(Error('Trasferimento interrotto.'));
  });
  stream.on('aborted', function () {
    out.destroy();
    end(Error('Trasferimento interrotto.'));
  });
  stream.on('end', function () {
    if (ended) return;
    out.end(function () {
      if (ended) return;
      if (!head || (total && j.received < total)) return end(Error('Trasferimento interrotto.'));
      try {
        if (meta.replace) return end(null, meta.replace(head, j.received, part));
        var track = {
          id: j.id,
          title: meta.title,
          artist: meta.artist || '',
          license: meta.license || '',
          page: meta.page || '',
          kind: meta.kind || 'link',
          origin: meta.origin,
          ext: head,
          bytes: j.received,
          added: Date.now()
        };
        fs.renameSync(part, file(track));
        library = load().filter(function (t) {
          return t.id !== track.id;
        });
        library.push(track);
        save();
        delete jobs[j.id];
        end(null);
      } catch (e) {
        end(e);
      }
    });
  });
}

/* Download `address` into the library as `meta`: done(error). */
function fetchInto(j, address, meta, done) {
  if (load().length >= MAX_TRACKS) return done(Error('Troppi brani salvati: rimuovine qualcuno.'));
  get(address, function (error, res) {
    if (error) return done(error);
    store(j, res, +res.headers['content-length'] || 0, meta, done);
  });
}

/* A file sent from the phone page, streamed straight to the library. */
function upload(req, name, done) {
  if (load().length >= MAX_TRACKS) return done(Error('Troppi brani salvati: rimuovine qualcuno.'));
  var total = +req.headers['content-length'] || 0;
  if (!total) return done(Error('File vuoto.'));
  var title =
      String(name || '')
        .replace(/\.[a-z0-9]{2,5}$/i, '')
        .replace(/[_]+/g, ' ')
        .trim()
        .slice(0, 80) || 'Brano dal telefono',
    j = job('up-' + crypto.randomBytes(6).toString('hex'), title, 'upload');
  if (lan) lan.added.push(j.id);
  j.state = 'running';
  store(
    j,
    req,
    total,
    {
      title: title,
      kind: 'link',
      origin: 'upload',
      notAudio: 'Questo file non è audio.',
      raw: true,
      drain: true
    },
    function (error) {
      if (error) fail(j, error);
      done(error, j);
    }
  );
}

/* Download a catalogue track. */
function fetchTrack(id) {
  var e = entry(id);
  if (!e) throw Error('Brano non valido.');
  if (find(id) || (jobs[id] && jobs[id].state !== 'error')) return state();
  var j = job(id, e.title, 'catalog');
  j.total = e.bytes;
  schedule(j, function (done) {
    fetchInto(
      j,
      e.file,
      { title: e.title, artist: e.artist, license: e.license, page: e.page, kind: e.kind, origin: 'catalog' },
      done
    );
  });
  return state();
}

function remove(id) {
  if (jobs[id]) {
    jobs[id].cancelled = true;
    queue = queue.filter(function (item) {
      return item.job.id !== id;
    });
    delete jobs[id];
  }
  var track = find(id);
  if (track) {
    try {
      fs.unlinkSync(file(track));
    } catch (ignore) {}
    library = load().filter(function (t) {
      return t.id !== id;
    });
    save();
  }
  return state();
}

/* The app converted an uncompressed track (WAV, AIFF) to Ogg Opus: swap the files. */
function replace(id, req, done) {
  var track = find(id);
  if (!track || ['wav', 'aiff'].indexOf(track.ext) < 0) return done(Error('Brano non convertibile.'));
  var j = { id: id + '-ogg', received: 0, total: 0 };
  store(
    j,
    req,
    +req.headers['content-length'] || 0,
    {
      only: 'ogg',
      drain: true,
      notAudio: 'Conversione non valida.',
      replace: function (ext, bytes, part) {
        var old = file(track);
        track.ext = ext;
        track.bytes = bytes;
        fs.renameSync(part, file(track));
        if (old !== file(track)) fs.unlinkSync(old);
        save();
        return state();
      }
    },
    done
  );
}

/* ---- Links ---- */

function attr(tag, name) {
  var m = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  return m ? decode(m[2] !== undefined ? m[2] : m[3]) : '';
}

function decode(text) {
  return String(text)
    .replace(/&#(\d+);/g, function (m, n) {
      return String.fromCharCode(+n);
    })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) {
      return String.fromCharCode(parseInt(n, 16));
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function meta(html, property) {
  var tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (var i = 0; i < tags.length; i++) {
    var key = attr(tags[i], 'property') || attr(tags[i], 'name');
    if (key.toLowerCase() === property) return attr(tags[i], 'content');
  }
  return '';
}

/* What a web page says about its audio: { url, title, artist, license } or null. */
function readPage(html, address) {
  var found = '';
  ['og:audio:secure_url', 'og:audio:url', 'og:audio', 'twitter:player:stream'].some(function (p) {
    found = meta(html, p);
    return !!found;
  });
  if (!found) {
    var tag = /<(?:audio|source)\b[^>]*\ssrc\s*=[^>]*>/i.exec(html);
    if (tag) found = attr(tag[0], 'src');
  }
  if (!found) {
    var link =
      /["'(](https?:\/\/[^"'()\s<>]+?\.(?:mp3|m4a|ogg|oga|wav|flac|aac))(?:\?[^"'()\s<>]*)?["')]/i.exec(html);
    if (link) found = decode(link[1]);
  }
  if (!found) return null;
  // Freesound writes its own address in front of the CDN one.
  var last = found.lastIndexOf('https://');
  if (last > 0) found = found.slice(last);
  found = URL.resolve(address, found).replace(
    /(cdn\.freesound\.org\/previews\/.+)-lq\.(mp3|ogg)$/,
    '$1-hq.$2'
  );
  var title = meta(html, 'og:title') || ((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '').trim();
  var licence = /https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[a-z0-9.\/-]+/i.exec(html);
  return { url: found, title: decode(title), license: licence ? licenceName(licence[0]) : '' };
}

function licenceName(address) {
  var m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/?([0-9.]*)/i.exec(address);
  if (!m) return '';
  if (m[1] === 'publicdomain') return m[2] === 'zero' ? 'CC0' : 'Pubblico dominio';
  return 'CC ' + m[2].toUpperCase() + (m[3] ? ' ' + m[3] : '');
}

function readBody(res, limit, done) {
  var chunks = [],
    size = 0,
    ended = false;
  res.on('data', function (chunk) {
    size += chunk.length;
    if (size > limit) {
      ended = true;
      res.destroy();
      return done(Error('Pagina troppo grande.'));
    }
    chunks.push(chunk);
  });
  res.on('end', function () {
    if (!ended) done(null, Buffer.concat(chunks).toString('utf8'));
  });
  res.on('error', function () {
    if (!ended) done(Error('Pagina non disponibile.'));
  });
}

/* An Internet Archive item: pick the file in the link, else its first MP3. */
function readArchive(address, done) {
  var m = /^https?:\/\/(?:www\.)?archive\.org\/(?:details|download)\/([^\/?#]+)\/?([^?#]*)/.exec(address);
  if (!m) return done(null, null);
  get('https://archive.org/metadata/' + m[1], function (error, res) {
    if (error) return done(error);
    readBody(res, PAGE_BYTES, function (error, body) {
      if (error) return done(error);
      try {
        var data = JSON.parse(body),
          wanted = decodeURIComponent(m[2] || ''),
          files = (data.files || []).filter(function (f) {
            return /\.(mp3|m4a|ogg|flac|wav)$/i.test(f.name);
          }),
          pick =
            files.filter(function (f) {
              return f.name === wanted;
            })[0] ||
            files.filter(function (f) {
              return /\.mp3$/i.test(f.name);
            })[0] ||
            files[0];
        if (!pick) return done(Error('Nessun file audio in questa pagina.'));
        var md = data.metadata || {};
        done(null, {
          url: 'https://archive.org/download/' + m[1] + '/' + encodeURIComponent(pick.name),
          title: String(pick.title || pick.name.replace(/\.[a-z0-9]+$/i, '')),
          artist: String(pick.artist || md.creator || ''),
          license: licenceName(String(md.licenseurl || ''))
        });
      } catch (e) {
        done(Error('Pagina non riconosciuta.'));
      }
    });
  });
}

/* Find the audio behind a link: done(error, { url, title, artist, license }). */
function resolve(address, done) {
  readArchive(address, function (error, found) {
    if (error || found) return done(error, found);
    get(address, function (error, res, final) {
      if (error) return done(error);
      var type = String(res.headers['content-type'] || '').toLowerCase();
      if (/^(audio\/|application\/ogg|application\/octet-stream)/.test(type)) {
        res.destroy();
        var name = decodeURIComponent(URL.parse(final).pathname.split('/').pop() || 'Brano');
        return done(null, { url: final, title: name.replace(/\.[a-z0-9]+$/i, '').replace(/[_+]+/g, ' ') });
      }
      if (!/html/.test(type)) {
        res.resume();
        return done(Error('Il link non porta a un brano.'));
      }
      readBody(res, PAGE_BYTES, function (error, html) {
        if (error) return done(error);
        var page = readPage(html, final);
        if (!page) return done(Error('In questa pagina non ho trovato un brano da scaricare.'));
        page.page = final;
        done(null, page);
      });
    });
  });
}

function addLink(address) {
  address = String(address || '').trim();
  if (address.length > 800 || !/^https?:\/\/[^\s]+$/i.test(address))
    throw Error('Incolla un link che inizia con http:// o https://');
  var id = 'ln-' + crypto.createHash('sha1').update(address).digest('hex').slice(0, 12),
    known = find(id);
  if (lan && lan.added.indexOf(id) < 0) lan.added.push(id);
  if (known) return { id: id, title: known.title, state: 'done' };
  if (jobs[id] && jobs[id].state !== 'error') return jobs[id];
  var j = job(id, address.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), 'link');
  schedule(j, function (done) {
    resolve(address, function (error, found) {
      if (error) return done(error);
      j.title = String(found.title || j.title).slice(0, 80);
      fetchInto(
        j,
        found.url,
        {
          title: j.title,
          artist: String(found.artist || '').slice(0, 80),
          license: found.license || '',
          page: found.page || address,
          kind: 'link',
          origin: 'link'
        },
        done
      );
    });
  });
  return j;
}

/* ---- Playback ---- */

var TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aiff: 'audio/aiff'
};

/* Serve /music/<id>.<ext>. Returns false when the path is not a track. */
function serve(route, req, res) {
  var m = /^\/music\/([a-z]{2}-[a-z0-9-]{1,48})\.(mp3|m4a|ogg|wav|flac|aac|aiff)$/.exec(route);
  if (!m) return false;
  var track = find(m[1]);
  if (!track || track.ext !== m[2]) {
    res.writeHead(404);
    res.end();
    return true;
  }
  var size;
  try {
    size = fs.statSync(file(track)).size;
  } catch (e) {
    res.writeHead(404);
    res.end();
    return true;
  }
  var range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''),
    start = 0,
    end = size - 1,
    status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = +range[1];
      if (range[2]) end = Math.min(+range[2], size - 1);
    } else start = Math.max(0, size - +range[2]);
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size });
      res.end();
      return true;
    }
    status = 206;
  }
  var headers = {
    // The app reads uncompressed tracks in pieces to convert them (src/home/music-convert.js).
    'Access-Control-Allow-Origin': req.headers.origin || 'null',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
    Vary: 'Origin',
    'Content-Type': TYPES[track.ext],
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=86400'
  };
  if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(file(track), { start: start, end: end }).pipe(res);
  return true;
}

/* ---- The page on the local network ---- */

function localIp(hint) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hint || '') && privateAddress(hint)) return hint;
  var found = '';
  try {
    var all = os.networkInterfaces();
    Object.keys(all).some(function (name) {
      return all[name].some(function (a) {
        if (a.family === 'IPv4' || a.family === 4) {
          if (!a.internal && privateAddress(a.address)) found = a.address;
        }
        return !!found;
      });
    });
  } catch (ignore) {}
  return found;
}

function closeImport() {
  if (lan) {
    clearTimeout(lan.timer);
    try {
      lan.server.close();
    } catch (ignore) {}
    lan = null;
  }
  return state();
}

function openImport(hint, done) {
  if (lan) {
    clearTimeout(lan.timer);
    lan.expires = Date.now() + options.importMinutes * 60000;
    lan.timer = setTimeout(closeImport, options.importMinutes * 60000);
    return done(null, state());
  }
  var ip = localIp(hint);
  if (!ip) return done(Error('Il TV non è collegato alla rete di casa.'));
  var key = crypto.randomBytes(12).toString('hex'),
    server = http.createServer(function (req, res) {
      lanRequest(req, res, key);
    }),
    opened = false;
  server.on('error', function (error) {
    if (!opened) return done(Error('Il TV non apre la pagina in rete: ' + error.message));
  });
  server.listen(options.port, '0.0.0.0', function () {
    opened = true;
    lan = {
      server: server,
      key: key,
      url: 'http://' + ip + ':' + options.port + '/?k=' + key,
      expires: Date.now() + options.importMinutes * 60000,
      timer: setTimeout(closeImport, options.importMinutes * 60000),
      added: []
    };
    done(null, state());
  });
}

function lanReply(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function lanRequest(req, res, key) {
  var parts = URL.parse(req.url, true),
    given = String(parts.query.k || '');
  if (!lan || given.length !== key.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key)))
    return lanReply(res, 403, 'text/plain; charset=utf-8', 'Pagina scaduta: inquadra di nuovo il QR sul TV.');
  if (req.method === 'GET' && parts.pathname === '/')
    return lanReply(res, 200, 'text/html; charset=utf-8', PAGE);
  if (req.method === 'GET' && parts.pathname === '/status') {
    var list = lan.added.map(function (id) {
      var t = find(id),
        j = jobs[id];
      return t
        ? { id: id, title: t.title, state: 'done' }
        : j
          ? { id: id, title: j.title, state: j.state, error: j.error, received: j.received, total: j.total }
          : { id: id, title: '', state: 'removed' };
    });
    return lanReply(res, 200, 'application/json', JSON.stringify({ tracks: list }));
  }
  if (req.method === 'POST' && parts.pathname === '/upload') {
    upload(req, parts.query.name, function (error, j) {
      lanReply(
        res,
        error ? 400 : 200,
        'application/json',
        JSON.stringify(error ? { error: error.message } : { id: j.id, title: j.title, state: 'done' })
      );
    });
    return;
  }
  if (req.method === 'POST' && parts.pathname === '/add') {
    var body = '',
      big = false;
    req.on('data', function (chunk) {
      body += chunk;
      if (body.length > 4000) {
        big = true;
        req.destroy();
      }
    });
    req.on('end', function () {
      if (big) return;
      try {
        var link = /^\s*\{/.test(body) ? JSON.parse(body).url : URL.parse('?' + body, true).query.url;
        var j = addLink(link);
        lanReply(res, 200, 'application/json', JSON.stringify({ id: j.id, title: j.title, state: j.state }));
      } catch (e) {
        lanReply(res, 400, 'application/json', JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  lanReply(res, 404, 'text/plain; charset=utf-8', '');
}

/* The page the QR code opens on a phone. Plain HTML and a little script,
   in Italian or English after the phone's language. */
var PAGE = [
  '<!doctype html><html lang="it"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Zeno TV</title><style>',
  ':root{color-scheme:light dark;--bg:#f4f1ea;--fg:#1d1c1a;--mute:#6d6a63;--line:#d9d4c8;--card:#fffdf8;--accent:#2f6b5a;--bar:#e4ded2}',
  '@media (prefers-color-scheme:dark){:root{--bg:#141413;--fg:#efece4;--mute:#a19d94;--line:#34322e;--card:#1d1c1a;--accent:#7cc4ad;--bar:#2b2a27}}',
  'body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.45 system-ui,-apple-system,sans-serif}',
  'main{max-width:560px;margin:0 auto;padding:32px 16px 48px}h1{font-size:26px;margin:0 0 6px}p{color:var(--mute);margin:0 0 20px}',
  'h2{font-size:15px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:32px 0 10px}',
  'form{display:flex;flex-direction:column;gap:10px}input{font:inherit;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg)}',
  'button,label.pick{font:inherit;font-weight:600;padding:14px;border:0;border-radius:12px;background:var(--accent);color:var(--bg);text-align:center;cursor:pointer}',
  'label.pick input{display:none}small.note{display:block;color:var(--mute);margin-top:8px}',
  'ul{list-style:none;padding:0;margin:24px 0 0}li{padding:12px 0;border-top:1px solid var(--line);overflow-wrap:anywhere}li small{display:block;color:var(--mute)}',
  'progress{display:block;width:100%;height:6px;margin-top:6px;appearance:none;border:0;border-radius:3px;background:var(--bar);accent-color:var(--accent)}',
  '</style></head><body><main><h1 data-t="title">Aggiungi un brano</h1>',
  '<p data-t="help">Il TV lo aggiunge alla musica, nella sezione dei tuoi brani.</p>',
  '<h2 data-t="fileHead">Dal telefono</h2>',
  '<label class="pick"><span data-t="pick">Scegli un file audio</span><input type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.flac,.wav,.aif,.aiff" multiple></label>',
  '<small class="note" data-t="fileNote">MP3, M4A, AAC, Ogg, FLAC, WAV o AIFF. WAV e AIFF vengono compressi dal TV.</small>',
  '<h2 data-t="linkHead">Da un link</h2>',
  '<form><input name="url" type="url" required placeholder="https://" autocomplete="off" autocapitalize="off">',
  '<button data-t="send">Invia al TV</button></form>',
  '<small class="note" data-t="linkNote">Un file audio o la sua pagina: Freesound, Internet Archive, il sito di un artista.</small>',
  '<ul></ul></main><script>',
  'var en=!/^it/i.test(navigator.language||"");',
  'var IT={queued:"In coda",running:"Download",sending:"Invio",done:"Sul TV",error:"Errore",removed:"Rimosso",big:"File troppo grande.",down:"Il TV non risponde."};',
  'var EN={title:"Add a track",help:"The TV adds it to the music, among your tracks.",fileHead:"From your phone",pick:"Choose an audio file",fileNote:"MP3, M4A, AAC, Ogg, FLAC, WAV or AIFF. The TV compresses WAV and AIFF.",linkHead:"From a link",send:"Send to the TV",linkNote:"An audio file or its page: Freesound, Internet Archive, an artist’s site.",queued:"Queued",running:"Downloading",sending:"Sending",done:"On the TV",error:"Error",removed:"Removed",big:"File too large.",down:"The TV is not answering."};',
  'if(en){document.documentElement.lang="en";document.querySelectorAll("[data-t]").forEach(function(n){n.textContent=EN[n.dataset.t]})}',
  'var k=new URLSearchParams(location.search).get("k"),f=document.querySelector("form"),u=document.querySelector("ul"),pick=document.querySelector("input[type=file]");',
  'var sending=[],last=[];',
  'function word(s){return (en?EN:IT)[s]||s}',
  'function row(t){var li=document.createElement("li"),s=document.createElement("small");li.textContent=t.title||"…";',
  'var p=t.total?Math.round(100*t.received/t.total):0;s.textContent=word(t.state)+((t.state==="running"||t.state==="sending")&&t.total?" "+p+"%":"")+(t.error?" · "+t.error:"");li.appendChild(s);',
  'if(t.state==="sending"){var bar=document.createElement("progress");bar.max=100;bar.value=p;li.appendChild(bar)}return li}',
  'function show(){u.innerHTML="";sending.concat(last.slice().reverse()).forEach(function(t){u.appendChild(row(t))})}',
  'function poll(){fetch("/status?k="+k).then(function(r){return r.json()}).then(function(d){last=d.tracks;show()}).catch(function(){})}',
  'function send(files){if(!files.length){poll();return}var file=files.shift(),t={title:file.name,state:"sending",received:0,total:file.size};sending.push(t);show();',
  'var x=new XMLHttpRequest();x.open("POST","/upload?k="+k+"&name="+encodeURIComponent(file.name));',
  'x.upload.onprogress=function(e){t.received=e.loaded;show()};',
  'x.onload=function(){var d={};try{d=JSON.parse(x.responseText)}catch(e){}sending.splice(sending.indexOf(t),1);if(d.error){t.state="error";t.error=d.error;last.push(t)}show();send(files)};',
  'x.onerror=function(){sending.splice(sending.indexOf(t),1);t.state="error";t.error=word("down");last.push(t);show();send(files)};',
  'x.send(file)}',
  'pick.onchange=function(){var list=Array.prototype.slice.call(pick.files);pick.value="";send(list)};',
  'f.onsubmit=function(e){e.preventDefault();var b=f.querySelector("button");b.disabled=true;fetch("/add?k="+k,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:f.url.value})})',
  '.then(function(r){return r.json()}).then(function(d){if(d.error)alert(d.error);else f.reset();poll()}).catch(function(){alert(word("down"))}).then(function(){b.disabled=false})};',
  'poll();setInterval(function(){if(!sending.length)poll()},2000);</script></body></html>'
].join('');

module.exports = {
  configure: function (o) {
    Object.keys(o).forEach(function (k) {
      options[k] = o[k];
    });
    library = null;
  },
  state: state,
  fetch: fetchTrack,
  remove: remove,
  addLink: addLink,
  openImport: openImport,
  closeImport: closeImport,
  serve: serve,
  replace: replace,
  readPage: readPage,
  sniff: sniff
};
