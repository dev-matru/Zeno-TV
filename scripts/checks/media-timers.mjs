import assert from 'node:assert/strict';
import { parse } from 'acorn';
import { readFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';
for (const f of ['main.js', 'src/home/widgets.js', 'src/core/remote-keys.js'])
  parse(readFileSync(root + 'app/' + f, 'utf8'), { ecmaVersion: 5 });
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
  await page.addInitScript(() => {
    ZENO_OFFLINE_TEST = true;
    window.registered = [];
    window.tizen = {
      tvinputdevice: {
        getSupportedKeys() {
          return [
            { name: 'MediaPlayPause', code: 10252 },
            { name: 'MediaPlay', code: 415 },
            { name: 'MediaPause', code: 19 },
            { name: 'MediaStop', code: 413 },
            { name: 'MediaRewind', code: 412 },
            { name: 'MediaFastForward', code: 417 },
            { name: 'MediaTrackNext', code: 10233 },
            { name: 'MediaTrackPrevious', code: 10232 },
            { name: 'Info', code: 457 }
          ];
        },
        registerKey(k) {
          if (!registered.includes(k)) registered.push(k);
        },
        unregisterKey(k) {
          registered = registered.filter(n => n !== k);
        }
      }
    };
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (window.failWidgets && k === 'zeno.widgets.v1') throw Error('Test quota');
      return original.call(this, k, v);
    };
    window.audioLoads = 0;
    window.testAudios = [];
    const A = window.Audio;
    window.Audio = function (...args) {
      audioLoads++;
      var a = new A(...args);
      testAudios.push(a);
      return a;
    };
  });
  await page.goto(preview.baseURL + '/home/');
  const ready = () => page.waitForFunction(() => window.ZenoQA && ZenoQA.ready());
  await ready();
  const state = () => page.evaluate(() => ZenoQA.state());
  const nav = keys => page.evaluate(k => ZenoQA.nav(k), keys);
  const home = () => page.evaluate(() => ZenoQA.scene('home'));
  const settings = () => page.evaluate(() => ZenoQA.scene('settings'));
  const act = async a => {
    check(await page.evaluate(a => !!ZenoQA.activate(a), a), 'Missing action ' + a);
    await ready();
  };
  async function holdClock() {
    await home();
    const path = await page.evaluate(() => {
      var s = ZenoQA.state(),
        q = [[s.selected, []]],
        seen = new Set([s.selected]);
      while (q.length) {
        var [at, p] = q.shift();
        if (at === 'widget.clock') return p;
        for (var k of ['up', 'down', 'left', 'right']) {
          var next = ZenoDesktop.neighbour(s.desktop, s.home, at, k);
          if (!seen.has(next)) {
            seen.add(next);
            q.push([next, p.concat(k)]);
          }
        }
      }
    });
    await nav(path);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(700);
    await page.keyboard.up('Enter');
  }
  async function type(field, value) {
    await act(field);
    await act('keyboard.clear');
    for (const c of value) await act('keyboard.' + c);
    await act('keyboard.save');
  }
  const media = async (code, down = true, repeat = false) =>
    page.evaluate(
      ({ code, down, repeat }) =>
        document.dispatchEvent(
          new KeyboardEvent(down ? 'keydown' : 'keyup', {
            keyCode: code,
            which: code,
            bubbles: true,
            cancelable: true,
            repeat
          })
        ),
      { code, down, repeat }
    );
  async function pressMedia(code) {
    await media(code);
    await media(code, false);
  }
  // Real setting row drives all three command-card variants.
  for (const size of ['full', 'half', 'quarter'])
    for (const mode of ['icons', 'text', 'both']) {
      await page.evaluate(size => {
        var d = ZenoQA.state().desktop;
        d = ZenoDesktop.resize(d, ZenoQA.state().home, 'widget.sources', size);
        d = ZenoDesktop.resize(d, ZenoQA.state().home, 'widget.settings', size);
        ZenoQA.look({ desktop: d });
      }, size);
      await ready();
      await settings();
      await act('settings.group.layout');
      await act('choice.controls.' + mode);
      await home();
      for (const kind of ['sources', 'settings']) {
        const visibility = await page.locator('[data-widget="' + kind + '"] .desk-command').evaluate(e => ({
          icon:
            !!e.querySelector('.ico').getClientRects().length &&
            getComputedStyle(e.querySelector('.ico')).display !== 'none',
          text: getComputedStyle(e.querySelector('span')).display !== 'none'
        }));
        check(
          visibility.icon === (mode !== 'text') && visibility.text === (mode !== 'icons'),
          'Controls ' + size + '/' + mode + '/' + kind
        );
      }
    }
  await holdClock();
  await act('homeaction.configure');
  await act('widget.seconds');
  await act('widget.open.handcolor');
  await act('widget.hand.#000000');
  check((await page.evaluate(() => ZenoWidgets.config().handColor)) === '#000000', 'Black seconds');
  await act('widget.hand.#ffffff');
  check((await page.evaluate(() => ZenoWidgets.config().handColor)) === '#ffffff', 'White seconds');
  await act('widget.hand.custom');
  await act('keyboard.clear');
  for (const c of '#12') await act('keyboard.' + c);
  await act('keyboard.save');
  check(
    (await state()).view === 'keyboard' &&
      (await page
        .locator('[data-slot="error"]')
        .innerText()
        .then(t => t.length > 0)),
    'Invalid HEX stays in keyboard'
  );
  await nav(['back']);
  await type('widget.hand.custom', '#123ABC');
  check((await page.evaluate(() => ZenoWidgets.config().handColor)) === '#123abc', 'Custom HEX saved');
  await act('widget.hand.wallpaper');
  await home();
  let colors = [];
  for (const wall of ['misty', 'amber']) {
    await page.evaluate(wall => ZenoQA.look({ wall }), wall);
    await ready();
    colors.push(await page.locator('.widget-clock-seconds').evaluate(e => getComputedStyle(e).color));
  }
  check(colors[0] !== colors[1], 'Automatic seconds follow wallpaper accent');
  await page.evaluate(() => ZenoExtras.set('clock', 'analog'));
  check(
    await page.locator('.widget-hand-second').evaluate(e => getComputedStyle(e).stroke.startsWith('rgb')),
    'Analog hand resolves cached accent'
  );
  await page.evaluate(() => ZenoExtras.set('clock', 'digital'));
  // Custom exact-second saved timer and storage failure recovery.
  await home();
  await holdClock();
  await act('homeaction.open');
  await act('widget.open.timer');
  await act('timer.new');
  await type('timer.field.name', 'TEA');
  await type('timer.field.minutes', '7');
  await type('timer.field.seconds', '13');
  await type('timer.field.note', 'TISANA');
  await page.evaluate(() => (window.failWidgets = true));
  await act('timer.save');
  check(
    (await page.evaluate(() => ZenoWidgets.config().timers.length)) === 0,
    'Failed preset save is atomic'
  );
  await nav(['back']);
  await page.evaluate(() => (window.failWidgets = false));
  await act('timer.save');
  await nav(['back']);
  let preset = await page.evaluate(() => ZenoWidgets.config().timers[0]);
  check(
    preset.name === 'TEA' && preset.note === 'TISANA' && preset.seconds === 433,
    'Named timer saved to exact seconds'
  );
  await act('timer.start');
  check(
    await page.evaluate(() => {
      var c = ZenoWidgets.config();
      return (
        c.timerLabel === 'TEA' &&
        c.timerNote === 'TISANA' &&
        c.timer - Date.now() > 431000 &&
        c.timer - Date.now() <= 433000
      );
    }),
    'Start uses duration, name and note'
  );
  await nav(['back', 'back']);
  await act('widget.timer.stop');
  check(await page.evaluate(() => ZenoWidgets.config().timer === 0), 'Cancel active timer');
  await page.reload();
  await ready();
  check(
    await page.evaluate(
      id => ZenoWidgets.config().timers[0].id === id && ZenoWidgets.config().handColor === 'wallpaper',
      preset.id
    ),
    'Presets and accent mode survive reload'
  );
  await holdClock();
  await act('homeaction.open');
  await act('widget.open.timer');
  await act('timer.edit.' + preset.id);
  await type('timer.field.minutes', '0');
  await type('timer.field.seconds', '1');
  await act('timer.start');
  await page.waitForFunction(() => ZenoWidgets.lastTimer() && ZenoWidgets.lastTimer().name === 'TEA');
  await page.waitForFunction(
    () =>
      document.getElementById('sheetView').textContent.includes('TEA') &&
      document.getElementById('sheetView').textContent.includes('TISANA')
  );
  check(
    await page
      .locator('#sheetView')
      .innerText()
      .then(t => t.includes('TISANA')),
    'Completion includes saved name and note'
  );
  await home();
  await holdClock();
  await act('homeaction.open');
  await act('widget.open.timer');
  await act('timer.edit.' + preset.id);
  await act('timer.delete');
  check(await page.evaluate(() => ZenoWidgets.config().timers.length === 0), 'Saved timer deletion');
  check(
    await page.evaluate(
      () =>
        !ZenoWidgets.startTimer(0, 'Invalid', '') &&
        !ZenoWidgets.startTimer(86401, 'Invalid', '') &&
        !ZenoWidgets.startTimer(1.2, 'Invalid', '')
    ),
    'Duration bounds and integer seconds'
  );
  // No media start on seek/skip or disabled player. Only explicit Play starts audio.
  await home();
  check(
    (await page.evaluate(() => registered.filter(k => k.startsWith('Media')).length)) === 8,
    'SDK-supported transport keys registered'
  );
  const audioBefore = await page.evaluate(() => audioLoads);
  await pressMedia(10252);
  check((await page.evaluate(() => audioLoads)) === audioBefore, 'Disabled player ignores media Play');
  await settings();
  await act('settings.group.desktopwidgets');
  await act('desktop.widget.player');
  await home();
  await pressMedia(417);
  await pressMedia(10233);
  check((await page.evaluate(() => audioLoads)) === audioBefore, 'Seek and next never start an idle player');
  await page.mouse.click(1900, 1000);
  await pressMedia(10252);
  await page.waitForFunction(() => ZenoWidgets.player().playing && ZenoWidgets.player().duration > 0);
  check(await page.evaluate(() => ZenoWidgets.player().tracks === 1), 'Explicit Play/Pause starts demo');
  await media(10252);
  await media(10252, true, true);
  check(await page.evaluate(() => !ZenoWidgets.player().playing), 'Held Play/Pause toggles only once');
  await media(10252, false);
  await pressMedia(415);
  await page.waitForFunction(() => ZenoWidgets.player().playing);
  await pressMedia(19);
  check(await page.evaluate(() => !ZenoWidgets.player().playing), 'Separate Play and Pause are idempotent');
  await page.evaluate(() => ZenoWidgets.seekAudio(-100));
  await pressMedia(417);
  check(
    await page.evaluate(() => Math.abs(ZenoWidgets.player().position - 10) < 0.2),
    'Fast forward +10 seconds without resuming'
  );
  await pressMedia(412);
  check(await page.evaluate(() => ZenoWidgets.player().position < 0.2), 'Rewind −10 seconds');
  await pressMedia(10233);
  await pressMedia(10232);
  check(
    await page.evaluate(() => !ZenoWidgets.player().playing && ZenoWidgets.player().tracks === 1),
    'Single-track next/previous stay quiet'
  );
  await pressMedia(415);
  await page.waitForFunction(() => ZenoWidgets.player().playing);
  await pressMedia(413);
  check(
    await page.evaluate(() => !ZenoWidgets.player().playing && ZenoWidgets.player().position < 0.2),
    'Stop pauses and rewinds'
  );
  await page.evaluate(() => ZenoRemote.set('MediaPlayPause', 'settings'));
  await pressMedia(10252);
  check(
    (await state()).view === 'settings' && (await page.evaluate(() => !ZenoWidgets.player().playing)),
    'Existing explicit shortcut takes priority'
  );
  await page.evaluate(() => ZenoRemote.set('MediaPlayPause', 'default'));
  check(
    await page.evaluate(() => registered.includes('MediaPlayPause')),
    'Default restores media registration'
  );
  check(errors.length === 0, 'No runtime errors: ' + errors);
  await page.screenshot({ path: root + '.local/qa/preview-Zeno-Timer.png' });
  console.log(count + ' media, exact-second timer, HEX/accent and command-card checks passed.');
} finally {
  await preview.close();
}
