// Real key presses, photo rotation over time and running in a plain browser.
import { CINEMA, WALLS, savedHome } from './fixtures.mjs';

export default async function input(suite) {
  await suite.section('Held keys act once; Back goes up one level at a time', async t => {
    await t.open();
    await t.editor();
    await t.removeFromHome(CINEMA);
    await t.page.keyboard.down('Enter');
    await t.page.keyboard.down('Enter');
    let s = await t.state();
    t.expect(
      'Holding OK re-adds the app once and removes nothing',
      s.dock.includes(CINEMA) && s.dock.length === 11
    );
    await t.page.keyboard.up('Enter');
    await t.page.keyboard.down('Escape');
    await t.page.keyboard.down('Escape');
    t.expect(
      'Holding Back closes only the editor',
      (await t.where()).view === 'settings' && (await t.state()).focusAction === 'settings.editor'
    );
    await t.page.keyboard.up('Escape');
    await t.page.keyboard.press('Escape');
    t.expect('Another Back reaches Home', (await t.where()).view === 'home');
  });

  await suite.section('Photo rotation runs only while Home is visible', async t => {
    await t.open({ minuteMs: 120 }); // one "minute" lasts 120 ms here
    const photo = async () => (await t.state()).wallpaper;
    const changesFrom = id => t.waitFor(was => ZenoQA.state().wallpaper !== was, id, { timeout: 4000 });
    const idle = () => t.page.waitForTimeout(850);

    await t.group('background');
    await t.press('background.rotation');
    await t.press('rotation.5');
    await t.scene('home');
    await changesFrom(await photo());
    t.expect('Rotation changes the photo on Home', (await t.state()).mode === '5');

    await t.scene('settings');
    const inSettings = await photo();
    await idle();
    t.expect('Rotation waits while Settings is open', (await photo()) === inSettings);

    await t.scene('home');
    await t.run(() => __setHidden(true));
    const hidden = await photo();
    await idle();
    t.expect('Rotation waits while the app is in the background', (await photo()) === hidden);
    await t.run(() => __setHidden(false));
    await changesFrom(hidden);

    await t.look({ bg: 'dark' });
    const flat = await photo();
    await idle();
    t.expect('A plain background keeps the photo and does not rotate', (await photo()) === flat);
    await t.look({ bg: 'photo', layout: 'list' });
    await changesFrom(await photo());
    t.expect('The List layout rotates too', (await t.state()).look.layout === 'list');

    await t.run(() => {
      __setHidden(true);
      document.getElementById('stage').blur();
      __setHidden(false);
      window.dispatchEvent(new Event('focus'));
    });
    const focus = (await t.state()).focusAction;
    await t.page.keyboard.press('ArrowDown');
    t.expect(
      'Coming back from another app, the remote works straight away',
      (await t.state()).focusAction !== focus && (await t.where()).focusCount === 1
    );
    const clock = await t.page.locator('#caption .clock').textContent();
    t.expect('The clock is 24-hour, without AM/PM', /^\s*\d{1,2}:\d{2}\s*$/.test(clock), clock);
  });

  await suite.section('"New photo at every start" and the plain browser', async t => {
    await t.open({ seed: savedHome({ mode: 'open' }) });
    t.expect('A cold start shows the next photo', (await t.state()).wallpaper === WALLS[1].id);
    const first = (await t.state()).wallpaper;
    await t.run(() => {
      __setHidden(true);
      __setHidden(false);
      window.dispatchEvent(new Event('focus'));
    });
    t.expect('Returning from another app does not count as a start', (await t.state()).wallpaper === first);
    await t.reload();
    t.expect('The next cold start moves on again', (await t.state()).wallpaper === WALLS[2].id);

    await t.open({ mock: false });
    await t.press('home.app.' + CINEMA);
    await t.waitFor(() => ZenoQA.where().view === 'message');
    t.expect('In a plain browser, launching says it needs the TV', /TV/.test(await t.text()));
    await t.keys('back');
    await t.allApps();
    t.expect(
      'In a plain browser, All apps says the same and lists nothing',
      /TV/.test(await t.text()) && !(await t.page.locator('[data-action^="apps.open."]').count())
    );
  });
}
