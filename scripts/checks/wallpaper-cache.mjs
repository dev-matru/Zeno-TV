import assert from 'node:assert/strict';
import vm from 'node:vm';
import http from 'node:http';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const catalogue = ['a', 'b', 'c', 'd'].map((n, i) => ({
  id: 'test-' + String(i).repeat(16),
  name: 'Test ' + n,
  source: 'https://example.com/wallpapers/' + n + '.jpg',
  thumb: '',
  download: true,
  format: i === 0 ? 'png' : 'jpg'
}));
const ids = catalogue.slice(0, 4).map(e => e.id);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zeno-wallpaper-')),
  cache = path.join(directory, 'cache');
let transfers = 0,
  badImage = false;
const server = http.createServer((req, res) => {
  transfers++;
  const png = new URL(req.url, 'http://localhost').searchParams.get('output') === 'png';
  const bytes = png
    ? Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(16)])
    : Buffer.from([255, 216, 255, 217]);
  res.setHeader('Content-Type', png ? 'image/png' : 'image/jpeg');
  res.end(badImage ? Buffer.from('bad') : bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const module = { exports: {} };
vm.runInNewContext(
  fs
    .readFileSync(new URL('../../app/service/wallpapers.js', import.meta.url), 'utf8')
    .replace("'/home/owner/share/zeno-tv-wallpapers'", JSON.stringify(cache)),
  {
    module,
    Buffer,
    Date,
    require(name) {
      return name === 'fs'
        ? fs
        : name === './online-wallpapers.json'
          ? { entries: catalogue }
          : name === 'https'
            ? {
                get(url, cb) {
                  assert.ok(url.startsWith('https://wsrv.nl/?url=https%3A%2F%2Fexample.com%2Fwallpapers%2F'));
                  return http.get('http://127.0.0.1:' + server.address().port + new URL(url).search, cb);
                }
              }
            : null;
    }
  }
);
const prepare = (wall, height = 1080) =>
  new Promise((resolve, reject) =>
    module.exports.prepare({ wall, height }, null, (e, v) => (e ? reject(e) : resolve(v)))
  );
try {
  await assert.rejects(prepare('../escape'));
  assert.equal(transfers, 0);
  console.log('PASS invalid wallpaper IDs cannot reach the network or filesystem');
  await prepare(ids[0]);
  assert.equal(transfers, 6);
  await prepare(ids[0]);
  assert.equal(transfers, 6);
  console.log('PASS a cached selection does not download again');
  for (const id of ids.slice(1)) await prepare(id);
  assert.equal(fs.readdirSync(cache).length, 3);
  assert.ok(!fs.existsSync(path.join(cache, ids[0] + '-1080')));
  console.log('PASS cache retains at most three downloaded sets');
  await assert.rejects(prepare(ids[0], 720));
  badImage = true;
  await assert.rejects(prepare(ids[0], 1080));
  assert.ok(!fs.existsSync(path.join(cache, ids[0] + '-1080')));
  console.log('PASS malformed images cannot become a cached wallpaper');
  await new Promise(resolve => server.close(resolve));
  await prepare(ids[3]);
  console.log('PASS a cached wallpaper works without any network connection');
  const before = module.exports.info();
  assert.ok(before.bytes > 0);
  module.exports.clear(ids[3]);
  assert.equal(module.exports.info().sets, 1);
  await prepare(ids[3]);
  console.log('PASS cache cleanup preserves the applied wallpaper');
} finally {
  server.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
