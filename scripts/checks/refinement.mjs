import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { openPreview, root } from '../lib/browser.mjs';
for (const name of [
  'main.js',
  'src/system/device.js',
  'src/system/control.js',
  'src/home/extras.js',
  'src/system/info.js',
  'src/sources/icons.js',
  'src/sources/sources.js',
  'src/core/i18n.js'
])
  parse(readFileSync(root + 'app/' + name, 'utf8'), { ecmaVersion: 5 });
const preview = await openPreview({ publicOnly: process.env.ZENO_PERSONAL !== '1' }),
  passed = [];
function check(name, value) {
  assert.ok(value, name);
  passed.push(name);
  console.log('PASS ' + name);
}
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://get.geojs.io/**', r =>
    r.fulfill({ json: { city: 'Milano', latitude: '45.46', longitude: '9.19' } })
  );
  await page.route('https://api.open-meteo.com/**', r =>
    r.fulfill({ json: { current: { temperature_2m: 14, weather_code: 1 } } })
  );
  await page.route('https://api.github.com/**', r => r.fulfill({ json: { tag_name: 'v2.1.1', assets: [] } }));
  await page.route('https://wsrv.nl/**', r =>
    r.fulfill({
      contentType: 'image/jpeg',
      body: readFileSync(root + 'app/assets/wallpapers/misty-thumb.jpg')
    })
  );
  await page.route('http://192.0.2.24:4797/**', async r => {
    const data = r.request().postDataJSON();
    await page.evaluate(d => __calls.push({ method: 'bridge', data: d }), data);
    return r.fulfill({
      json: r.request().url().endsWith('/capabilities')
        ? { available: true }
        : { stopped: true, uninstalled: true }
    });
  });
  await page.route('http://127.0.0.1:4796/**', r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204 });
    const data = r.request().postDataJSON();
    if (data) page.evaluate(data => __calls.push({ method: 'service', request: data }), data);
    return r.fulfill({
      json: data
        ? {
            id: data.id,
            value:
              data.op === 'cache-info'
                ? { bytes: 1048576, sets: 2 }
                : data.op === 'app-memory'
                  ? { bytes: 23068672 }
                  : { ip: '192.0.2.24', enabled: true, canWrite: false }
          }
        : { ready: true }
    });
  });
  await page.addInitScript(() => {
    const ids = [
      'tv',
      'pc',
      'DemoApps12.Videos',
      'DemoApps02.Cinema',
      'DemoApps10.Series',
      'DemoApps04.Kids',
      'DemoApps07.News',
      'DemoApps05.LiveTV',
      'DemoApps11.Sports',
      'DemoApps01.Arcade',
      'DemoApps06.Music'
    ];
    const native = [
      'org.tizen.tv-viewer',
      'zeno.pc',
      'DemoApps12.Videos',
      'DemoApps02.Cinema',
      'DemoApps10.Series',
      'DemoApps04.Kids',
      'DemoApps07.News',
      'DemoApps05.LiveTV',
      'DemoApps11.Sports',
      'DemoApps01.Arcade',
      'DemoApps06.Music'
    ];
    const records = Array.from({ length: 24 }, (_, i) => ({
      id: 'ZenoTest' + String(i).padStart(2, '0') + '.App',
      appId: 'ZenoTest' + String(i).padStart(2, '0') + '.App',
      name: 'Applicazione ' + (i + 1)
    }));
    window.__homeStamp = 'initial';
    window.ZENO_OFFLINE_TEST = true;
    window.__calls = [];
    window.ZenoDeviceDefaults = {
      localToken: 'qa',
      macHost: '192.0.2.24',
      bridgeToken: 'qa-bridge',
      pcMac: '00:11:22:33:44:55'
    };
    if (!localStorage.getItem('zeno.home.v1'))
      localStorage.setItem(
        'zeno.home.v1',
        JSON.stringify({
          homeVersion: 4,
          home: ids.concat(records.map(r => r.id)),
          appRecords: records,
          wall: 'misty',
          bg: 'photo',
          layout: 'dock',
          font: 'geist',
          apps: 'both',
          mode: 'fixed'
        })
      );
    window.tizen = {
      tvwindow: {
        setSource(source, ok) {
          __calls.push({ method: 'setSource', source });
          ok();
        }
      },
      application: {
        getCurrentApplication() {
          return {
            getRequestedAppControl() {
              return {
                appControl: {
                  data: [
                    { key: 'entry_point', value: ['smarthub_key'] },
                    { key: '__K_APP_LAUNCH_START_TIME', value: [__homeStamp] }
                  ]
                }
              };
            }
          };
        },
        getAppsInfo(ok) {
          ok(
            native
              .filter(id => id !== 'zeno.pc')
              .map((id, i) => ({ id, name: ids[i], show: true }))
              .concat(records.map(r => ({ id: r.id, name: r.name, show: true })))
          );
        },
        getAppInfo(id) {
          return { id, name: id, version: '1.2.3', packageId: id.split('.')[0] };
        },
        getAppsContext(ok) {
          ok([{ id: '123', appId: 'DemoApps12.Videos' }]);
        },
        launch(id, ok) {
          __calls.push({ method: 'launch', id });
          ok();
        }
      },
      package: {
        getPackageInfo(id) {
          return { id, totalSize: 10485760, dataSize: 2097152, version: '1.2.3' };
        }
      },
      systeminfo: {
        getTotalMemory() {
          return 2147483648;
        },
        getAvailableMemory() {
          return 536870912;
        },
        getPropertyValue(key, ok) {
          if (key === 'BUILD') ok({ model: 'QA TV', buildVersion: 'QA firmware' });
          else if (key === 'DISPLAY') ok({ resolutionWidth: 1920, resolutionHeight: 1080 });
          else if (key === 'NETWORK') ok({ networkType: 'WIFI' });
          else if (key === 'STORAGE')
            ok({
              units: [{ type: 'INTERNAL', capacity: 4294967296, availableCapacity: 1073741824 }]
            });
          else
            ok({
              current: { type: 'TV', number: 1 },
              connected: [
                { type: 'TV', number: 1 },
                { type: 'HDMI', number: 1 },
                { type: 'HDMI', number: 2 }
              ],
              disconnected: []
            });
        }
      }
    };
  });
  const state = () => page.evaluate(() => ZenoQA.state()),
    ready = () => page.waitForFunction(() => window.ZenoQA && ZenoQA.ready());
  const act = async a => assert.ok(await page.evaluate(a => ZenoQA.activate(a), a), a);
  const nav = (...keys) => page.evaluate(keys => ZenoQA.nav(keys), keys);
  const glass = async (selector, pseudo) =>
    page.locator(selector).evaluate((e, pseudo) => {
      const s = getComputedStyle(e, pseudo),
        alpha = Number(s.backgroundColor.match(/[\d.]+/g)?.[3] ?? 1);
      return (
        alpha > 0 &&
        alpha < 0.6 &&
        s.backgroundImage.includes('linear-gradient') &&
        s.boxShadow.includes('inset') &&
        s.backdropFilter === 'none'
      );
    }, pseudo);
  await page.goto(preview.baseURL + '/home/');
  await ready();
  await page.evaluate(() => ZenoQA.look({ layout: 'grid', apps: 'icons', material: 'tint' }));
  await ready();
  check(
    'Icons mode hides unfocused grid names',
    await page
      .locator('.desk-card:not(.is-focus) .desk-label')
      .evaluateAll(es => es.every(e => getComputedStyle(e).display === 'none'))
  );
  check(
    'Icons mode hides selected names by default',
    !(await page.locator('.desk-card.is-focus .desk-label').isVisible())
  );
  await page.evaluate(() => ZenoQA.look({ gridNames: 'focus' }));
  await ready();
  check(
    'Selected names can be enabled explicitly',
    await page.locator('.desk-card.is-focus .desk-label').isVisible()
  );
  await page.evaluate(() => ZenoQA.look({ gridNames: 'hidden' }));
  await ready();
  await page.evaluate(() => ZenoQA.look({ apps: 'text' }));
  await ready();
  check(
    'Text mode hides grid marks',
    await page.locator('.desk-app-mark .mark').evaluateAll(es => es.every(e => !e.getClientRects().length))
  );
  check('Text mode shows card titles', await page.locator('.desk-app-title').first().isVisible());
  await page.evaluate(() => ZenoQA.look({ apps: 'both' }));
  await ready();
  check(
    'Both mode shows marks and names',
    (await page.locator('.desk-app-mark .mark').first().isVisible()) &&
      (await page.locator('.desk-app-title').first().isVisible())
  );
  const clear = await page
    .locator('.stage')
    .evaluate(e => getComputedStyle(e).getPropertyValue('--zeno-brand-alpha'));
  check('Clear cards use less than 20 percent brand tint', +clear <= 0.2);
  check(
    'Cards reuse the cached material field',
    await page
      .locator('.desk-glass')
      .first()
      .evaluate(e => getComputedStyle(e).backgroundImage.includes('field-clear'))
  );
  await page.evaluate(() => ZenoQA.look({ material: 'frost' }));
  await ready();
  check(
    'Frost changes card tint and precomputed material',
    (await page
      .locator('.stage')
      .evaluate(e => +getComputedStyle(e).getPropertyValue('--zeno-brand-alpha') > 0.4)) &&
      (await page
        .locator('.desk-glass')
        .first()
        .evaluate(e => getComputedStyle(e).backgroundImage.includes('field-frost')))
  );
  await page.evaluate(() => ZenoQA.look({ gridStyle: 'glass', material: 'tint' }));
  await ready();
  check(
    'Neutral glass removes all per-brand card colors',
    await page
      .locator('.desk-art')
      .evaluateAll(es => new Set(es.map(e => getComputedStyle(e).backgroundImage)).size === 1)
  );
  check(
    'Grid has no heading or app counter',
    (await page.locator('.zeno-grid-label,.zeno-grid-count').count()) === 0
  );
  const cached = await page.evaluate(() => {
    var stage = document.querySelector('.stage'),
      cards = Array.from(document.querySelectorAll('.desk-card')),
      observer = new MutationObserver(() => {}),
      localeObserver = new MutationObserver(() => {});
    observer.observe(stage, { attributes: true, attributeFilter: ['style'] });
    localeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    });
    for (var i = 0; i < 20; i++) ZenoQA.nav(i % 2 ? 'left' : 'right');
    var changes = observer.takeRecords().length,
      localeWrites = localeObserver.takeRecords().length;
    observer.disconnect();
    localeObserver.disconnect();
    return {
      changes,
      localeWrites,
      reused: cards.every((c, i) => c === document.querySelectorAll('.desk-card')[i])
    };
  });
  check('Directional navigation reuses card nodes and cached styles', cached.reused && cached.changes === 0);
  check('Grid navigation never rewrites the unchanged document language', cached.localeWrites === 0);
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Griglia-vetro.png' });
  await page.evaluate(() => ZenoQA.scene('settings'));
  check('Sidebar slogan is removed', (await page.locator('.zeno-sidebar-footer').count()) === 0);
  await nav('home');
  await holdHome('DemoApps12.Videos');
  await act('homeaction.color');
  await act('card.color.mint');
  check(
    'Each card keeps a custom tint without changing the grid default',
    (await state()).gridStyle === 'glass' && (await state()).cardColors['DemoApps12.Videos'] === 'mint'
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.applications');
  await act('settings.group.storage');
  check(
    'RAM and disk are non-interactive information',
    (await page.locator('.setting-info').count()) === 2 &&
      (await page.locator('[data-action="system.refresh"]').count()) === 1
  );
  check('Storage has one focused control', (await page.evaluate(() => ZenoQA.where().focusCount)) === 1);
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Memoria.png' });
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.system');
  await act('settings.group.about');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.setting-info-value')].some(e => e.textContent === 'QA TV')
  );
  check(
    'System information starts with the Zeno version',
    /^\d+\.\d+\.\d+/.test(await page.locator('.setting-info-value').first().textContent())
  );
  check(
    'System information shows real API values',
    await page
      .locator('#appearanceRows')
      .innerText()
      .then(t => t.includes('QA firmware') && t.includes('1920 × 1080') && t.includes('WIFI'))
  );
  const aboutBounds = await page.locator('.detail-about .setting-info').evaluateAll(es =>
    es.map(e => {
      var r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, right: r.right };
    })
  );
  check(
    'All system information fits without scrolling',
    aboutBounds.every(r => r.top >= 244 && r.bottom < 928 && r.right < 1809)
  );
  check(
    'About contains no duplicated Samsung settings action',
    (await page.locator('[data-action="samsung.settings"]').count()) === 0
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.devices');
  await act('settings.group.inputs');
  check(
    'Only HDMI profiles are configurable',
    (await page.locator('[data-action^="input.configure."]').count()) === 4 &&
      (await page.locator('[data-action="input.configure.TV-1"]').count()) === 0
  );
  await act('input.configure.HDMI-1');
  await act('edit.sourceName');
  await act('keyboard.clear');
  for (const c of 'GAME') await act('keyboard.' + c);
  await act('keyboard.save');
  check(
    'Source can be renamed using the remote keyboard',
    (await page.evaluate(() => ZenoSources.get('HDMI-1').name)) === 'GAME'
  );
  await act('input.home');
  check('A configured input can be added to Home', (await state()).home.includes('source.HDMI-1'));
  await act('input.network');
  await page.evaluate(() => {
    ZenoSources.set('HDMI-1', 'mac', '10:20:30:40:50:60');
    ZenoSources.set('HDMI-1', 'broadcast', '192.0.2.255');
  });
  await nav('down', 'up');
  await act('input.wol');
  await page.waitForFunction(() => __calls.some(c => c.method === 'service' && c.request.op === 'wol'));
  check(
    'Each source sends its own WoL profile',
    await page.evaluate(() =>
      __calls.some(
        c =>
          c.method === 'service' &&
          c.request.op === 'wol' &&
          c.request.mac === '10:20:30:40:50:60' &&
          c.request.broadcast === '192.0.2.255'
      )
    )
  );
  check(
    'Other source MAC profiles remain independent',
    (await page.evaluate(() => ZenoSources.get('HDMI-2').mac)) === '00:11:22:33:44:55'
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.devices');
  await act('settings.group.inputs');
  await act('input.configure.HDMI-1');
  await act('input.appearance');
  await act('input.icon');
  check(
    'Source picker offers nine original vector symbols',
    (await page.locator('.detail-sourceicon [data-action^="input.icon."]').count()) === 9
  );
  const symbolBounds = await page.locator('.detail-sourceicon [data-action^="input.icon."]').evaluateAll(es =>
    es.map(e => {
      var r = e.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        bottom: r.bottom,
        right: r.right,
        fits: e.querySelector('.setting-name').scrollWidth <= e.querySelector('.setting-name').clientWidth + 1
      };
    })
  );
  check(
    'All source icons and labels fit the glass picker',
    symbolBounds.every(r => r.x >= 139 && r.y >= 230 && r.bottom < 930 && r.right < 790 && r.fits)
  );
  check(
    'Source picker Back stays clear of its heading',
    await page
      .locator('#appearanceBack')
      .evaluate(
        e =>
          e.getBoundingClientRect().bottom <
          document.querySelector('#appearanceTitle').getBoundingClientRect().top
      )
  );
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Icone-sorgenti.png' });
  const originalIcon = await page.evaluate(() => ZenoSources.get('HDMI-1').icon);
  await nav('right');
  check(
    'Browsing icons does not apply a choice',
    (await page.evaluate(() => ZenoSources.get('HDMI-1').icon)) === originalIcon
  );
  await act('input.icon.console');
  check(
    'OK applies the chosen source icon',
    (await page.evaluate(() => ZenoSources.get('HDMI-1').icon)) === 'console'
  );
  await nav('back');
  await act('edit.sourceBadge');
  await act('keyboard.clear');
  for (const c of 'PS5') await act('keyboard.' + c);
  await act('keyboard.save');
  check(
    'Source badge can be edited using the remote keyboard',
    (await page.evaluate(() => ZenoSources.get('HDMI-1').badge)) === 'PS5'
  );
  await page.evaluate(() => ZenoQA.scene('home'));
  await page.evaluate(() => ZenoQA.look({ layout: 'grid', apps: 'icons', gridNames: 'hidden' }));
  await ready();
  check(
    'TV has a readable TV badge inside its icon',
    (await page.locator('.desk-card[data-action="home.app.tv"] .source-badge').textContent()) === 'TV'
  );
  check(
    'Hidden grid names preserve the custom source badge',
    (await page
      .locator('.desk-card[data-action="home.app.source.HDMI-1"] [data-source-icon="console"] .source-badge')
      .textContent()) === 'PS5' &&
      !(await page.locator('.desk-card[data-action="home.app.source.HDMI-1"] .desk-label').isVisible())
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.devices');
  await act('settings.group.inputs');
  await act('input.configure.HDMI-1');
  await act('input.appearance');
  await act('input.badge.toggle');
  await nav('home');
  check(
    'Badge visibility can be disabled independently',
    (await page.locator('.desk-card[data-action="home.app.source.HDMI-1"] .source-badge').count()) === 0
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.devices');
  await act('settings.group.inputs');
  await act('input.configure.HDMI-1');
  await act('input.appearance');
  await act('input.badge.toggle');
  await nav('home');
  for (const layout of ['dock', 'list', 'grid']) {
    await page.evaluate(layout => ZenoQA.look({ layout }), layout);
    await ready();
    const container = { dock: '#track', list: '#phRows', grid: '.zeno-desktop' }[layout];
    check(
      'Source visual updates in ' + layout,
      (await page
        .locator(
          container + ' [data-action="home.app.source.HDMI-1"] [data-source-icon="console"] .source-badge'
        )
        .textContent()) === 'PS5'
    );
  }
  check(
    'Invalid icon and overlong badge do not modify the source',
    await page.evaluate(
      () =>
        !ZenoSources.set('HDMI-1', 'icon', 'unknown') &&
        !ZenoSources.set('HDMI-1', 'badge', 'TOO LONG') &&
        ZenoSources.get('HDMI-1').badge === 'PS5'
    )
  );
  for (const key of ['HDMI-3', 'HDMI-4']) {
    await page.evaluate(() => ZenoQA.scene('settings'));
    await act('settings.category.devices');
    await act('settings.group.inputs');
    await act('input.configure.' + key);
    await act('input.home');
    check(key + ' can be independently added to Home', (await state()).home.includes('source.' + key));
    await act('input.home');
  }
  await page.reload();
  await ready();
  check(
    'Source icon and badge survive restart',
    await page.evaluate(() => {
      var p = ZenoSources.get('HDMI-1');
      return p.icon === 'console' && p.badge === 'PS5' && p.showBadge && p.mac === '10:20:30:40:50:60';
    })
  );
  await page.evaluate(() => ZenoQA.scene('home'));
  await act('home.app.source.HDMI-1');
  check(
    'A short press on a source opens only its input',
    await page.evaluate(() =>
      __calls.some(c => c.method === 'setSource' && c.source.type === 'HDMI' && c.source.number === 1)
    )
  );
  const wolCount = await page.evaluate(
    () => __calls.filter(c => c.method === 'service' && c.request.op === 'wol').length
  );
  await page.keyboard.down('Enter');
  await page.waitForTimeout(730);
  await page.keyboard.up('Enter');
  check(
    'Holding OK opens source actions without sending WoL',
    (await state()).view === 'pc' &&
      (await page.evaluate(
        () => __calls.filter(c => c.method === 'service' && c.request.op === 'wol').length
      )) === wolCount
  );
  await nav('back');
  await page.reload();
  await ready();
  check(
    'Source profiles and custom card colors survive reload',
    (await page.evaluate(() => ZenoSources.get('HDMI-1').name)) === 'GAME' &&
      (await state()).cardColors['DemoApps12.Videos'] === 'mint'
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.layout');
  check(
    'Layout choice labels fit on one line',
    await page
      .locator('.detail-layout .is-horizontal .setting-name')
      .evaluateAll(es => es.every(e => e.scrollWidth <= e.clientWidth + 1))
  );
  await nav('home');
  check('Home exits a nested menu', (await state()).view === 'home');
  await page.evaluate(() => ZenoQA.scene('settings'));
  await page.evaluate(() => {
    __homeStamp = 'home-pressed';
  });
  await page.waitForFunction(() => ZenoQA.state().view === 'home');
  check('Native Home relaunch stamp exits menus', true);

  async function focusHome(id) {
    await page.evaluate(id => {
      ZenoQA.scene('home');
      var s = ZenoQA.state();
      if (s.layout === 'grid') {
        var queue = [[s.selected, []]],
          seen = new Set([s.selected]);
        while (queue.length) {
          var [current, path] = queue.shift();
          if (current === id) {
            ZenoQA.nav(path);
            return;
          }
          for (var k of ['left', 'right', 'up', 'down']) {
            var n = ZenoDesktop.neighbour(s.desktop, s.home, current, k);
            if (!seen.has(n)) {
              seen.add(n);
              queue.push([n, path.concat(k)]);
            }
          }
        }
      } else
        for (var count = 0; count < 100; count++) {
          s = ZenoQA.state();
          var i = s.home.indexOf(s.selected),
            j = s.home.indexOf(id);
          if (i === j) return;
          ZenoQA.nav(s.layout === 'list' ? (i > j ? 'up' : 'down') : i > j ? 'left' : 'right');
        }
      throw Error('Cannot focus ' + id);
    }, id);
  }
  async function holdHome(id) {
    await focusHome(id);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(700);
    await page.keyboard.up('Enter');
  }
  for (const layout of ['grid', 'dock', 'list']) {
    await page.evaluate(layout => ZenoQA.look({ layout }), layout);
    await ready();
    await focusHome('DemoApps12.Videos');
    await page.evaluate(() => (__calls = []));
    await page.keyboard.down('Enter');
    await page.waitForTimeout(700);
    await page.keyboard.up('Enter');
    check(
      'Long OK opens app actions without launching in ' + layout,
      (await state()).view === 'homeactions' &&
        (await page.evaluate(() => !__calls.some(c => c.method === 'launch')))
    );
    var beforeMove = await state();
    await act('homeaction.move');
    await nav(layout === 'list' ? 'down' : 'right');
    check(
      'Home move stays a draft in ' + layout,
      JSON.stringify((await state()).home) === JSON.stringify(beforeMove.home) &&
        (await state()).homeMove !== null &&
        (await state()).writes === beforeMove.writes
    );
    const cachedIcons = await page.evaluate(() => ZenoSourceIcons.cacheStats());
    await nav(layout === 'list' ? 'up' : 'left');
    await nav(layout === 'list' ? 'down' : 'right');
    check(
      'Moving reuses cached source vectors in ' + layout,
      await page.evaluate(b => ZenoSourceIcons.cacheStats().builds === b.builds, cachedIcons)
    );
    await nav('ok');
    check(
      'OK saves a Home move once in ' + layout,
      (await state()).homeMove === null &&
        (await state()).writes === beforeMove.writes + 1 &&
        (layout === 'grid'
          ? JSON.stringify((await state()).desktop.positions) !== JSON.stringify(beforeMove.desktop.positions)
          : JSON.stringify((await state()).home) !== JSON.stringify(beforeMove.home))
    );
    var committed = await state();
    await holdHome('DemoApps12.Videos');
    await act('homeaction.move');
    await nav(layout === 'list' ? 'up' : 'left');
    await nav('back');
    check(
      'Back cancels a Home move in ' + layout,
      JSON.stringify((await state()).home) === JSON.stringify(committed.home) &&
        (await state()).writes === committed.writes
    );
  }
  await page.evaluate(() => ZenoQA.look({ layout: 'grid' }));
  await ready();
  await holdHome('DemoApps12.Videos');
  await act('homeaction.move');
  await nav('right', 'home');
  check('Home cancels an unfinished move', (await state()).homeMove === null);

  await holdHome('DemoApps12.Videos');
  await act('homeaction.move');
  await nav('right');
  const failedMove = await state();
  await page.evaluate(() => {
    window.__restoreStorage = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'zeno.home.v1') throw Error('Full storage');
      return __restoreStorage.call(this, key, value);
    };
  });
  await nav('ok');
  check(
    'Failed Home placement keeps its draft and committed order',
    (await state()).homeMove !== null &&
      JSON.stringify((await state()).home) === JSON.stringify(failedMove.home)
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__restoreStorage;
  });
  await nav('ok');
  check('Home placement can retry after storage recovers', (await state()).homeMove === null);
  await holdHome('source.HDMI-1');
  await act('pcmenu.move');
  await nav('left', 'back');
  check('Source cards share direct Home moving', (await state()).homeMove === null);
  await holdHome('source.HDMI-1');
  await act('pcmenu.remove');
  check(
    'Source context removes only its Home shortcut',
    !(await state()).home.includes('source.HDMI-1') &&
      (await page.evaluate(() => ZenoSources.get('HDMI-1').mac === '10:20:30:40:50:60'))
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.inputs');
  await act('input.configure.HDMI-1');
  await act('input.home');
  await focusHome('DemoApps12.Videos');
  await page.evaluate(() => (__calls = []));
  await page.keyboard.press('Enter');
  check(
    'Short OK still launches an app once',
    (await page.evaluate(
      () => __calls.filter(c => c.method === 'launch' && c.id === 'DemoApps12.Videos').length
    )) === 1
  );
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.homelock');
  await act('home.lock.on');
  check('Home lock is enabled explicitly', (await state()).homeLocked);
  const lockedHome = (await state()).home;
  await holdHome('DemoApps12.Videos');
  check(
    'Locked app context hides edit actions',
    (await page
      .locator(
        '[data-action="homeaction.move"],[data-action="homeaction.remove"],[data-action="homeaction.color"]'
      )
      .count()) === 0
  );
  await nav('home');
  await holdHome('pc');
  check(
    'Locked sources keep WoL and hide moving/removal',
    (await page.locator('[data-action="pcmenu.wol"]').count()) === 1 &&
      (await page.locator('[data-action="pcmenu.move"],[data-action="pcmenu.remove"]').count()) === 0
  );
  check(
    'Source lock also guards direct profile edits',
    await page.evaluate(
      () =>
        !ZenoSources.set('HDMI-1', 'icon', 'laptop') &&
        !ZenoSources.set('HDMI-1', 'name', 'CHANGED') &&
        !ZenoSources.set('HDMI-1', 'badge', 'NEW')
    )
  );
  await page.evaluate(() => ZenoQA.scene('editor'));
  check(
    'Locked Home blocks the full editor',
    (await state()).view === 'message' && JSON.stringify((await state()).home) === JSON.stringify(lockedHome)
  );
  await page.reload();
  await ready();
  check('Home lock survives reload', (await state()).homeLocked);
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.homelock');
  await act('home.lock.off');
  check('Home can be unlocked', (await state()).homeLocked === false);
  await page.evaluate(() =>
    ZenoQA.look({ layout: 'grid', inkColor: 'ink', colorMode: 'manual', menuTheme: 'dark' })
  );
  await ready();
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.focus');
  check(
    'Grid hides the irrelevant Text/Glass selection toggle',
    (await page.locator('[data-action^="choice.focus."]').count()) === 0
  );
  check(
    'Glass materials have full-width single-line labels',
    await page
      .locator('.section-material .setting-name')
      .evaluateAll(
        es =>
          es.length === 3 &&
          es.every(e => getComputedStyle(e).whiteSpace === 'nowrap' && e.scrollWidth <= e.clientWidth + 1)
      )
  );
  check(
    'Graphite Home ink is independent of dark menu ink',
    await page.evaluate(
      () =>
        getComputedStyle(document.getElementById('home')).getPropertyValue('--zeno-ink').trim() ===
          '#172333' &&
        getComputedStyle(document.getElementById('stage')).getPropertyValue('--zeno-ink').trim() === '#f4f6fa'
    )
  );
  check(
    'Remote legend shares one baseline',
    await page.locator('#appearanceDesc .remote-hint').evaluateAll(es => {
      var ys = es.map(e => e.getBoundingClientRect().top);
      return es.length === 4 && Math.max(...ys) - Math.min(...ys) < 2;
    })
  );
  await nav('home');
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.cards');
  await act('cards.glass');
  check('Grid cards link to the glass material menu', (await state()).settingsGroup === 'focus');
  await nav('home');
  await page.evaluate(() => ZenoQA.look({ layout: 'list' }));
  await ready();
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.focus');
  check(
    'List keeps its Text/Glass selection toggle',
    (await page.locator('[data-action^="choice.focus."]').count()) === 2
  );
  await page.evaluate(() => ZenoQA.look({ menuTheme: 'light' }));
  await ready();
  check(
    'Light menu theme is explicit',
    (await page.locator('.stage').getAttribute('data-menu-theme')) === 'light'
  );
  await page.evaluate(() => ZenoQA.look({ menuTheme: 'dark', layout: 'grid' }));
  await ready();
  const languages = await page.evaluate(() => ZenoI18n.languages.map(l => l.id));
  check('All 30 requested languages are offered', languages.length === 30);
  check(
    'Languages are in alphabetical order',
    await page.evaluate(() => {
      var c = new Intl.Collator('it', { sensitivity: 'base' }),
        l = ZenoI18n.languages;
      return l.every((v, i) => !i || c.compare(l[i - 1].name, v.name) <= 0);
    })
  );
  for (const lang of languages) {
    await page.evaluate(
      lang => new Promise((resolve, reject) => ZenoI18n.set(lang, e => (e ? reject(e) : resolve()))),
      lang
    );
    await page.evaluate(() => ZenoQA.scene('settings'));
    await act('settings.category.system');
    check(
      'Language ' + lang + ' renders with preserved remote focus',
      await page.evaluate(
        lang => document.documentElement.lang === lang && ZenoQA.where().focusCount === 1,
        lang
      )
    );
    check(
      'Menu navigation preserves the document language for ' + lang,
      await page.evaluate(() => {
        var observer = new MutationObserver(() => {});
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        ZenoQA.nav('right');
        ZenoQA.nav('left');
        var writes = observer.takeRecords().length;
        observer.disconnect();
        return writes === 0;
      })
    );
    await act('settings.category.devices');
    await act('settings.group.inputs');
    await act('input.configure.HDMI-1');
    await act('input.appearance');
    await act('input.icon');
    check(
      'Source picker labels fit in ' + lang,
      await page.locator('.detail-sourceicon .appearance-rows .setting-choice').evaluateAll(es =>
        es.every(e => {
          var r = e.getBoundingClientRect(),
            copy = e.querySelector('.setting-copy').getBoundingClientRect(),
            mark = e.querySelector('.mark').getBoundingClientRect();
          return (
            copy.bottom <= r.bottom - 5 &&
            copy.top >= mark.bottom - 1 &&
            copy.left >= r.left &&
            copy.right <= r.right
          );
        })
      )
    );
  }
  await page.evaluate(() => new Promise(resolve => ZenoI18n.set('ar', resolve)));
  await page.evaluate(() => ZenoQA.scene('settings'));
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Arabo.png' });
  check(
    'Arabic has RTL text and directions',
    (await page.locator('.stage').evaluate(e => e.classList.contains('is-rtl'))) &&
      (await page.locator('.zeno-settings-content').evaluate(e => getComputedStyle(e).direction)) === 'rtl'
  );
  await page.reload();
  await ready();
  check('Selected language survives reload', (await page.evaluate(() => ZenoI18n.language())) === 'ar');
  await page.evaluate(() => new Promise(resolve => ZenoI18n.set('de', resolve)));
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.system');
  await act('settings.group.language');
  await nav(...Array(40).fill('down'));
  const focused = await page.locator('.setting-choice.is-focus').boundingBox();
  check(
    'Long language list keeps focus within the panel',
    focused && focused.y > 200 && focused.y + focused.height < 965
  );
  await page.evaluate(() => new Promise(resolve => ZenoI18n.set('it', resolve)));
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.category.devices');
  await act('settings.group.inputs');
  await act('input.configure.HDMI-1');
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Sorgenti.png' });
  check('No browser runtime errors', errors.length === 0);
  console.log(passed.length + ' refinement checks passed');
} finally {
  await preview.close();
}
