import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';
let checks = 0;
function close(a, b, label) {
  assert(Math.abs(a - b) < 0.08, label + ': ' + a + ' vs ' + b);
  checks++;
}
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(root + 'app/src/home/desktop.js', 'utf8'), ctx);
const D = ctx.window.ZenoDesktop;
for (const [columns, rows] of [
  [3, 2],
  [4, 2],
  [4, 3],
  [5, 3]
])
  for (const row of [-3, -1, 0, 1, 3])
    for (const col of [-3, -1, 0, 2]) {
      const d = D.normalise({ columns, rows }, ['tv'], true),
        g = D.geometry(d),
        whole = D.point(d, { x: col, y: row }),
        compact = D.point(d, { x: col + 0.5, y: row + 0.5 });
      close(compact.x + 176 * g.scale, whole.x + g.width, 'Paired half columns share full-card right edge');
      close(compact.y + 92 * g.scale, whole.y + g.height, 'Paired half rows share full-card bottom edge');
      close(compact.y - whole.y - 92 * g.scale, 24 * g.scale, 'Inner vertical gutter');
    }
const preview = await openPreview({ publicOnly: true });
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    ZENO_OFFLINE_TEST = true;
  });
  await page.goto(preview.baseURL + '/home/');
  const ready = () => page.waitForFunction(() => ZenoQA.ready());
  await ready();
  for (const [columns, rows] of [
    [3, 2],
    [4, 2],
    [4, 3],
    [5, 3]
  ])
    for (const width of [1920, 1280]) {
      await page.setViewportSize({ width, height: (width * 9) / 16 });
      await page.evaluate(
        ({ columns, rows }) => {
          const home = ZenoQA.state().home;
          var d = ZenoDesktop.normalise({ columns, rows }, home, true);
          d.sizes['widget.sources'] = 'quarter';
          d.sizes['widget.settings'] = 'quarter';
          d.positions['widget.sources'] = { x: columns - 0.5, y: 0.5 };
          d.positions['widget.settings'] = { x: columns - 0.5, y: 0 };
          ZenoQA.look({ layout: 'grid', desktop: d });
        },
        { columns, rows }
      );
      await ready();
      await page.waitForFunction(
        () => Math.abs(document.getElementById('stage').getBoundingClientRect().width - innerWidth) < 1
      );
      const bounds = await page.evaluate(() => {
        var scene = document.getElementById('scene').getBoundingClientRect(),
          scale = document.getElementById('stage').getBoundingClientRect().width / 1920;
        function rect(id) {
          var r = document
            .querySelector('[data-action="home.app.widget.' + id + '"] .desk-art')
            .getBoundingClientRect();
          return {
            x: (r.x - scene.x) / scale,
            top: (r.y - scene.y) / scale,
            right: (r.right - scene.x) / scale,
            bottom: (r.bottom - scene.y) / scale,
            height: r.height / scale
          };
        }
        return {
          full: rect('clock'),
          settings: rect('settings'),
          sources: rect('sources'),
          g: ZenoDesktop.geometry(ZenoQA.state().desktop)
        };
      });
      close(
        bounds.settings.top,
        bounds.full.top,
        'Top compact button aligns ' + columns + '/' + rows + '/' + width
      );
      close(
        bounds.sources.bottom,
        bounds.full.bottom,
        'Sources bottom aligns ' + columns + '/' + rows + '/' + width
      );
      close(bounds.sources.x, bounds.settings.x, 'Compact pair left edges');
      close(bounds.sources.right, bounds.g.left + 1660, 'Compact right edge meets grid');
      close(bounds.sources.top - bounds.settings.bottom, 24 * bounds.g.scale, 'Actual inner gutter');
    }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    var s = ZenoQA.state(),
      d = ZenoDesktop.normalise({ columns: 4, rows: 3 }, s.home, true);
    d.sizes['widget.settings'] = 'quarter';
    d.sizes['widget.sources'] = 'quarter';
    d.positions['widget.settings'] = { x: 3.5, y: 0 };
    d.positions['widget.sources'] = { x: 3.5, y: 0.5 };
    ZenoQA.look({ desktop: d });
  });
  await ready();
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Allineamento.png' });
  assert.deepEqual(errors, []);
  console.log(
    checks +
      ' compact-widget alignment checks passed, including negative coordinates, all presets and 1080p/720p.'
  );
} finally {
  await preview.close();
}
