import assert from 'node:assert/strict';
import vm from 'node:vm';
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
let receive,
  statusRequests = 0;
vm.runInNewContext(
  readFileSync(new URL('../../app/service/index.js', import.meta.url), 'utf8').replace(
    "token: '' /* LOCAL_TOKEN */",
    "token: 'qa-local'"
  ),
  {
    Buffer,
    process: { getuid: () => 5001, on() {} },
    module: { exports: {} },
    setTimeout,
    clearTimeout,
    require(name) {
      if (name === './wallpapers') return { prepare() {}, image() {} };
      if (name === './music') return { serve: () => false, state: () => ({}) };
      if (name === 'dgram') return dgram;
      if (name === 'http')
        return {
          createServer(fn) {
            receive = fn;
            return {
              on() {},
              listen(port, host) {
                assert.equal(host, '127.0.0.1');
                assert.equal(port, 4796);
              }
            };
          },
          get(url, callback) {
            assert.equal(url, 'http://127.0.0.1:8001/api/v2/');
            statusRequests++;
            const request = new EventEmitter();
            request.setTimeout = () => {};
            setTimeout(() => {
              const response = new EventEmitter();
              callback(response);
              response.emit(
                'data',
                JSON.stringify({ device: { developerIP: '192.0.2.11', developerMode: '1' } })
              );
              response.emit('end');
            }, 0);
            return request;
          }
        };
      if (name === 'fs')
        return {
          writeFileSync() {},
          readFileSync(path) {
            assert.equal(path, '/proc/123/status');
            return 'Name: player\nVmRSS: 22528 kB\n';
          }
        };
      throw Error('Unexpected module ' + name);
    }
  }
);
let id = 0;
const rpc = (data, headers = {}) =>
  new Promise(resolve => {
    const request = new EventEmitter();
    request.method = 'POST';
    request.url = '/command';
    request.headers = {
      host: '127.0.0.1:4796',
      origin: 'file://',
      authorization: 'Bearer qa-local',
      ...headers
    };
    request.destroy = () => {};
    let status;
    receive(request, {
      writeHead(code) {
        status = code;
      },
      end(text) {
        resolve({ status, ...JSON.parse(text) });
      }
    });
    request.emit('data', JSON.stringify({ id: 'test-' + ++id, ...data }));
    request.emit('end');
  });
const socket = dgram.createSocket('udp4');
await new Promise(resolve => socket.bind(0, '127.0.0.1', resolve));
try {
  const received = new Promise(resolve => socket.once('message', resolve));
  const r = await rpc({
    op: 'wol',
    mac: '00:11:22:33:44:55',
    broadcast: '127.0.0.1',
    port: socket.address().port
  });
  assert.equal(r.error, null);
  const packet = await received;
  assert.equal(packet.length, 102);
  assert.deepEqual([...packet.subarray(0, 6)], [255, 255, 255, 255, 255, 255]);
  for (let i = 0; i < 16; i++)
    assert.equal(packet.subarray(6 + i * 6, 12 + i * 6).toString('hex'), '001122334455');
  console.log('PASS real UDP output uses correct magic-packet bytes');
  assert.ok((await rpc({ op: 'wol', mac: 'invalid', broadcast: '127.0.0.1', port: 9 })).error);
  console.log('PASS invalid configuration cannot send WoL');
  assert.equal((await rpc({ op: 'status' }, { authorization: 'Bearer wrong' })).status, 403);
  assert.equal((await rpc({ op: 'status' }, { origin: 'https://external.example' })).status, 403);
  assert.equal(statusRequests, 0);
  console.log('PASS wrong tokens and web origins cannot invoke commands');
  const memory = await rpc({ op: 'app-memory', appId: 'com.samsung.tv.cobalt-yt', pid: 123 });
  assert.equal(memory.value.bytes, 23068672);
  assert.ok((await rpc({ op: 'app-memory', appId: 'com.samsung.tv.cobalt-yt', pid: '../../etc' })).error);
  console.log('PASS process memory reads a fixed validated status path');
  const status = await rpc({ op: 'status' });
  assert.equal(status.value.ip, '192.0.2.11');
  assert.equal(status.value.enabled, true);
  assert.equal(status.value.canWrite, false);
  assert.ok((await rpc({ op: 'developer', enabled: false, ip: '127.0.0.1' })).error);
  console.log('PASS developer status is read-only and unsupported writes are rejected');
  await rpc({ op: 'status', id: 'status-fixed' });
  const count = statusRequests;
  await rpc({ op: 'status', id: 'status-fixed' });
  assert.equal(statusRequests, count);
  console.log('PASS repeated request IDs do not duplicate commands');
} finally {
  socket.close();
}
