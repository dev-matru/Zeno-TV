/* Zeno TV network service. Authenticated HTTP bound to loopback only. */
'use strict';
var fs = require('fs'),
  wallpapers = require('./wallpapers');
function log(value) {
  try {
    fs.writeFileSync('/home/owner/share/zeno-tv-network-error.txt', String(value).slice(0, 1000), {
      mode: 420
    });
  } catch (ignore) {}
}
process.on('uncaughtException', function (error) {
  log(error.message);
});
log('Service loaded');
function trace(value) {
  try {
    fs.writeFileSync('/home/owner/share/zeno-tv-network-status.json', JSON.stringify(value), {
      mode: 420
    });
  } catch (ignore) {}
}
var SERVICE = 'ZenoTV0000.NetworkService',
  UI = 'ZenoTV0000.ZenoTV',
  port,
  watchId;
function devStatus(done) {
  var ended = false,
    request = require('http').get('http://127.0.0.1:8001/api/v2/', function (res) {
      var body = '';
      res.on('data', function (chunk) {
        body += chunk;
        if (body.length > 50000) {
          request.destroy();
          finish(Error('Risposta del TV non valida.'));
        }
      });
      res.on('end', function () {
        try {
          var d = JSON.parse(body).device;
          if (!d || typeof d.developerIP !== 'string' || ['0', '1'].indexOf(String(d.developerMode)) < 0)
            throw Error('Stato non disponibile.');
          finish(null, {
            ip: d.developerIP,
            enabled: String(d.developerMode) === '1',
            canWrite: false
          });
        } catch (e) {
          finish(e);
        }
      });
      res.on('error', finish);
    });
  function finish(error, value) {
    if (ended) return;
    ended = true;
    done(error, value);
  }
  request.setTimeout(4000, function () {
    request.destroy();
    finish(Error('Il TV non risponde.'));
  });
  request.on('error', finish);
}
function wol(data, done) {
  var dgram = require('dgram');
  if (
    !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(data.mac || '') ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(data.broadcast || '') ||
    data.broadcast.split('.').some(function (n) {
      return +n > 255;
    }) ||
    !(Number.isInteger(data.port) && data.port > 0 && data.port < 65536)
  )
    return done(Error('Configurazione WoL non valida.'));
  var mac = Buffer.from(data.mac.replace(/:/g, ''), 'hex'),
    packet = Buffer.alloc(102, 255),
    socket = dgram.createSocket('udp4'),
    finished = false;
  for (var i = 0; i < 16; i++) mac.copy(packet, 6 + i * 6);
  var timer = setTimeout(function () {
    finish(Error('Invio WoL scaduto.'));
  }, 3000);
  function finish(error) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try {
      socket.close();
    } catch (ignore) {}
    done(error, error ? null : { sent: true, bytes: packet.length });
  }
  socket.on('error', finish);
  socket.bind(0, function () {
    try {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, data.port, data.broadcast, finish);
    } catch (e) {
      finish(e);
    }
  });
}
function udpTest(done) {
  var dgram = require('dgram');
  var socket = dgram.createSocket('udp4'),
    ended = false,
    timer = setTimeout(function () {
      end(Error('UDP test timeout'));
    }, 3000);
  function end(error) {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    try {
      socket.close();
    } catch (ignore) {}
    done(error, error ? null : { udp: true });
  }
  socket.on('error', end);
  socket.on('message', function (msg) {
    end(msg.toString() === 'ZenoTV' ? null : Error('UDP mismatch'));
  });
  socket.bind(0, '127.0.0.1', function () {
    var data = Buffer.from('ZenoTV');
    socket.send(data, 0, data.length, socket.address().port, '127.0.0.1', function (error) {
      if (error) end(error);
    });
  });
}
function dispatch(data, done) {
  if (data.op === 'wallpaper') return wallpapers.prepare(data, null, done);
  if (data.op === 'developer') return done(Error('Il firmware richiede il menu Developer Mode di Samsung.'));
  if (data.op === 'settings') return done(Error('Apri il menu con l’API del launcher.'));
  if (data.op === 'cache-info') return done(null, wallpapers.info());
  if (data.op === 'cache-clear') return done(null, wallpapers.clear(data.keep || ''));
  if (data.op === 'app-memory') {
    if (
      !Number.isInteger(data.pid) ||
      data.pid < 1 ||
      !/^([A-Za-z0-9]{10}\.|org\.tizen\.|com\.samsung\.)[A-Za-z0-9._-]+$/.test(data.appId || '')
    )
      return done(Error('Applicazione non valida.'));
    try {
      var status = fs.readFileSync('/proc/' + data.pid + '/status', 'utf8'),
        m = /VmRSS:\s*(\d+)\s*kB/.exec(status);
      return done(null, { bytes: m ? +m[1] * 1024 : null });
    } catch (ignore) {
      return done(null, { bytes: null });
    }
  }
  if (data.op === 'status') return devStatus(done);
  if (data.op === 'udp-test') return udpTest(done);
  if (data.op === 'wol') return wol(data, done);
  done(Error('Operazione non supportata.'));
}
var http = require('http'),
  server;
var config = { token: '' /* LOCAL_TOKEN */ },
  responses = {},
  inflight = {};
function authorized(req) {
  var value = req.headers.authorization || '',
    expected = 'Bearer ' + config.token;
  if (!config.token || value.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
function start() {
  if (server) return;
  server = http.createServer(function (req, res) {
    var origin = req.headers.origin || 'null';
    function reply(status, value) {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        Vary: 'Origin',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(value));
    }
    if (['null', 'file://'].indexOf(origin) < 0 || req.headers.host !== '127.0.0.1:4796') {
      reply(403, { error: 'Richiesta non autorizzata.' });
      return;
    }
    if (req.method === 'OPTIONS') {
      reply(204, {});
      return;
    }
    var route = req.url.split('?')[0],
      match = /[?&]token=([a-f0-9]{64})(?:&|$)/.exec(req.url);
    if (
      req.method === 'GET' &&
      route.indexOf('/wallpaper/') === 0 &&
      match &&
      config.token &&
      match[1] === config.token
    ) {
      if (!wallpapers.image(route, res)) {
        reply(404, { error: 'Sfondo non trovato.' });
      }
      return;
    }
    if (!authorized(req)) {
      reply(403, { error: 'Servizio locale non autorizzato.' });
      return;
    }
    if (req.method === 'GET' && req.url === '/ready') {
      reply(200, { ready: true });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/command') {
      reply(404, { error: 'Operazione non supportata.' });
      return;
    }
    var body = '',
      oversized = false;
    req.on('data', function (chunk) {
      body += chunk;
      if (body.length > 2000) {
        oversized = true;
        req.destroy();
      }
    });
    req.on('end', function () {
      if (oversized) return;
      var data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        reply(400, { error: 'Richiesta non valida.' });
        return;
      }
      if (!/^[a-z0-9-]{1,48}$/i.test(data.id || '')) {
        reply(400, { error: 'Identificatore non valido.' });
        return;
      }
      if (responses[data.id]) {
        reply(200, responses[data.id]);
        return;
      }
      if (inflight[data.id]) {
        reply(409, { error: 'Operazione già in corso.' });
        return;
      }
      inflight[data.id] = true;
      function done(error, value) {
        delete inflight[data.id];
        var result = { id: data.id, error: error ? error.message : null, value: value };
        responses[data.id] = result;
        var keys = Object.keys(responses);
        if (keys.length > 50) delete responses[keys[0]];
        reply(200, result);
      }
      try {
        dispatch(data, done);
      } catch (e) {
        done(e);
      }
    });
  });
  server.on('error', function (error) {
    log(error.message);
  });
  server.listen(4796, '127.0.0.1', function () {
    log('Listening on loopback');
  });
}
start();
module.exports = {
  onStart: start,
  onRequest: start,
  onStop: function () {
    if (server) server.close();
  }
};
