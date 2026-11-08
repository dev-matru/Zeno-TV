import assert from 'node:assert/strict';
import { openPreview, root } from '../lib/browser.mjs';
let count = 0;
function check(v, m) {
  assert(v, m);
  count++;
}
const preview = await openPreview({ publicOnly: true });
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    ZENO_OFFLINE_TEST = true;
    if (!localStorage.getItem('zeno.home.v1'))
      localStorage.setItem(
        'zeno.home.v1',
        JSON.stringify({
          homeVersion: 4,
          layout: 'grid',
          bg: 'photo',
          wall: 'misty',
          font: 'geist',
          home: ['tv', 'youtube', 'netflix', 'primevideo', 'raiplay', 'infinity', 'pc'],
          lastApp: 'pc',
          desktop: {
            positions: {
              tv: { x: -1, y: 1 },
              youtube: { x: 4, y: 1 },
              netflix: { x: 1, y: -1 },
              primevideo: { x: 1, y: 3 },
              raiplay: { x: 2, y: 1 },
              infinity: { x: 2, y: 2 },
              pc: { x: 0, y: 1 }
            }
          }
        })
      );
  });
  await page.goto(preview.baseURL + '/home/');
  const ready = () => page.waitForFunction(() => ZenoQA && ZenoQA.ready());
  await ready();
  const act = async a => {
    check(await page.evaluate(a => !!ZenoQA.activate(a), a), 'Action ' + a);
    await ready();
  };
  const centered = await page.evaluate(() => {
    var d = ZenoQA.state().desktop,
      g = ZenoDesktop.geometry(d);
    return {
      x: g.left + (g.width + (d.columns - 1) * g.pitchX) / 2,
      y: g.top + (g.height + (d.rows - 1) * g.pitchY) / 2,
      aligned: Math.abs(ZenoDesktop.point(d, { x: 0, y: 0.5 }).y + 92 * g.scale - g.height) < 0.01
    };
  });
  check(
    Math.abs(centered.x - 960) < 0.01 && Math.abs(centered.y - 540) < 0.01,
    'Nominal card rectangle centered'
  );
  check(centered.aligned, 'Stacked compact widgets align with the full-card bottom');
  for (const width of [1920, 1280]) {
    await page.setViewportSize({ width, height: (width * 9) / 16 });
    await page.waitForFunction(
      () => Math.abs(document.querySelector('#stage').getBoundingClientRect().width - innerWidth) < 1
    );
    const peek = await page.evaluate(() => {
      var stage = document.getElementById('stage').getBoundingClientRect(),
        scale = stage.width / 1920,
        edges = {};
      for (var id of ['tv', 'youtube', 'netflix', 'primevideo']) {
        var e = document.querySelector('[data-action="home.app.' + id + '"]'),
          r = e.querySelector('.desk-art').getBoundingClientRect();
        edges[id] = {
          x: (r.x - stage.x) / scale,
          y: (r.y - stage.y) / scale,
          right: (r.right - stage.x) / scale,
          bottom: (r.bottom - stage.y) / scale,
          peek: e.classList.contains('is-peek'),
          opacity: getComputedStyle(e).opacity
        };
      }
      return edges;
    });
    check(
      peek.tv.x < 0 && peek.tv.right > 0 && peek.youtube.x < 1920 && peek.youtube.right > 1920,
      'Left/right visible partial cards ' + width
    );
    check(
      peek.netflix.y < 0 &&
        peek.netflix.bottom > 0 &&
        peek.primevideo.y < 1080 &&
        peek.primevideo.bottom > 1080,
      'Top/bottom visible partial cards ' + width
    );
    check(
      Object.values(peek).every(e => e.peek && +e.opacity < 1),
      'Adjacent cards have a discreet preview ' + width
    );
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Continua.png' });
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.desktopgrid');
  await act('desktop.peeks');
  await page.evaluate(() => ZenoQA.nav('home'));
  check(
    await page
      .locator('.desk-card.is-peek')
      .evaluateAll(es => es.length >= 4 && es.every(e => getComputedStyle(e).visibility === 'hidden')),
    'Adjacent previews can be hidden'
  );
  await page.reload();
  await ready();
  check(await page.evaluate(() => ZenoQA.state().desktop.peeks === false), 'Preview choice survives reload');
  await page.evaluate(() => ZenoQA.nav('left'));
  await page.waitForTimeout(240);
  check(
    await page.evaluate(() => ZenoQA.state().selected === 'tv' && ZenoQA.state().desktopCamera.x === -1),
    'Hidden adjacent card remains reachable'
  );
  check(
    await page
      .locator('[data-action="home.app.tv"]')
      .evaluate(e => getComputedStyle(e).visibility === 'visible' && !e.classList.contains('is-peek')),
    'Reached card becomes fully visible'
  );
  await page.evaluate(() => ZenoQA.scene('home'));
  await page.evaluate(() => ZenoQA.nav(['right', 'up']));
  await page.keyboard.down('Enter');
  await page.waitForTimeout(700);
  await page.keyboard.up('Enter');
  await act('homeaction.configure');
  check(
    (await page.locator('[data-action="clock.compact"]').count()) === 0 &&
      (await page.locator('[data-action="clock.digital"]').count()) === 1 &&
      (await page.locator('[data-action="clock.analog"]').count()) === 1,
    'Two independent clock types'
  );
  await act('widget.density.standard');
  await act('clock.digital');
  await page.evaluate(() => ZenoQA.nav('home'));
  let standard = await page
    .locator('.widget-clock-digital')
    .evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  await page.evaluate(() => ZenoWidgets.set('clockDensity', 'compact'));
  let compact = await page
    .locator('.widget-clock-digital')
    .evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  check(standard >= 90 && standard > compact + 20, 'Standard digital face is materially larger');
  await page.evaluate(() => {
    ZenoExtras.set('clock', 'analog');
    ZenoWidgets.set('clockDensity', 'standard');
  });
  let as = await page.locator('.widget-clock .zeno-analog-clock').count(); // selector is checked below using actual clock class
  const analog = await page.locator('.desk-clock-analog svg').evaluate(e => e.getBoundingClientRect().width);
  await page.evaluate(() => ZenoWidgets.set('clockDensity', 'compact'));
  const ac = await page.locator('.desk-clock-analog svg').evaluate(e => e.getBoundingClientRect().width);
  check(analog >= 160 && analog > ac + 25, 'Analog face also respects density');
  check(
    await page.evaluate(() => ZenoWidgets.config().clockDensity === 'compact'),
    'Clock density independent of style'
  );
  check(errors.length === 0, 'No browser errors ' + errors);
  console.log(count + ' centered-world, adjacent-preview and clock-density checks passed.');
} finally {
  await preview.close();
}
