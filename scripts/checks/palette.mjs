import assert from 'node:assert/strict';
import vm from 'node:vm';
import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';
let passed = 0;
function check(name, value) {
  assert.ok(value, name);
  passed++;
  console.log('PASS ' + name);
}
const source = readFileSync(root + 'app/src/look/card-colors.js', 'utf8');
parse(source, { ecmaVersion: 5 });
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(source, ctx);
const colors = ctx.window.ZenoCardColors;
const apps = ['youtube', 'netflix', 'primevideo', 'disneyplus', 'raiplay', 'infinity', 'appletv'].map(id => ({
    id,
    brand: id
  })),
  sources = [
    { id: 'tv', sourceIcon: 'tv' },
    { id: 'pc', brand: 'pc', sourceKey: 'HDMI-2' },
    { id: 'source.HDMI-1', brand: 'pc', sourceKey: 'HDMI-1' },
    { id: 'source.HDMI-3', brand: 'pc', sourceKey: 'HDMI-3' }
  ],
  records = apps.concat(sources),
  auto = colors.resolve(records);
check(
  'Service hues remain recognizable',
  auto.youtube.split(',').map(Number)[0] > 150 &&
    auto.netflix.split(',').map(Number)[0] > 150 &&
    auto.primevideo.split(',').map(Number)[2] > 150
);
check(
  'Sources receive distinct coordinated tints',
  new Set(sources.map(a => auto[a.id])).size === sources.length
);
check(
  'Input aliases no longer all share the PC gray',
  sources.every(a => auto[a.id] !== '54,65,93')
);
const builds = colors.stats().builds;
check(
  'Reordering reuses the same cached palette',
  colors.resolve(records.slice().reverse()) === auto && colors.stats().builds === builds
);
check(
  'Changing source artwork does not recolor the source',
  colors.resolve(records.map(a => ({ ...a, sourceIcon: a.sourceKey ? 'console' : a.sourceIcon }))) === auto
);
check('Metadata colors are immutable', Object.isFrozen(auto));
check(
  'Unknown service colors remain deterministic',
  colors.fallback({ id: 'unknown.app' }) === colors.fallback({ id: 'unknown.app' })
);
check('Inherited object names are safe service IDs', typeof colors.fallback({ id: 'toString' }) === 'string');
const preview = await openPreview({ publicOnly: process.env.ZENO_PERSONAL !== '1' });
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.ZENO_OFFLINE_TEST = true;
    localStorage.setItem(
      'zeno.weather.v1',
      JSON.stringify({
        mode: 'auto',
        placeKey: '',
        name: 'Milano',
        temperature: 16,
        code: 2,
        isDay: true,
        at: Date.now()
      })
    );
  });
  await page.goto(preview.baseURL + '/home/');
  const ready = () => page.waitForFunction(() => ZenoQA.ready()),
    state = () => page.evaluate(() => ZenoQA.state()),
    nav = k => page.evaluate(k => ZenoQA.nav(k), k),
    act = async a => assert.ok(await page.evaluate(a => ZenoQA.activate(a), a), a);
  await ready();
  await page.evaluate(() => ZenoQA.look({ layout: 'grid', apps: 'icons', material: 'tint' }));
  await ready();
  check(
    'Fresh install defaults to automatic card colors',
    (await state()).gridStyle === 'brand' && Object.keys((await state()).cardColors).length === 0
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.cards');
  check(
    'Reset colors is the default selected option',
    (await page.locator('[data-action="cards.auto"]').getAttribute('aria-pressed')) === 'true'
  );
  await nav('home');
  await page.evaluate(() =>
    ZenoQA.look({
      gridStyle: 'glass',
      cardColors: { youtube: 'ink', netflix: '#123456', pc: 'rose' }
    })
  );
  await ready();
  const before = await state();
  const extraBefore = await page.evaluate(() => JSON.stringify(ZenoExtras.config()));
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.cards');
  await page.evaluate(() => {
    window.__originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'zeno.home.v1') throw Error('Full');
      return __originalSetItem.call(this, k, v);
    };
  });
  await act('cards.auto');
  check(
    'A failed reset preserves manual colors and style',
    (await state()).gridStyle === 'glass' &&
      JSON.stringify((await state()).cardColors) === JSON.stringify(before.cardColors)
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = __originalSetItem;
    delete window.__originalSetItem;
  });
  await act('settings.retry');
  await ready();
  check(
    'Retry restores automatic colors for every card',
    (await state()).gridStyle === 'brand' && Object.keys((await state()).cardColors).length === 0
  );
  check(
    'Reset preserves apps, wallpaper, font, header and weather',
    JSON.stringify((await state()).home) === JSON.stringify(before.home) &&
      (await state()).wall === before.wall &&
      (await state()).font === before.font &&
      (await state()).clockPanel === before.clockPanel &&
      (await page.evaluate(() => JSON.stringify(ZenoExtras.config()))) === extraBefore
  );
  const writes = (await state()).writes;
  await act('cards.auto');
  check('An already automatic preset does not write again', (await state()).writes === writes);
  await nav('home');
  const art = () =>
    page
      .locator('.desk-card')
      .evaluateAll(es =>
        Object.fromEntries(
          es.map(e => [e.getAttribute('data-action'), e.style.getPropertyValue('--zeno-card-rgb')])
        )
      );
  const beforeArt = await art();
  await page.evaluate(() => ZenoQA.look({ cardColors: { youtube: 'mint' } }));
  const afterArt = await art();
  check(
    'Local color changes still leave all other cards alone',
    Object.keys(beforeArt).every(k => k === 'home.app.youtube' || beforeArt[k] === afterArt[k])
  );
  await page.evaluate(() => {
    ZenoQA.scene('settings');
    ZenoQA.activate('settings.group.homelock');
    ZenoQA.activate('home.lock.on');
    ZenoQA.nav('home');
    ZenoQA.scene('settings');
    ZenoQA.activate('settings.group.cards');
  });
  check(
    'Home lock blocks global color reset',
    (await page.evaluate(() => {
      ZenoQA.activate('cards.auto');
      return ZenoQA.state().homeLocked;
    })) && (await state()).cardColors.youtube === 'mint'
  );
  await page.evaluate(() => {
    ZenoQA.scene('settings');
    ZenoQA.activate('settings.group.homelock');
    ZenoQA.activate('home.lock.off');
    ZenoQA.nav('home');
  });
  const selectors = ['widget.clock', 'widget.weather', 'widget.sources', 'widget.settings'];
  const rects = () =>
    page.locator('.desk-card').evaluateAll(es =>
      es.map(e => {
        var r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      })
    );
  const initial = await rects(),
    paletteBuilds = await page.evaluate(() => ZenoCardColors.stats().builds);
  for (const part of ['clock', 'weather', 'sources', 'settings']) {
    var patch = {};
    patch[part + 'Panel'] = 'none';
    await page.evaluate(p => ZenoQA.look(p), patch);
    await ready();
    check(part + ' surface is independently hidden', (await state())[part + 'Panel'] === 'none');
    check(
      part + ' hiding preserves every module rectangle',
      JSON.stringify(await rects()) === JSON.stringify(initial)
    );
    check(
      part + ' bitmap and veil are removed',
      await page
        .locator('[data-action="home.app.widget.' + part + '"]')
        .evaluate(
          e =>
            getComputedStyle(e.querySelector('.desk-glass')).display === 'none' &&
            getComputedStyle(e.querySelector('.desk-art'), '::after').display === 'none'
        )
    );
  }
  check(
    'Hiding panels does not rebuild the automatic palette',
    (await page.evaluate(() => ZenoCardColors.stats().builds)) === paletteBuilds
  );
  await page.evaluate(() => {
    ZenoQA.nav('up');
  });
  check(
    'Transparent widget retains focus border',
    await page
      .locator('.desk-card.is-focus .desk-art')
      .evaluate(e => getComputedStyle(e).borderTopColor !== 'rgba(0, 0, 0, 0)')
  );
  await page.reload();
  await ready();
  check(
    'Hidden surfaces and colors survive reload',
    (await state()).clockPanel === 'none' &&
      (await state()).weatherPanel === 'none' &&
      (await state()).sourcesPanel === 'none' &&
      (await state()).settingsPanel === 'none' &&
      (await state()).cardColors.youtube === 'mint'
  );
  check('No runtime errors', !errors.length);
  console.log(passed + ' automatic color and header surface checks passed.');
} finally {
  await preview.close();
}
