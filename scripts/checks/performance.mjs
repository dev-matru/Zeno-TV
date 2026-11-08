// Performance audit of the real Home in Chromium with the CPU slowed down 4×.
//
// It drives each screen with the remote keys and measures how long each key's
// handler takes, the gaps between painted frames, memory after repeated wallpaper
// changes and which images get fetched. A slowed-down desktop browser is a way to
// catch regressions, not a model of the TV's processor or GPU; budgets are generous
// on purpose. Report: .local/qa/performance/production-performance.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';

const BUDGET = {
  keyP95: 50,
  keyMax: 120,
  frameMax: 250,
  wallpaperLoad: 4000,
  heapGrowth: 2 * 1024 * 1024,
  domGrowth: 40
};
const FRAME_60HZ = 16.7,
  KEY_GAP = 55,
  SETTLE = 240;

/* Fake TV app inventory: a few named apps plus fourteen generic ones. */
function installFakeTV() {
  const apps = [
    ['QaLibrary0.Library', 'Library'],
    ['DemoApps02.Cinema', 'Cinema'],
    ['DemoApps04.Kids', 'Kids'],
    ['DemoApps12.Videos', 'Videos'],
    ['DemoApps06.Music', 'Music'],
    ['DemoApps10.Series', 'Series'],
    ['TestApp001.Alpha', 'Alpha'],
    ['TestApp002.Beta', 'Beta'],
    ['TestApp003.Gamma', 'Gamma']
  ].map(([id, name]) => ({ id, name, show: true, iconPath: '' }));
  for (let n = 1; n <= 14; n++)
    apps.push({
      id: 'Qa12345678.Stream' + (n - 1),
      name: 'Streaming app ' + String(n).padStart(2, '0'),
      show: true,
      iconPath: ''
    });
  window.tizen = {
    application: {
      getAppsInfo: done => setTimeout(() => done(apps), 0),
      launch: (id, done) => setTimeout(done, 0)
    }
  };
  localStorage.setItem(
    'zeno.home.v1',
    JSON.stringify({
      dock: [
        'QaLibrary0.Library',
        'DemoApps02.Cinema',
        'DemoApps04.Kids',
        'DemoApps12.Videos',
        'DemoApps06.Music',
        'DemoApps10.Series'
      ],
      wallpaper: 'misty',
      mode: 'fixed',
      theme: 'shore',
      lastApp: 'DemoApps02.Cinema'
    })
  );
}

/* In page: presses keys at a steady pace while timing each handler and every frame. */
async function pressAndTime({ keys, rounds, gap, settle }) {
  const keyMs = [],
    frameGaps = [],
    longTasks = [];
  let last = null,
    running = true;
  const onFrame = t => {
    if (last !== null) frameGaps.push(t - last);
    last = t;
    if (running) requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);
  let observer = null;
  try {
    observer = new PerformanceObserver(list => {
      for (const e of list.getEntries()) longTasks.push({ start: e.startTime, duration: e.duration });
    });
    observer.observe({ type: 'longtask' });
  } catch (e) {
    observer = null;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (let i = 0; i < rounds; i++) {
    for (const key of keys) {
      const t0 = performance.now();
      ZenoQA.nav(key);
      keyMs.push(performance.now() - t0);
      await wait(gap);
    }
  }
  await wait(settle);
  running = false;
  if (observer) observer.disconnect();
  return { keyMs, frameGaps, longTasks, where: ZenoQA.where() };
}

const p = (list, q) =>
  list.length ? [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * q))] : 0;
const report = {
  scope:
    'Public Home in headless Chromium at 1920×1080 with 4× CPU throttling and a fake app inventory. Not a TV measurement.',
  budgets: BUDGET,
  checks: [],
  failures: [],
  warnings: [],
  scenarios: [],
  errors: []
};
function check(name, ok, detail) {
  report.checks.push({ name, passed: !!ok, detail });
  if (!ok) report.failures.push({ name, detail });
}

let preview,
  page,
  cdp,
  layers = [];
const perf = async () =>
  Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const qa = (method, ...args) => page.evaluate(([m, a]) => ZenoQA[m](...a), [method, args]);
const ready = () => page.waitForFunction(() => window.ZenoQA && ZenoQA.ready(), null, { timeout: 15000 });
const look = async patch => {
  await qa('look', patch);
  await ready();
  await page.waitForTimeout(230);
};
const scene = async name => {
  await qa('scene', name);
  await page.waitForFunction(() => !ZenoQA.state().catalog.loading);
  await page.waitForTimeout(230);
};

async function scenario(name, keys, rounds = 4) {
  const before = await perf();
  const run = await page.evaluate(pressAndTime, { keys, rounds, gap: KEY_GAP, settle: SETTLE });
  const after = await perf();
  const ms = metric => (after[metric] - before[metric]) * 1000;
  const result = {
    name,
    presses: run.keyMs.length,
    keyP50: p(run.keyMs, 0.5),
    keyP95: p(run.keyMs, 0.95),
    keyMax: Math.max(...run.keyMs),
    frameP95: p(run.frameGaps, 0.95),
    frameMax: Math.max(...run.frameGaps),
    longTasks: run.longTasks,
    taskMs: ms('TaskDuration'),
    scriptMs: ms('ScriptDuration'),
    layoutMs: ms('LayoutDuration'),
    styleMs: ms('RecalcStyleDuration'),
    focus: run.where
  };
  report.scenarios.push(result);
  check(
    name + ': key handling within budget',
    result.keyP95 < BUDGET.keyP95 && result.keyMax < BUDGET.keyMax,
    { p95: result.keyP95, max: result.keyMax }
  );
  check(name + ': no long stall between frames', result.frameMax < BUDGET.frameMax, {
    p95: result.frameP95,
    max: result.frameMax
  });
  check(name + ': exactly one focused element', run.where.focusCount === 1, run.where);
  if (result.keyP95 > FRAME_60HZ || result.frameP95 > 2 * FRAME_60HZ)
    report.warnings.push({ name, keyP95: result.keyP95, frameP95: result.frameP95 });
  console.log(
    `${name}: keys p95 ${result.keyP95.toFixed(1)} ms (max ${result.keyMax.toFixed(1)}), longest frame gap ${result.frameMax.toFixed(1)} ms`
  );
}

async function footprint() {
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics = await perf(),
    dom = await cdp.send('Memory.getDOMCounters');
  const images = await page.evaluate(() => ({
    elements: document.images.length,
    photoRequests: performance
      .getEntriesByType('resource')
      .filter(r => /\/(wallpapers|materials)\//.test(r.name)).length
  }));
  return { heap: metrics.JSHeapUsedSize, nodes: dom.nodes, images };
}

async function wallpaperChecks() {
  const walls = await page.evaluate(() => ZenoWallpapers.map(w => w.id));
  await scene('home');
  const loads = [];
  for (const wall of walls) {
    const t0 = Date.now();
    await qa('look', { wall, bg: 'photo' });
    await ready();
    loads.push({ wall, ms: Date.now() - t0 });
  }
  report.wallpaperLoads = loads;
  check(
    'Every bundled photo loads within budget',
    loads.every(l => l.ms < BUDGET.wallpaperLoad),
    loads
  );

  await page.waitForLoadState('networkidle');
  const current = (await qa('state')).wallpaper,
    a = await footprint();
  for (let i = 0; i < 4; i++) {
    await qa('look', { wall: current });
    await ready();
  }
  await page.waitForTimeout(100);
  const b = await footprint();
  check(
    'Re-selecting the current photo fetches and adds nothing',
    a.images.photoRequests === b.images.photoRequests && a.images.elements === b.images.elements,
    { a: a.images, b: b.images }
  );

  const loop = walls.slice(0, 3);
  const cycle = async () => {
    for (const wall of loop) {
      await qa('look', { wall });
      await ready();
    }
  };
  await cycle();
  await page.waitForTimeout(300);
  const start = await footprint();
  for (let i = 0; i < 4; i++) await cycle();
  await page.waitForTimeout(300);
  const end = await footprint();
  report.memory = { start, end };
  check(
    'Cycling photos does not pile up nodes or images',
    end.nodes - start.nodes < BUDGET.domGrowth && end.images.elements <= start.images.elements + 2,
    report.memory
  );
  check('Cycling photos does not grow the heap by megabytes', end.heap - start.heap < BUDGET.heapGrowth, {
    growth: end.heap - start.heap
  });
  return { walls, end };
}

async function pickerChecks(walls, end) {
  await scene('appearance');
  await page.waitForLoadState('networkidle');
  const requestsBefore = await page.evaluate(() => performance.getEntriesByType('resource').length);
  await qa('activate', 'background.wallpaper');
  await page.waitForFunction(() => ZenoQA.where().view === 'wallpaper');
  const previous = (await qa('state')).shown.wall;
  await qa('nav', 'down');
  await page.waitForFunction(was => !ZenoQA.state().pending && ZenoQA.state().shown.wall !== was, previous);
  await page.waitForLoadState('networkidle');
  const picker = await page.evaluate(from => {
    const fetched = performance
      .getEntriesByType('resource')
      .slice(from)
      .map(r => r.name);
    return {
      images: document.images.length,
      shown: ZenoQA.state().shown.wall,
      fullSize: fetched.filter(u => /\/(wallpapers|materials)\//.test(u) && !/-thumb\.jpg$/.test(u))
    };
  }, requestsBefore);
  report.picker = picker;
  const onlyShown = picker.fullSize.every(
    u => u.includes('/' + picker.shown + '.') || u.includes('/' + picker.shown + '-')
  );
  check(
    'The photo picker loads thumbnails plus only the previewed photo',
    picker.images <= end.images.elements + walls.length + 2 && onlyShown,
    picker
  );
  await qa('nav', 'back');
  await ready();
  await scene('home');
}

try {
  preview = await openPreview();
  page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => {
    if (r.status() >= 400) report.errors.push(r.status() + ' ' + r.url());
  });
  page.on('requestfailed', r => {
    const why = r.failure()?.errorText;
    if (!page.__closing && why !== 'net::ERR_ABORTED') report.errors.push(why + ' ' + r.url());
  });
  await page.addInitScript(installFakeTV);
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('LayerTree.enable');
  cdp.on('LayerTree.layerTreeDidChange', e => {
    layers = e.layers || [];
  });

  const t0 = Date.now();
  await page.goto(preview.baseURL + '/home/');
  await ready();
  await page.waitForLoadState('networkidle');
  report.startupMs = Date.now() - t0;
  const fetched = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  check('Startup does not fetch picker thumbnails', !fetched.some(u => /-thumb\./.test(u)));

  await look({
    bg: 'photo',
    layout: 'list',
    apps: 'both',
    controls: 'icons',
    focus: 'glass',
    material: 'soft',
    font: 'manrope'
  });
  await scenario('List', ['down', 'down', 'down', 'up', 'up', 'up']);
  await look({ layout: 'dock' });
  await scenario('Dock', ['right', 'right', 'right', 'left', 'left', 'left']);
  await qa('nav', 'up');
  await scenario('Header utilities', ['right', 'right', 'left', 'left']);
  await scene('settings');
  await scenario('Settings', ['down', 'down', 'up', 'up']);
  await scene('apps');
  const inventory = await page.evaluate(() => ZenoQA.state().catalog.ids);
  const generic = Array.from({ length: 14 }, (_, n) => 'Qa12345678.Stream' + n);
  check(
    'All apps lists every generic app the TV reported',
    generic.every(id => inventory.includes(id)),
    inventory
  );
  await scenario('All apps grid', ['down', 'down', 'right', 'up', 'up', 'left']);
  await scene('editor');
  await scenario('Home editor', ['down', 'down', 'down', 'up', 'up', 'up']);
  await qa('activate', 'editor.move.DemoApps02.Cinema');
  await scenario('Moving an app in the editor', ['down', 'up'], 6);
  await qa('nav', 'back');
  await scene('appearance');
  await scenario('Appearance', ['down', 'down', 'down', 'up', 'up', 'up']);
  await scene('home');
  await look({ font: 'newsreader', layout: 'list', apps: 'text', controls: 'text' });
  await scenario('List with Newsreader', ['down', 'down', 'down', 'up', 'up', 'up']);
  await qa('nav', 'right');
  await scenario('Utilities with Newsreader', ['up', 'up', 'down', 'down']);

  const { walls, end } = await wallpaperChecks();
  await pickerChecks(walls, end);

  report.paintedLayers = layers
    .filter(l => l.drawsContent)
    .map(l => ({ width: l.width, height: l.height, paints: l.paintCount }));
  const liveBlur = await page.evaluate(() =>
    [...document.querySelectorAll('#stage, #stage *')]
      .filter(el => el.getClientRects().length)
      .map(el => {
        const s = getComputedStyle(el);
        return {
          el: el.tagName + '.' + el.className,
          filter: s.filter,
          backdrop: s.backdropFilter || s.webkitBackdropFilter || 'none'
        };
      })
      .filter(s => /blur|url\(/.test(s.filter) || s.backdrop !== 'none')
  );
  check('Nothing on screen uses live blur or backdrop filters', liveBlur.length === 0, liveBlur);
  check('No page errors or failed requests', report.errors.length === 0, report.errors);
} catch (error) {
  report.failures.push({ name: 'audit crashed', detail: error.stack });
} finally {
  if (page) {
    page.__closing = true;
    await page.close();
  }
  if (preview) await preview.close();
  report.finishedAt = new Date().toISOString();
  const dir = root + '.local/qa/performance/';
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + 'production-performance.json', JSON.stringify(report, null, 2) + '\n');
}
const passed = report.checks.filter(c => c.passed).length;
console.log(
  `${passed} performance checks passed, ${report.failures.length} failed, ${report.warnings.length} over one 60 Hz frame. Report: .local/qa/performance/production-performance.json`
);
if (report.failures.length) process.exitCode = 1;
