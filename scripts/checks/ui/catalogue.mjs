// The installed-app list and launching apps through the TV.
import { FAMILY, FAMILY_NAME, HOME_IDS, INSTALLED, LISTED_COUNT, SPOTIFY, appIdOf, same } from './fixtures.mjs';

export default async function catalogue(suite) {
  await suite.section('Installed apps and launching', async t => {
    await t.open();
    await t.allApps();
    const names = await t.page.locator('[data-action^="apps.open."] .label').allTextContents();
    t.expect('All apps hides services, Zeno itself and the second YouTube',
      names.length === LISTED_COUNT && names.filter(n => n === 'YouTube').length === 1
      && !names.includes('Zeno TV') && !names.includes('Background worker'), names);
    t.expect('App names are shown as text, markup and all',
      names.includes(FAMILY_NAME) && !(await t.run(() => window.__catalogXss)));
    t.expect('No made-up apps appear', !names.includes('Plex') && !names.includes('Jellyfin'));

    const launches = n => t.waitFor(count => __tv.calls.length === count, n);
    await t.press('apps.open.' + SPOTIFY);
    await t.press('appdetail.open');
    await t.waitFor(() => __tv.calls.length > 0);
    t.expect('An app from All apps launches by its installed ID', (await t.lastLaunch()).id === SPOTIFY);

    await t.returnFromApp();
    await t.scene('home');
    await t.press('home.app.netflix');
    await launches(2);
    t.expect('A built-in Home app launches its known TV ID', (await t.lastLaunch()).id === appIdOf('netflix'));

    await t.returnFromApp();
    await t.scene('home');
    await t.press('util.settings');
    await t.press('settings.group.samsung');
    await t.press('samsung.settings');
    await launches(3);
    const menu = await t.lastLaunch();
    t.expect('"TV settings" opens the TV menu app', menu.method === 'launch' && menu.id === 'org.tizen.menu', menu);

    await t.returnFromApp();
    await t.group('samsung');
    await t.press('samsung.home');
    await launches(4);
    t.expect('"Samsung Home" opens the stock home screen', (await t.lastLaunch()).id === 'com.samsung.tv.csfs');

    await t.returnFromApp();
    await t.group('samsung');
    await t.press('samsung.settings');
    await launches(5);
    t.expect('"TV settings" still opens the TV menu the second time', (await t.lastLaunch()).id === 'org.tizen.menu');

    await t.run(() => { window.dispatchEvent(new Event('focus')); __tv.launchFailure = true; });
    await t.scene('home');
    await t.press('home.app.netflix');
    await t.waitFor(() => ZenoQA.where().view === 'message');
    t.expect('A failed launch tells the user', /could not|unavailable|try again/i.test(await t.text()));
  });

  await suite.section('App list failure and retry', async t => {
    await t.open({ catalogFailure: true });
    await t.allApps();
    t.expect('A failed app list leaves Home as it was', same((await t.state()).dock, HOME_IDS));
    await t.run(() => { __tv.catalogFailure = false; });
    await t.press('apps.retry');
    await t.page.waitForSelector('[data-action="apps.open.' + FAMILY + '"]');
    t.expect('Retry shows the installed apps', (await t.page.locator('[data-action^="apps.open."]').count()) === LISTED_COUNT);
  });

  await suite.section('App icons from the TV and broken icons', async t => {
    const icon = (id, path) => INSTALLED.map(a => (a.id === id ? { ...a, iconPath: path } : a));
    await t.open({ catalog: icon(FAMILY, '/home/assets/icons/tv.svg') });
    await t.allApps();
    const row = id => '[data-action="apps.open.' + id + '"]';
    await t.waitFor(sel => { const img = document.querySelector(sel + ' img'); return img && img.complete && img.naturalWidth > 0; }, row(FAMILY));
    t.expect('An app without a built-in logo shows the icon the TV provides',
      await t.run(sel => { const img = document.querySelector(sel + ' img'); return !!img && getComputedStyle(img).display !== 'none' && img.parentNode.classList.contains('has-native-icon'); }, row(FAMILY)));

    t.page.allowedFailures.push('/missing-native-icon.png');
    await t.run(id => { __tv.catalog.find(a => a.id === id).iconPath = '/home/assets/icons/missing-native-icon.png'; }, FAMILY);
    await t.allApps();
    await t.waitFor(sel => { const img = document.querySelector(sel + ' img'); return img && img.src.includes('/missing-native-icon.png') && img.complete; }, row(FAMILY));
    const shown = await t.run(sel => {
      const el = document.querySelector(sel), mark = el.querySelector('.native-icon'), img = mark && mark.querySelector('img');
      return { imageDisplay: img && getComputedStyle(img).display, initials: mark && getComputedStyle(mark.firstChild).visibility, text: el.textContent };
    }, row(FAMILY));
    t.expect('A broken icon falls back to initials and the app name',
      shown.imageDisplay === 'none' && shown.initials === 'visible' && shown.text.includes('Family'), shown);
  });

  await suite.section('App list arriving after the screen was reopened', async t => {
    await t.open();
    await t.run(() => { __tv.holdCatalog = true; });
    await t.scene('settings');
    await t.press('settings.group.manager');
    await t.keys('back');
    await t.press('settings.group.manager');
    const asked = await t.run(() => __tv.pending.length);
    t.expect('Opening All apps twice asks the TV once', asked === 1, asked);
    await t.run(() => { __tv.holdCatalog = false; __tv.pending.shift().ok(__tv.catalog); });
    await t.waitFor(() => !ZenoQA.state().catalog.loading);
    const where = await t.where();
    t.expect('The late answer fills the reopened screen with one focus',
      where.view === 'apps' && (await t.state()).catalog.ids.includes(FAMILY) && where.focusCount === 1);
  });
}
