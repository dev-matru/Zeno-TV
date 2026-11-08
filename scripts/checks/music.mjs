// The music service: catalogue rules, links to pages and files, Range playback,
// the page for the phone, and the guard against private addresses.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const music = require('../../app/service/music.js');
const catalog = require('../../app/src/home/music-catalog.js');
const qr = require('../../app/src/ui/qr.js');

const root = mkdtempSync(join(tmpdir(), 'zeno-music-'));
const audio = Buffer.concat([
  Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000'),
  Buffer.alloc(40000, 7)
]);
const site = http.createServer((req, res) => {
  req.url = req.url.split('?')[0];
  if (req.url === '/song.mp3') {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length });
    res.end(audio);
  } else if (req.url === '/moved') {
    res.writeHead(302, { Location: '/song.mp3' });
    res.end();
  } else if (req.url === '/track') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<html><head><title>Ignored</title><meta property="og:title" content="Quiet &amp; Slow">' +
        '<meta property="og:audio" content="/moved"></head>' +
        '<body><a href="https://creativecommons.org/licenses/by/4.0/">CC</a></body></html>'
    );
  } else if (req.url === '/text') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body>No music here</body></html>');
  } else if (req.url === '/fake.mp3') {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
    res.end('<html>not audio</html>');
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => site.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + site.address().port;
const lanPort = 47000 + Math.floor(Math.random() * 900);
music.configure({ root, allowPrivate: true, port: lanPort });

const wait = async (test, label) => {
  for (let i = 0; i < 200; i++) {
    if (test()) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw Error('Timed out: ' + label);
};
const request = (url, options = {}, body) =>
  new Promise((resolve, reject) => {
    const req = http.request(url, options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })
      );
    });
    req.on('error', reject);
    req.end(body);
  });

try {
  // Catalogue: unique ids that the service accepts, free licences only, https sources.
  const ids = new Set();
  for (const e of catalog) {
    assert.match(e.id, /^[a-z]{2}-[a-z0-9-]{1,48}$/);
    assert.ok(!ids.has(e.id), 'duplicate ' + e.id);
    ids.add(e.id);
    assert.ok(['CC0', 'CC BY 4.0'].includes(e.license), e.id + ' licence');
    assert.match(e.file, /^https:\/\//);
    assert.match(e.page, /^https:\/\//);
    assert.ok(e.title && e.artist && e.seconds > 0 && e.bytes > 0 && e.bytes < 150e6, e.id);
    assert.ok(['music', 'nature'].includes(e.kind));
  }
  assert.throws(() => music.fetch('xx-unknown'), /Brano non valido/);

  // Formats are recognised from their first bytes, not from the name.
  assert.equal(music.sniff(audio), 'mp3');
  assert.equal(music.sniff(Buffer.from('\u0000\u0000\u0000 ftypM4A \u0000\u0000')), 'm4a');
  assert.equal(music.sniff(Buffer.from('OggS\u0000\u0002\u0000\u0000\u0000\u0000\u0000\u0000')), 'ogg');
  assert.equal(music.sniff(Buffer.from('<!doctype html><html>')), null);

  // Freesound puts its own address in front of the CDN one; the HQ preview is used.
  const page = music.readPage(
    '<meta property="og:audio" content="https://freesound.orghttps://cdn.freesound.org/previews/868/868984_1661766-lq.mp3">' +
      '<meta property="og:title" content="Quiet night">',
    'https://freesound.org/s/868984/'
  );
  assert.equal(page.url, 'https://cdn.freesound.org/previews/868/868984_1661766-hq.mp3');
  assert.equal(page.title, 'Quiet night');

  // A page that names its audio, through a redirect.
  const job = music.addLink(base + '/track');
  await wait(() => music.state().tracks.some(t => t.id === job.id), 'page link');
  const track = music.state().tracks.find(t => t.id === job.id);
  assert.equal(track.title, 'Quiet & Slow');
  assert.equal(track.license, 'CC BY 4.0');
  assert.equal(track.ext, 'mp3');
  assert.equal(track.bytes, audio.length);
  assert.deepEqual(readFileSync(join(root, track.id + '.mp3')), audio);
  assert.equal(music.addLink(base + '/track').state, 'done', 'the same link is not downloaded twice');

  // A direct file link.
  const direct = music.addLink(base + '/song.mp3');
  await wait(() => music.state().tracks.some(t => t.id === direct.id), 'file link');

  // Pages without audio and files that are not audio are refused.
  const none = music.addLink(base + '/text');
  const fake = music.addLink(base + '/fake.mp3');
  await wait(() => music.state().jobs.filter(j => j.state === 'error').length === 2, 'refusals');
  const errors = music.state().jobs.map(j => j.error);
  assert.ok(errors.some(e => /non ho trovato/.test(e)));
  assert.ok(errors.some(e => /non porta a un file audio/.test(e)));
  assert.ok(![none.id, fake.id].some(id => music.state().tracks.some(t => t.id === id)));
  assert.throws(() => music.addLink('ftp://example.com/a.mp3'), /http/);

  // Playback with Range, as the TV's player asks for it.
  const player = http.createServer((req, res) => {
    if (!music.serve(req.url, req, res)) {
      res.writeHead(400);
      res.end();
    }
  });
  await new Promise(r => player.listen(0, '127.0.0.1', r));
  const tv = 'http://127.0.0.1:' + player.address().port;
  const ranged = await request(tv + '/music/' + track.id + '.mp3', { headers: { Range: 'bytes=100-199' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers['content-range'], 'bytes 100-199/' + audio.length);
  assert.equal(ranged.headers['content-type'], 'audio/mpeg');
  assert.deepEqual(ranged.body, audio.subarray(100, 200));
  const full = await request(tv + '/music/' + track.id + '.mp3');
  assert.equal(full.status, 200);
  assert.equal(full.body.length, audio.length);
  assert.equal((await request(tv + '/music/ln-000000000000.mp3')).status, 404);
  assert.equal((await request(tv + '/music/' + track.id + '.ogg')).status, 404);
  assert.equal((await request(tv + '/music/..%2Flibrary.json')).status, 400);
  player.close();

  // The phone page: only with the key in the QR code.
  await new Promise((resolve, reject) => music.openImport('192.168.1.53', e => (e ? reject(e) : resolve())));
  const info = music.state().import;
  assert.match(info.url, new RegExp('^http://192\\.168\\.1\\.53:' + lanPort + '/\\?k=[a-f0-9]{24}$'));
  assert.ok(qr.matrix(info.url).length >= 21);
  const local = 'http://127.0.0.1:' + lanPort;
  const key = info.url.split('?k=')[1];
  assert.equal((await request(local + '/')).status, 403);
  assert.equal((await request(local + '/?k=' + 'a'.repeat(24))).status, 403);
  const form = await request(local + '/?k=' + key);
  assert.equal(form.status, 200);
  assert.match(form.body.toString(), /Aggiungi un brano/);
  const added = await request(
    local + '/add?k=' + key,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ url: base + '/song.mp3?again' })
  );
  assert.equal(added.status, 200);
  const addedId = JSON.parse(added.body).id;
  await wait(() => music.state().tracks.some(t => t.id === addedId), 'phone link');
  const status = JSON.parse((await request(local + '/status?k=' + key)).body);
  assert.deepEqual(
    status.tracks.map(t => t.state),
    ['done']
  );
  const bad = await request(
    local + '/add?k=' + key,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    JSON.stringify({ url: 'not a link' })
  );
  assert.equal(bad.status, 400);
  music.closeImport();
  assert.equal(music.state().import, null);
  await assert.rejects(request(local + '/?k=' + key));

  // Removing a track deletes its file.
  music.remove(direct.id);
  assert.ok(!music.state().tracks.some(t => t.id === direct.id));
  assert.throws(() => readFileSync(join(root, direct.id + '.mp3')));

  // Without the test switch, the home network and the TV itself are off limits.
  music.configure({ root, allowPrivate: false });
  const local2 = music.addLink(base + '/song.mp3?private');
  await wait(() => music.state().jobs.some(j => j.id === local2.id && j.state === 'error'), 'private');
  assert.equal(music.state().jobs.find(j => j.id === local2.id).error, 'Indirizzo non consentito.');
  assert.ok(
    music.state().tracks.some(t => t.id === track.id),
    'the library is read back from disk'
  );

  console.log('Music service: catalogue, links, playback, phone page and network guard are valid.');
} finally {
  music.closeImport();
  site.close();
  rmSync(root, { recursive: true, force: true });
}
