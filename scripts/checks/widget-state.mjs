import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
let passed = 0;
function check(name, value) {
  assert.ok(value, name);
  passed++;
  console.log('PASS ' + name);
}
function fixture(saved, cache) {
  const store = {
      'zeno.extras.v1': JSON.stringify(saved || {}),
      'zeno.weather.v1': JSON.stringify(cache || null)
    },
    listeners = {},
    requests = [],
    timers = new Map(),
    registered = new Set();
  let time = 1792978000000,
    id = 0,
    storageFail = false,
    registerFail = false;
  const document = {
    hidden: false,
    documentElement: { classList: { toggle() {} } },
    getElementById() {
      return { classList: { toggle() {} } };
    },
    dispatchEvent(e) {
      (listeners[e.type] || []).forEach(f => f(e));
    },
    addEventListener(type, f) {
      (listeners[type] || (listeners[type] = [])).push(f);
    }
  };
  const ctx = {
    document,
    Date: { now: () => time },
    Event: function (type) {
      this.type = type;
    },
    setTimeout(fn, delay) {
      timers.set(++id, { fn, delay });
      return id;
    },
    clearTimeout(i) {
      timers.delete(i);
    },
    localStorage: {
      getItem(k) {
        return store[k] || null;
      },
      setItem(k, v) {
        if (storageFail) throw Error('Storage full');
        store[k] = v;
      }
    },
    XMLHttpRequest: function () {
      this.open = (method, url) => {
        this.url = url;
      };
      this.send = () => requests.push(this);
      this.abort = () => {
        this.aborted = true;
      };
    },
    ZenoI18n: { t: s => s },
    matchMedia: () => ({ matches: false }),
    tizen: {
      tvinputdevice: {
        getSupportedKeys() {
          return [
            { name: 'Info', code: 457 },
            { name: 'ColorF0Red', code: 403 }
          ];
        },
        registerKey(n) {
          if (registerFail) throw Error('Denied');
          registered.add(n);
        },
        unregisterKey(n) {
          registered.delete(n);
        }
      }
    }
  };
  ctx.window = ctx;
  ctx.addEventListener = document.addEventListener.bind(document);
  vm.createContext(ctx);
  return {
    ctx,
    document,
    requests,
    timers,
    registered,
    load(file) {
      vm.runInContext(readFileSync('app/' + file, 'utf8'), ctx);
    },
    advance(ms) {
      time += ms;
    },
    failStorage(v) {
      storageFail = v;
    },
    failRegister(v) {
      registerFail = v;
    },
    reply(i, data, status = 200) {
      var r = requests[i];
      r.status = status;
      r.responseText = JSON.stringify(data);
      r.onload();
    },
    fire(type, code) {
      var prevented = false;
      document.dispatchEvent({
        type,
        keyCode: code,
        preventDefault() {
          prevented = true;
        }
      });
      return prevented;
    },
    store
  };
}
const at = 1792978000000,
  cache = { mode: 'auto', placeKey: '', name: 'Roma', temperature: 17, code: 0, isDay: true, at };
let f = fixture({ location: 'off', motion: true }, cache);
f.load('src/home/extras.js');
check(
  'Legacy weather-off migrates to separate visibility toggle',
  !f.ctx.ZenoExtras.config().enabled && f.ctx.ZenoExtras.config().location === 'auto'
);
f = fixture({ location: 'milano', motion: true }, null);
f.load('src/home/extras.js');
check(
  'Existing selected city and movement survive migration',
  f.ctx.ZenoExtras.config().location === 'milano' &&
    f.ctx.ZenoExtras.config().motion &&
    f.ctx.ZenoExtras.config().interval === '30'
);
f = fixture({}, cache);
f.load('src/home/extras.js');
let x = f.ctx.ZenoExtras;
x.refresh();
check(
  'Fresh weather is reused without requests',
  f.requests.length === 0 && [...f.timers.values()].some(t => t.delay === 1800000)
);
f.advance(1800000);
x.refresh();
check('Default policy refreshes at thirty minutes', f.requests.length === 1);
f.reply(0, { city: 'Rome', latitude: 41.9, longitude: 12.5 });
f.reply(1, { current: { temperature_2m: 18, weather_code: 3 } });
check(
  'Successful refresh updates and schedules the next interval',
  x.data().temperature === 18 && [...f.timers.values()].some(t => t.delay === 1800000)
);
x.set('interval', '60');
check(
  'Hourly policy uses remaining cache age',
  f.requests.length === 2 && [...f.timers.values()].some(t => t.delay === 3600000)
);
x.set('interval', 'home');
check('Home-return policy has no periodic fetch timer', ![...f.timers.values()].some(t => t.delay >= 600000));
x.home();
check('Repeated Home entries reuse weather for ten minutes', f.requests.length === 2);
f.advance(600000);
x.home();
check('A later Home return fetches once', f.requests.length === 3);
f.reply(2, null);
check('Malformed IP response fails safely', x.status() === 'Meteo non disponibile');
x.set('enabled', false);
x.refresh(true);
check('Disabled widget never fetches', f.requests.length === 3 && !x.data());
f.failStorage(true);
check('Failed preference write is atomic', !x.set('enabled', true) && !x.config().enabled);
f.failStorage(false);
x.set('place', { name: 'London', lat: 51.5, lon: -0.1 });
check(
  'Choosing a location preserves an independently disabled widget',
  !x.config().enabled && x.config().place.name === 'London'
);
f = fixture({}, cache);
f.load('src/home/extras.js');
x = f.ctx.ZenoExtras;
f.document.hidden = true;
f.advance(3600000);
x.refresh(true);
check('Hidden launcher suspends weather requests', f.requests.length === 0);
f.document.hidden = false;
x.refresh(true);
f.reply(0, { city: 'Rome', latitude: 41.9, longitude: 12.5 });
f.reply(1, null);
check(
  'Malformed forecast retries in five minutes',
  x.status() === 'Meteo non disponibile' && [...f.timers.values()].some(t => t.delay === 300000)
);
f = fixture({}, cache);
f.load('src/home/extras.js');
x = f.ctx.ZenoExtras;
x.refresh(true);
x.set('place', { name: 'London', lat: 51.5, lon: -0.1 });
f.reply(1, { current: { temperature_2m: 12, weather_code: 2 } });
f.reply(0, { city: 'Rome', latitude: 41.9, longitude: 12.5 });
check(
  'An old location response cannot overwrite a newer choice',
  x.data().name === 'London' && f.requests.length === 2
);
f.advance(10800000);
check('Weather older than three hours is not presented as current', !x.data());
f = fixture({}, null);
f.load('src/home/extras.js');
x = f.ctx.ZenoExtras;
let result;
x.search('Rome', 'it', (e, v) => {
  result = v;
});
f.reply(0, {
  results: [{ name: 'Roma', latitude: 41.9, longitude: 12.5, admin1: 'Lazio', country: 'Italia' }]
});
x.search('Rome', 'it', (e, v) => {
  result = v;
});
check(
  'Repeated city searches reuse a bounded result cache',
  f.requests.length === 1 && result[0].region === 'Lazio · Italia'
);
let called = false;
let cancel = x.search('Berlin', 'de', () => {
  called = true;
});
cancel();
f.reply(1, { results: [] });
check('Canceled searches cannot mutate a closed menu', !called && f.requests[1].aborted);
f = fixture();
f.load('src/core/remote-keys.js');
let actions = [];
const r = f.ctx.ZenoRemote;
r.listen(a => actions.push(a));
check(
  'Branded buttons and microphone cannot be falsely registered',
  !r.set('DisneyPlus', 'home') && !r.set('Voice', 'home') && f.registered.size === 0
);
check('A supported shortcut can be registered', r.set('Info', 'home') && f.registered.has('Info'));
f.fire('keydown', 457);
f.fire('keydown', 457);
f.fire('keyup', 457);
check('Holding a shortcut fires once per press', actions.length === 1);
f.document.hidden = true;
f.fire('keydown', 457);
check('Shortcuts never fire in the background', actions.length === 1);
f.document.hidden = false;
f.failStorage(true);
check(
  'Failed shortcut save rolls back key registration',
  !r.set('ColorF0Red', 'settings') && !f.registered.has('ColorF0Red') && !r.mapping('ColorF0Red')
);
f.failStorage(false);
f.failRegister(true);
check(
  'Rejected registration does not save an inactive mapping',
  !r.set('ColorF0Red', 'settings') && !r.mapping('ColorF0Red')
);
f.failRegister(false);
check(
  'Original key action is restored by unregistering',
  r.set('Info', 'default') && !f.registered.size && !r.mapping('Info')
);
console.log(passed + ' widget state checks passed.');
