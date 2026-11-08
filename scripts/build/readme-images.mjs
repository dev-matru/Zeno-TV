// Render the README screenshots. The clock and the weather are pinned so the
// pictures stay stable between runs, and the TV is simulated with a list of apps.
// With .local/personal/screenshot-apps.json ([{"id", "name"}], the apps installed
// on your TV) the pictures use your personal build: its logos and colours. Without
// it, the made-up apps in scripts/dev/demo/apps.json are shown with their initials.
// Usage: node scripts/build/readme-images.mjs
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';
import { fakeTV } from '../checks/ui/fake-tv.mjs';

const personalList = root + '.local/personal/screenshot-apps.json';
const personal = existsSync(personalList);
const apps = JSON.parse(
  readFileSync(personal ? personalList : root + 'scripts/dev/demo/apps.json', 'utf8')
).map(a => ({ id: a.id, name: a.name, show: true, iconPath: '' }));

const out = root + 'docs/images/';
mkdirSync(out, { recursive: true });

const weather = {
  mode: 'auto',
  placeKey: '',
  name: 'Milan',
  temperature: 14,
  code: 2,
  isDay: true
};
async function stagePage(browser, baseURL, scale) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: scale,
    locale: 'en-US'
  });
  await page.clock.install({ time: new Date('2026-05-16T18:40:00') });
  await page.addInitScript(fakeTV, {
    mock: true,
    catalog: apps,
    seed: { home: ['tv', 'pc'].concat(apps.map(a => a.id)), homeSeeded: true }
  });
  await page.addInitScript(w => {
    window.ZENO_OFFLINE_TEST = true;
    localStorage.setItem('zeno.language.v1', 'en');
    localStorage.setItem('zeno.weather.v1', JSON.stringify(Object.assign({ at: Date.now() }, w)));
  }, weather);
  await page.goto(baseURL + '/home/');
  await page.waitForFunction(() => window.ZenoQA && ZenoQA.ready && ZenoQA.ready());
  await page.waitForFunction(() => ZenoQA.state().dock.length > 2);
  return page;
}

const preview = await openPreview({ publicOnly: !personal });
try {
  const ready = page => page.waitForFunction(() => ZenoQA.ready());
  const shot = async (page, name) => {
    await page.waitForTimeout(500);
    await page.screenshot({
      path: out + name + '.jpg',
      type: 'jpeg',
      quality: 86,
      animations: 'disabled'
    });
    console.log('docs/images/' + name + '.jpg');
  };

  // Hero: the card grid, full size.
  const hero = await stagePage(preview.browser, preview.baseURL, 1);
  await hero.evaluate(() => ZenoQA.look({ layout: 'grid', wall: 'cove' }));
  await ready(hero);
  await hero.evaluate(() => ZenoQA.nav(['down', 'right', 'right']));
  await shot(hero, 'home');
  await hero.close();

  // Thumbnails at half size: the other two layouts and the settings sheet.
  const small = await stagePage(preview.browser, preview.baseURL, 0.5);
  await small.evaluate(() => ZenoQA.look({ layout: 'dock', wall: 'alpine' }));
  await ready(small);
  await small.evaluate(() => ZenoQA.nav(['right', 'right']));
  await shot(small, 'dock');

  await small.evaluate(() => ZenoQA.look({ layout: 'list', wall: 'forest' }));
  await ready(small);
  await small.evaluate(() => ZenoQA.nav(['down']));
  await shot(small, 'list');

  await small.evaluate(() => ZenoQA.scene('settings'));
  await small.evaluate(() => ZenoQA.activate('settings.category.appearance'));
  await shot(small, 'settings');
} finally {
  await preview.close();
}
