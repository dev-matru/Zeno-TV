// An online wallpaper that cannot load at startup (the TV started Zeno frozen, in the
// background, or its service is not up yet): a built-in photo stands in, the saved
// choice is kept, and the wallpaper is loaded again until it arrives.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';

const REMOTE = 'test-remote-wall';
const preview = await openPreview({ publicOnly: true });
let count = 0;
const check = (v, m) => {
  assert(v, m);
  count++;
};

try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // What the service would send once it is up: the files of a bundled wallpaper.
  let served = 0;
  await page.route(/127\.0\.0\.1:4796\/wallpaper\//, route => {
    served++;
    const variant = /\/1080\/([a-z-]+)\.jpg/.exec(route.request().url())[1];
    const file =
      variant === 'photo' ? 'assets/wallpapers/misty.jpg' : 'assets/materials/misty-' + variant + '.jpg';
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: readFileSync(root + 'app/' + file) });
  });
  await page.addInitScript(remote => {
    ZENO_OFFLINE_TEST = true;
    let walls;
    Object.defineProperty(window, 'ZenoWallpapers', {
      configurable: true,
      get: () => walls,
      set(list) {
        const copy = JSON.parse(JSON.stringify(list[0]));
        copy.id = remote;
        copy.name = 'Online test';
        copy.download = true;
        walls = list.concat([copy]);
      }
    });
  }, REMOTE);
  const ready = () => page.waitForFunction(() => window.ZenoQA && ZenoQA.ready());
  const photo = () =>
    page.evaluate(() => {
      const img = document.getElementById('photo');
      return { src: img.getAttribute('src') || '', width: img.naturalWidth };
    });

  await page.goto(preview.baseURL + '/home/');
  await ready();
  // Save the online wallpaper as the choice, as on a TV that downloaded it earlier.
  await page.evaluate(remote => {
    const record = JSON.parse(localStorage.getItem('zeno.home.v1'));
    const set = o => {
      if (!o || typeof o !== 'object') return;
      if ('wall' in o) {
        o.wall = remote;
        o.bg = 'photo';
      }
      Object.values(o).forEach(set);
    };
    set(record);
    localStorage.setItem('zeno.home.v1', JSON.stringify(record));
  }, REMOTE);

  // Outside the TV the service cannot start, so the first load fails.
  await page.reload();
  await page.waitForFunction(() => window.ZenoQA);
  await page.waitForFunction(() => document.getElementById('photo').naturalWidth > 0, null, {
    timeout: 8000
  });
  const stand = await photo();
  check(
    /^assets\/wallpapers\//.test(stand.src),
    'A built-in photo stands in, not a black screen: ' + stand.src
  );
  check(
    await page.evaluate(r => ZenoQA.state().committed.wall === r, REMOTE),
    'The online wallpaper stays the choice'
  );
  check(
    await page.evaluate(r => localStorage.getItem('zeno.home.v1').includes(r), REMOTE),
    'The saved choice is not overwritten'
  );
  check(served === 0, 'Nothing was asked of the service yet');

  // The service comes up: the next attempt brings the wallpaper.
  await page.evaluate(() => {
    ZenoControl.prepareWallpaper = (wall, height, done) => setTimeout(() => done(null, { cached: true }), 50);
  });
  await page.waitForFunction(
    r => (document.getElementById('photo').getAttribute('src') || '').includes('/wallpaper/' + r + '/'),
    REMOTE,
    { timeout: 15000 }
  );
  await page.waitForFunction(() => document.getElementById('photo').naturalWidth > 0);
  check(served >= 3, 'Photo and materials asked of the service: ' + served);
  check(
    await page.evaluate(() =>
      ['matImg', 'sheetBg', 'phFieldImg'].every(id => document.getElementById(id).naturalWidth > 0)
    ),
    'Glass and fields come from the online wallpaper too'
  );

  // A failure on a screen that comes back is retried right away, not in minutes.
  await page.evaluate(() => {
    ZenoControl.prepareWallpaper = (wall, height, done) =>
      done({ message: 'Il servizio locale del TV non risponde.' });
  });
  await page.reload();
  await page.waitForFunction(() => window.ZenoQA);
  await page.waitForFunction(() => document.getElementById('photo').naturalWidth > 0, null, {
    timeout: 8000
  });
  check(/^assets\/wallpapers\//.test((await photo()).src), 'Stand-in again after a reload');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    ZenoControl.prepareWallpaper = (wall, height, done) => done(null, { cached: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(
    r => (document.getElementById('photo').getAttribute('src') || '').includes('/wallpaper/' + r + '/'),
    REMOTE,
    { timeout: 1800 }
  );
  check(true, 'Retried when the screen came back');

  check(errors.length === 0, errors.join('\n'));
  console.log(count + ' wallpaper recovery checks passed: stand-in photo, saved choice kept, retries.');
} finally {
  await preview.close();
}
