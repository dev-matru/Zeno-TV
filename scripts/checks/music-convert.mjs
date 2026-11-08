// Files from the phone: upload to the service, then the TV app compresses WAV and AIFF
// to Ogg Opus with WebCodecs. The conversion runs in Chromium, as on the TV, and the
// result is decoded again to check its length.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const music = require('../../app/service/music.js');
const convert = require('../../app/src/home/music-convert.js');
const appRoot = new URL('../../app/', import.meta.url);

/* A test tone: `seconds` of a 440 Hz sine, in the requested sample layout. */
function tone({ seconds, rate, channels, bits, aiff = false, float = false }) {
  const frames = Math.round(seconds * rate),
    step = bits / 8,
    data = Buffer.alloc(frames * channels * step);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      const v = 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate + c),
        at = (i * channels + c) * step;
      if (float) data.writeFloatLE(v, at);
      else if (bits === 16)
        aiff ? data.writeInt16BE(Math.round(v * 32767), at) : data.writeInt16LE(Math.round(v * 32767), at);
      else if (bits === 24) {
        const x = Math.round(v * 8388607);
        aiff ? data.writeIntBE(x, at, 3) : data.writeIntLE(x, at, 3);
      }
    }
  if (aiff) {
    const comm = Buffer.alloc(26);
    comm.write('COMM', 0);
    comm.writeUInt32BE(18, 4);
    comm.writeUInt16BE(channels, 8);
    comm.writeUInt32BE(frames, 10);
    comm.writeUInt16BE(bits, 14);
    // 80-bit extended sample rate
    let e = 16383 + 31,
      m = rate;
    while (!(m & 0x80000000)) {
      m = (m << 1) >>> 0;
      e--;
    }
    comm.writeUInt16BE(e, 16);
    comm.writeUInt32BE(m, 18);
    const ssnd = Buffer.alloc(16);
    ssnd.write('SSND', 0);
    ssnd.writeUInt32BE(8 + data.length, 4);
    const head = Buffer.alloc(12);
    head.write('FORM', 0);
    head.writeUInt32BE(4 + comm.length + ssnd.length + data.length, 4);
    head.write('AIFF', 8);
    return Buffer.concat([head, comm, ssnd, data]);
  }
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0);
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(float ? 3 : 1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * channels * step, 16);
  fmt.writeUInt16LE(channels * step, 20);
  fmt.writeUInt16LE(bits, 22);
  const list = Buffer.alloc(8 + 26);
  list.write('LIST', 0);
  list.writeUInt32LE(26, 4);
  const dataHead = Buffer.alloc(8);
  dataHead.write('data', 0);
  dataHead.writeUInt32LE(data.length, 4);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0);
  head.writeUInt32LE(4 + fmt.length + list.length + 8 + data.length, 4);
  head.write('WAVE', 8);
  return Buffer.concat([head, fmt, list, dataHead, data]);
}

const cases = [
  { name: 'WAV 16-bit stereo 44.1 kHz', seconds: 3, rate: 44100, channels: 2, bits: 16 },
  { name: 'WAV 24-bit mono 48 kHz', seconds: 2.5, rate: 48000, channels: 1, bits: 24 },
  { name: 'WAV float 6 channels 96 kHz', seconds: 1.5, rate: 96000, channels: 6, bits: 32, float: true },
  { name: 'AIFF 16-bit stereo 44.1 kHz', seconds: 2, rate: 44100, channels: 2, bits: 16, aiff: true }
];

// Headers and samples, without a browser.
for (const c of cases) {
  const file = tone(c),
    h = convert.header(new Uint8Array(file), file.length);
  assert.equal(h.sampleRate, c.rate, c.name + ' rate');
  assert.equal(h.channels, c.channels, c.name + ' channels');
  assert.equal(h.length / h.frameBytes, Math.round(c.seconds * c.rate), c.name + ' frames');
  const s = convert.samples(new Uint8Array(file.subarray(h.start, h.start + h.frameBytes * 100)), h);
  assert.equal(s.frames, 100);
  const expected = 0.5 * Math.sin((2 * Math.PI * 440 * 10) / c.rate);
  assert.ok(Math.abs(s.data[10] - expected) < 0.001, c.name + ' sample value');
}
assert.throws(
  () => convert.header(new Uint8Array(Buffer.from('ID3 not raw audio at all'))),
  /non convertibile/
);

const root = mkdtempSync(join(tmpdir(), 'zeno-convert-'));
const lanPort = 48000 + Math.floor(Math.random() * 900);
music.configure({ root, allowPrivate: true, port: lanPort });
const request = (url, options = {}, body) =>
  new Promise((resolve, reject) => {
    const req = http.request(url, options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end(body);
  });

// The service side of the TV, reduced to what the app uses here.
const tv = http.createServer((req, res) => {
  const route = req.url.split('?')[0],
    convert = /^\/music-convert\/([a-z0-9-]+)$/.exec(route);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }
  if (convert)
    return music.replace(convert[1], req, (error, value) => {
      res.writeHead(error ? 400 : 200, { 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(error ? { error: error.message } : value));
    });
  if (route === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><script src="/convert.js"></script>');
  }
  if (route === '/convert.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(readFileSync(new URL('src/home/music-convert.js', appRoot)));
  }
  if (!music.serve(route, req, res)) {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => tv.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + tv.address().port;
const browser = await chromium.launch();

try {
  // Upload from the phone page: only with the key, only audio.
  await new Promise((resolve, reject) => music.openImport('192.168.1.53', e => (e ? reject(e) : resolve())));
  const key = music.state().import.url.split('?k=')[1];
  const phone = 'http://127.0.0.1:' + lanPort;
  const page0 = (await request(phone + '/?k=' + key)).body.toString();
  assert.match(page0, /type="file"/);
  assert.equal((await request(phone + '/upload?k=bad&name=a.wav', { method: 'POST' }, 'x')).status, 403);
  const notAudio = await request(
    phone + '/upload?k=' + key + '&name=notes.txt',
    { method: 'POST' },
    Buffer.from('just some text, not audio at all')
  );
  assert.equal(notAudio.status, 400);
  assert.match(JSON.parse(notAudio.body).error, /non è audio/);

  const page = await browser.newPage();
  await page.goto(base + '/');
  assert.ok(await page.evaluate(() => ZenoConvert.available()), 'Chromium offers an Opus encoder');

  for (const c of cases) {
    const file = tone(c);
    const sent = await request(
      phone + '/upload?k=' + key + '&name=' + encodeURIComponent(c.name + (c.aiff ? '.aiff' : '.wav')),
      { method: 'POST', headers: { 'Content-Length': file.length } },
      file
    );
    assert.equal(sent.status, 200, c.name + ' upload');
    const id = JSON.parse(sent.body).id;
    const before = { ...music.state().tracks.find(t => t.id === id) };
    assert.equal(before.ext, c.aiff ? 'aiff' : 'wav');
    assert.equal(before.origin, 'upload');
    assert.equal(before.title, c.name);

    // What src/home/music.js does on the TV.
    const result = await page.evaluate(
      ({ url, target }) =>
        new Promise(resolve => {
          let steps = 0;
          ZenoConvert.run(
            url,
            () => steps++,
            (error, blob) => {
              if (error) return resolve({ error: error.message });
              fetch(target, { method: 'POST', headers: { 'Content-Type': 'audio/ogg' }, body: blob })
                .then(r => r.json())
                .then(value => resolve({ size: blob.size, steps, value }));
            }
          );
        }),
      { url: base + '/music/' + id + '.' + before.ext, target: base + '/music-convert/' + id }
    );
    assert.ok(!result.error, c.name + ': ' + result.error);
    const after = music.state().tracks.find(t => t.id === id);
    assert.equal(after.ext, 'ogg', c.name + ' becomes Ogg');
    assert.ok(after.bytes < file.length / 3, c.name + ' is smaller: ' + after.bytes + ' < ' + file.length);
    assert.throws(() => readFileSync(join(root, id + '.' + before.ext)), c.name + ' original removed');

    // The Ogg file decodes, with the right length and channels.
    const decoded = await page.evaluate(
      async url => {
        const bytes = await (await fetch(url)).arrayBuffer();
        const audio = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes);
        let peak = 0;
        const d = audio.getChannelData(0);
        for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
        return { duration: audio.duration, channels: audio.numberOfChannels, peak };
      },
      base + '/music/' + id + '.ogg'
    );
    assert.ok(Math.abs(decoded.duration - c.seconds) < 0.05, c.name + ' duration ' + decoded.duration);
    assert.equal(decoded.channels, Math.min(2, c.channels), c.name + ' channels');
    assert.ok(decoded.peak > 0.3 && decoded.peak < 0.7, c.name + ' level ' + decoded.peak);
  }

  // Only uncompressed tracks are replaced, and only by Ogg.
  const mp3 = Buffer.concat([
    Buffer.from('ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000'),
    Buffer.alloc(5000, 7)
  ]);
  const mp3Id = JSON.parse(
    (await request(phone + '/upload?k=' + key + '&name=song.mp3', { method: 'POST' }, mp3)).body
  ).id;
  assert.equal(music.state().tracks.find(t => t.id === mp3Id).ext, 'mp3');
  assert.equal((await request(base + '/music-convert/' + mp3Id, { method: 'POST' }, mp3)).status, 400);

  console.log(
    'Phone uploads: ' + cases.length + ' WAV and AIFF layouts compressed to Ogg Opus and decoded again.'
  );
} finally {
  music.closeImport();
  await browser.close();
  tv.close();
  rmSync(root, { recursive: true, force: true });
}
