import assert from 'node:assert/strict';
import { openPreview, root } from '../lib/browser.mjs';
const preview = await openPreview({ publicOnly: false });
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(() => {
    ZENO_OFFLINE_TEST = true;
    localStorage.setItem(
      'zeno.weather.v1',
      JSON.stringify({
        mode: 'auto',
        placeKey: '',
        name: 'Milano',
        temperature: 8,
        code: 0,
        isDay: false,
        at: Date.now()
      })
    );
  });
  await page.goto(preview.baseURL + '/home/');
  await page.waitForFunction(() => ZenoQA.ready());
  await page.evaluate(() => ZenoQA.look({ layout: 'dock', apps: 'icons', font: 'geist', material: 'tint' }));
  await page.waitForFunction(() => ZenoQA.ready());
  for (const width of [1920, 1280])
    for (const clock of ['digital', 'compact', 'analog'])
      for (const controls of ['icons', 'both', 'text']) {
        await page.setViewportSize({ width, height: (width * 9) / 16 });
        await page.waitForFunction(
          () => Math.abs(document.getElementById('stage').getBoundingClientRect().width - innerWidth) < 1
        );
        await page.evaluate(
          ({ clock, controls }) => {
            ZenoExtras.set('clock', clock);
            ZenoQA.look({ controls });
          },
          { clock, controls }
        );
        await page.waitForFunction(() => ZenoQA.ready());
        const b = await page.evaluate(() => {
          function rect(e) {
            var r = e.getBoundingClientRect();
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom
            };
          }
          return {
            c: rect(document.getElementById('caption')),
            w: rect(document.getElementById('weatherWidget')),
            u: rect(document.getElementById('utils')),
            cards: [0, 1, 2, 3].map(i => {
              var s = document.getElementById('stage').getBoundingClientRect().width / 1920;
              return {
                x: (124 + 424 * i) * s,
                width: 388 * s,
                height: 208 * s,
                right: (512 + 424 * i) * s
              };
            }),
            buttons: [...document.querySelectorAll('#utils .u')].map(rect)
          };
        });
        const close = (a, b) => Math.abs(a - b) < 1;
        assert(close(b.c.x, b.cards[0].x) && close(b.w.x, b.cards[1].x) && close(b.u.x, b.cards[3].x));
        assert(
          close(b.c.width, b.cards[0].width) &&
            close(b.c.height, b.cards[0].height) &&
            close(b.w.height, b.c.height) &&
            close(b.w.width, b.c.width)
        );
        assert(close(b.c.y, b.w.y) && close(b.c.y, b.u.y) && close(b.u.height, b.c.height));
        assert(
          close(b.buttons[0].width * 2 + (24 * width) / 1920, b.u.width),
          JSON.stringify({ clock, controls, width, b })
        );
        assert(close(b.buttons[1].right, b.cards[3].right));
        await page.evaluate(() => ZenoQA.nav('up'));
        const focus = await page.locator('#utils .u.is-focus').count();
        assert.equal(focus, 1);
        await page.evaluate(() => ZenoQA.nav('right'));
        assert.equal(await page.locator('#utils .u.is-focus').count(), 1);
        await page.evaluate(() => ZenoQA.nav('down'));
      }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    ZenoExtras.set('clock', 'digital');
    ZenoQA.look({ controls: 'icons' });
  });
  await page.waitForFunction(() => ZenoQA.ready());
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Header-1.6.1.png' });
  await page.evaluate(() => ZenoExtras.set('clock', 'analog'));
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Header-Analogico-1.6.1.png' });
  await page.evaluate(() => ZenoQA.look({ layout: 'dock' }));
  await page.waitForFunction(() => ZenoQA.ready());
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Header-Dock-1.6.1.png' });
  console.log(
    '18 legacy Dock header combinations passed: exact app-card dimensions, shared baseline, column alignment, half modules and remote focus at 1080p/720p.'
  );
} finally {
  await preview.close();
}
