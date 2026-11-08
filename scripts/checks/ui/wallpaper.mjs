// The photo picker: browsing previews without saving, OK applies, Back restores,
// and slow or failed images never leave a half-applied wallpaper.
import { root } from '../../lib/browser.mjs';
import { WALLS, same } from './fixtures.mjs';

const SHOTS = root + '.local/qa/';
const choose = id => 'wallpaper.choose.' + id;
const LAST = WALLS[WALLS.length - 1];

/* Readers for the picker, bound to a session. */
function picker(t) {
  return {
    settled: id => t.waitFor(want => !ZenoQA.state().pending && ZenoQA.state().shown.wall === want, id),
    rowInView: id =>
      t.waitFor(want => {
        const list = document.querySelector('.wallpaper-list'),
          row = document.querySelector('[data-action="wallpaper.choose.' + want + '"]');
        if (!list || !row || getComputedStyle(row).visibility === 'hidden') return false;
        const box = list.getBoundingClientRect(),
          r = row.getBoundingClientRect();
        return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      }, id),
    /* Saved preferences plus the Settings backdrop image. */
    saved: () =>
      t.run(() => {
        const s = ZenoQA.state(),
          bg = document.getElementById('sheetBg'),
          veil = document.querySelector('.sheet-veil');
        const b = getComputedStyle(bg),
          v = getComputedStyle(veil);
        return {
          stored: localStorage.getItem('zeno.home.v1'),
          committed: s.committed,
          writes: s.writes,
          attempts: window.__storageAttempts,
          backdrop: {
            src: bg.currentSrc || bg.src,
            opacity: b.opacity,
            filter: b.filter,
            veil: v.background,
            veilOpacity: v.opacity
          }
        };
      }),
    ticked: () =>
      t.page
        .locator('.wallpaper-choice[aria-checked="true"]')
        .evaluateAll(els => els.map(e => e.getAttribute('data-action'))),
    /* The image currently mounted in every wallpaper slot. */
    images: () =>
      t.run(() =>
        Object.fromEntries(
          ['photo', 'matImg', 'phFieldImg', 'phFieldImgAlt', 'utFieldImg', 'utFieldImgAlt'].map(id => [
            id,
            document.getElementById(id).currentSrc || document.getElementById(id).src
          ])
        )
      ),
    frame: () =>
      t.run(() => {
        const e = document.getElementById('scene'),
          r = e.getBoundingClientRect(),
          css = getComputedStyle(e);
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          radius: css.borderRadius,
          transform: css.transform
        };
      }),
    list: () =>
      t.run(() => {
        const list = document.querySelector('.wallpaper-list'),
          box = list.getBoundingClientRect();
        const whole = [],
          partial = [],
          clipped = [];
        for (const row of list.querySelectorAll('.wallpaper-choice')) {
          const r = row.getBoundingClientRect(),
            action = row.getAttribute('data-action'),
            visible = getComputedStyle(row).visibility !== 'hidden';
          if (visible && r.bottom > box.top + 1 && r.top < box.bottom - 1) partial.push(action);
          if (visible && r.top >= box.top - 1 && r.bottom <= box.bottom + 1) whole.push(action);
          const parts = [...row.querySelectorAll('.setting-name, .setting-tick svg')].map(e =>
            e.getBoundingClientRect()
          );
          if (
            parts.some(
              p => p.x < r.x - 1 || p.right > r.right + 1 || p.y < r.y - 1 || p.bottom > r.bottom + 1
            )
          )
            clipped.push(action);
          const name = row.querySelector('.setting-name'),
            tick = row.querySelector('.setting-tick svg');
          if (name && tick && name.getBoundingClientRect().right > tick.getBoundingClientRect().left + 1)
            clipped.push(action);
        }
        return {
          whole,
          partial,
          clipped,
          focus: ZenoQA.state().focusAction,
          top: ZenoQA.state().wallpaperPicker.top,
          box: { x: box.x, y: box.y, width: box.width, height: box.height }
        };
      }),
    hint: () => t.page.locator('#appearanceDesc').innerText(),
    allFrom: (images, id) => Object.values(images).every(src => src.includes('/' + id))
  };
}

export default async function wallpaper(suite) {
  await suite.section('Picker basics: lazy thumbnails, preview, Back and a failed photo', async t => {
    await t.open();
    const p = picker(t);
    const fetched = await t.run(() => performance.getEntriesByType('resource').map(r => r.name));
    t.expect(
      'No thumbnails are fetched at startup',
      !fetched.some(u => /-thumb\./.test(u)),
      fetched.filter(u => /thumb/.test(u))
    );
    await t.wallpaperPicker();
    const original = (await t.saved()).wallpaper;
    await t.keys('down');
    await p.settled(WALLS[1].id);
    t.expect('Previewing a photo does not save it', (await t.saved()).wallpaper === original);
    await t.keys('back');
    await t.ready();
    let s = await t.state();
    t.expect('Back shows the saved photo again', s.shown.wall === original);
    t.expect(
      'Back lands on the Wallpaper row',
      s.settingsGroup === 'background' && s.focusAction === 'background.wallpaper'
    );

    await t.scene('home');
    const broken = WALLS.find(w => w.id !== original && w.id !== WALLS[1].id).id,
      pattern = '**/*' + broken + '-*.jpg';
    t.page.allowedFailures.push('/' + broken + '-');
    await t.failRequests(pattern);
    const before = await t.saved();
    await t.qa('look', { wall: broken });
    await t.waitFor(() => !ZenoQA.state().pending, null, { timeout: 15000 });
    t.expect(
      'A photo whose images fail keeps the old one saved and shown',
      same(await t.saved(), before) && (await t.state()).shown.wall === original
    );
    await t.page.unroute(pattern);
    await t.look({ wall: broken });
    t.expect('The same photo works once its images load', (await t.state()).shown.wall === broken);
  });

  await suite.section('Picker layout on 1080p and 720p', async t => {
    await t.open();
    const p = picker(t);
    for (const width of [1920, 1280])
      for (const layout of ['list', 'dock']) {
        const tag = `${layout}, ${width}px`;
        await t.scene('home');
        await t.look({ layout });
        await t.page.setViewportSize({ width, height: (width * 9) / 16 });
        await t.waitFor(
          w => Math.abs(document.getElementById('stage').getBoundingClientRect().width - w) < 1,
          width
        );
        await t.group('background');
        const frame = await p.frame(),
          before = await p.saved();
        await t.press('background.wallpaper');
        await t.waitFor(() => ZenoQA.state().view === 'wallpaper');
        const names = await t.page.locator('.wallpaper-choice .setting-name').allTextContents();
        t.expect(
          `Every photo is listed by name (${tag})`,
          same(
            names,
            WALLS.map(w => w.name)
          ),
          names
        );
        t.expect(`Opening the picker keeps the Home preview frame (${tag})`, same(await p.frame(), frame));
        const list = await p.list();
        t.expect(
          `About six rows are visible and nothing is clipped (${tag})`,
          list.whole.length >= 5 &&
            list.whole.length <= 6 &&
            list.partial.length <= 7 &&
            list.clipped.length === 0 &&
            list.whole.includes(list.focus) &&
            (await t.where()).focusCount === 1,
          list
        );
        await t.keys('down', 'down');
        await p.settled(WALLS[2].id);
        t.expect(
          `Browsing saves nothing and keeps the Settings backdrop (${tag})`,
          same(await p.saved(), before)
        );
        t.expect(`Browsing keeps the same preview frame (${tag})`, same(await p.frame(), frame));
        const s = await t.state();
        t.expect(
          `The tick stays on the saved photo while focus moves (${tag})`,
          same(await p.ticked(), [choose(before.committed.wall)]) &&
            s.focusAction === choose(WALLS[2].id) &&
            s.shown.wall === WALLS[2].id &&
            (await t.where()).focusCount === 1
        );
        await t.page.screenshot({
          path: SHOTS + 'wallpaper-' + layout + '-' + width + '.jpg',
          quality: 90
        });
        await t.keys('back');
        await t.ready();
        const after = await t.state();
        t.expect(
          `Back lands on the Wallpaper row with the saved photo (${tag})`,
          after.settingsGroup === 'background' &&
            after.focusAction === 'background.wallpaper' &&
            after.shown.wall === before.committed.wall &&
            same(await p.frame(), frame)
        );
      }
  });

  await suite.section('OK applies in place; Back keeps the last applied photo', async t => {
    await t.open();
    const p = picker(t);
    await t.wallpaperPicker();
    const before = await p.saved();
    t.expect('No "apply" hint while the saved photo is focused', !/applica.*fotograf/i.test(await p.hint()));
    await t.keys('down');
    await p.settled(WALLS[1].id);
    t.expect('Focusing another photo saves nothing', same(await p.saved(), before));
    t.expect('A hint explains that OK applies it', /applica.*fotograf/i.test(await p.hint()));
    await t.keys('ok');
    await t.ready();
    const applied = await p.saved();
    t.expect(
      'OK applies it once and stays in the picker',
      (await t.state()).view === 'wallpaper' &&
        applied.committed.wall === WALLS[1].id &&
        applied.writes === before.writes + 1 &&
        applied.attempts === before.attempts + 1 &&
        same(await p.ticked(), [choose(WALLS[1].id)])
    );
    t.expect('The hint goes away once applied', !/applica.*fotograf/i.test(await p.hint()));
    t.expect(
      'The Settings backdrop switches to the new photo',
      applied.backdrop.src.includes('/' + WALLS[1].id + '-') &&
        /field-(blur|frost|clear)\.jpg$/.test(applied.backdrop.src)
    );
    await t.keys('ok');
    await t.page.keyboard.down('Enter');
    await t.page.keyboard.down('Enter');
    await t.page.keyboard.up('Enter');
    t.expect('More OKs on the applied photo do nothing', same(await p.saved(), applied));
    await t.keys('down');
    await p.settled(WALLS[2].id);
    await t.keys('back');
    await t.ready();
    let s = await t.state();
    t.expect(
      'Back shows the last applied photo',
      s.shown.wall === WALLS[1].id &&
        same(await p.saved(), applied) &&
        s.focusAction === 'background.wallpaper'
    );
    await t.press('background.wallpaper');
    s = await t.state();
    t.expect(
      'Reopening starts on the applied photo',
      s.focusAction === choose(WALLS[1].id) && s.wallpaperPicker.candidate === WALLS[1].id
    );
    const row = t.page.locator('[data-action="' + choose(WALLS[3].id) + '"]');
    await row.hover();
    t.expect(
      'Hovering a row neither applies nor previews it',
      same(await p.saved(), applied) && (await t.state()).shown.wall === WALLS[1].id
    );
    await row.click();
    await t.ready();
    s = await t.state();
    t.expect(
      'Clicking a row applies it once',
      s.committed.wall === WALLS[3].id && s.writes === applied.writes + 1 && s.view === 'wallpaper'
    );
    await t.press('wallpaper.back');
    await t.ready();
    s = await t.state();
    t.expect(
      'The on-screen Back lands on the Wallpaper row',
      s.settingsGroup === 'background' &&
        s.focusAction === 'background.wallpaper' &&
        s.shown.wall === WALLS[3].id
    );
  });

  await suite.section('Picker edges and scrolling', async t => {
    await t.open();
    const p = picker(t);
    await t.wallpaperPicker();
    const before = await p.saved();
    await t.keys('up');
    let s = await t.state();
    t.expect(
      'Up from the first photo goes to Back, not to the last photo',
      s.focusAction === 'wallpaper.back' && s.shown.wall === WALLS[0].id
    );
    t.expect('Back explains where it goes', /sfondo|torna/i.test(await p.hint()));
    await t.keys('down');
    t.expect('Down from Back returns to the photo', (await t.state()).focusAction === choose(WALLS[0].id));
    await t.keys(...Array(WALLS.length - 1).fill('down'));
    await p.settled(LAST.id);
    await p.rowInView(LAST.id);
    const bottom = await p.list();
    t.expect(
      'The last photo scrolls fully into view',
      bottom.whole.includes(choose(LAST.id)) && bottom.top > 0 && bottom.clipped.length === 0,
      bottom
    );
    await t.keys('down', 'down');
    t.expect(
      'Down at the end does not wrap',
      (await t.state()).focusAction === choose(LAST.id) && same(await p.saved(), before)
    );
    await t.keys('left');
    t.expect('Left from a scrolled row goes to Back', (await t.state()).focusAction === 'wallpaper.back');
    await t.keys('right');
    t.expect('Right from Back returns to that row', (await t.state()).focusAction === choose(LAST.id));
    const top = (await t.state()).wallpaperPicker.top;
    await t.keys(...Array(WALLS.length - 1 - top).fill('up'));
    await p.settled(WALLS[top].id);
    await t.keys('up');
    await p.settled(WALLS[top - 1].id);
    s = await t.state();
    t.expect(
      'Up from the top visible row keeps scrolling the list',
      s.focusAction === choose(WALLS[top - 1].id) && s.view === 'wallpaper'
    );
    await t.keys(...Array(top - 1).fill('up'));
    await p.settled(WALLS[0].id);
    await p.rowInView(WALLS[0].id);
    const head = await p.list();
    t.expect(
      'Back at the first photo the list is scrolled to the top',
      head.top === 0 && head.whole.includes(choose(WALLS[0].id)),
      head
    );
    await t.keys('up', 'up');
    t.expect(
      'Up stops at Back and nothing was saved',
      (await t.state()).focusAction === 'wallpaper.back' && same(await p.saved(), before)
    );
  });

  await suite.section('Fast browsing waits before loading; OK is never lost', async t => {
    await t.open();
    const p = picker(t);
    await t.wallpaperPicker();
    const before = await p.saved();
    const instant = await t.run(() => {
      const at = performance.now();
      ZenoQA.nav('down', 'down', 'down');
      return { at, action: ZenoQA.state().focusAction, shown: ZenoQA.state().shown.wall };
    });
    t.expect(
      'Focus moves at once while the preview waits',
      instant.action === choose(WALLS[3].id) && instant.shown === WALLS[0].id,
      instant
    );
    await p.settled(WALLS[3].id);
    const loads = await t.run(() =>
      performance.getEntriesByType('resource').map(r => ({ name: r.name, start: r.startTime }))
    );
    const photo = loads.find(r => r.name.endsWith('/wallpapers/' + WALLS[3].id + '.jpg'));
    t.expect('The preview starts loading only after focus rests', photo && photo.start - instant.at >= 100, {
      delay: photo && photo.start - instant.at
    });
    t.expect(
      'Photos skipped over are never loaded',
      !loads.some(r =>
        [WALLS[1].id, WALLS[2].id].some(
          id => r.name.endsWith('/wallpapers/' + id + '.jpg') || r.name.includes('/materials/' + id + '-')
        )
      )
    );
    t.expect('Browsing saved nothing', same(await p.saved(), before));
    await t.keys('down', 'ok');
    await t.waitFor(id => ZenoQA.state().committed.wall === id && !ZenoQA.state().pending, WALLS[4].id);
    const s = await t.state();
    t.expect(
      'OK pressed during the wait applies the focused photo once',
      s.writes === before.writes + 1 && s.shown.wall === WALLS[4].id && s.view === 'wallpaper'
    );
  });

  await suite.section('A newer preview cancels an older pending apply', async t => {
    await t.open();
    const p = picker(t);
    await t.wallpaperPicker();
    const before = await p.saved(),
      slow = WALLS[1].id,
      latest = WALLS[2].id,
      pattern = '**/wallpapers/' + slow + '.jpg';
    const gate = await t.holdRequests(pattern);
    try {
      await t.keys('down');
      await t.waitFor(id => ZenoQA.state().pending && ZenoQA.state().pending.target.wall === id, slow);
      await t.keys('ok');
      t.expect(
        'OK while loading is remembered, not yet saved',
        !!(await t.state()).wallpaperPicker.applyPending && same(await p.saved(), before)
      );
      await t.keys('down');
      await p.settled(latest);
      t.expect(
        'Moving on drops the remembered OK',
        !(await t.state()).wallpaperPicker.applyPending && same(await p.saved(), before)
      );
      t.expect('Every slot shows the newest photo', p.allFrom(await p.images(), latest), await p.images());
      gate.release();
      await t.page.waitForLoadState('networkidle');
      t.expect(
        'The slow photo arriving late changes nothing',
        gate.held.length > 0 &&
          (await t.state()).shown.wall === latest &&
          p.allFrom(await p.images(), latest) &&
          same(await p.saved(), before)
      );
      await t.keys('back');
      await t.ready();
      t.expect(
        'Back puts every slot back on the saved photo',
        p.allFrom(await p.images(), before.committed.wall)
      );
    } finally {
      gate.release();
      await t.page.unroute(pattern);
    }
  });

  await suite.section('Back while a photo loads cancels the apply', async t => {
    await t.open();
    const p = picker(t);
    await t.wallpaperPicker();
    await t.page.locator('[data-action="' + choose(WALLS[1].id) + '"]').click();
    await t.ready();
    const applied = await p.saved();
    for (const [index, how] of [
      [2, 'remote'],
      [3, 'pointer']
    ]) {
      if ((await t.state()).view !== 'wallpaper') await t.press('background.wallpaper');
      const id = WALLS[index].id,
        pattern = '**/wallpapers/' + id + '.jpg',
        gate = await t.holdRequests(pattern);
      try {
        await t.press(choose(id));
        await t.waitFor(() => !!ZenoQA.state().pending && !!ZenoQA.state().wallpaperPicker.applyPending);
        if (how === 'remote') await t.keys('back');
        else await t.page.locator('[data-action="wallpaper.back"]').click();
        await t.ready();
        const s = await t.state();
        t.expect(
          `Back (${how}) cancels the apply and returns to the Wallpaper row`,
          s.focusAction === 'background.wallpaper' &&
            s.shown.wall === applied.committed.wall &&
            same(await p.saved(), applied)
        );
        gate.release();
        await t.page.waitForLoadState('networkidle');
        t.expect(
          `Back (${how}): the photo arriving late changes nothing`,
          gate.held.length > 0 &&
            (await t.state()).shown.wall === applied.committed.wall &&
            same(await p.saved(), applied)
        );
      } finally {
        gate.release();
        await t.page.unroute(pattern);
      }
    }
  });

  await suite.section('A failed preview can be retried without saving', async t => {
    await t.open();
    const p = picker(t);
    await t.wallpaperPicker();
    const before = await p.saved();
    await t.keys('down');
    await p.settled(WALLS[1].id);
    const id = WALLS[2].id,
      pattern = '**/wallpapers/' + id + '.jpg';
    t.page.allowedFailures.push('/wallpapers/' + id + '.jpg');
    await t.failRequests(pattern);
    await t.keys('down');
    await t.waitFor(() => ZenoQA.actions().includes('wallpaper.retry'));
    t.expect(
      'After a failed preview the saved photo is shown, not the previous preview',
      (await t.state()).shown.wall === before.committed.wall &&
        same(await p.saved(), before) &&
        same(await p.ticked(), [choose(before.committed.wall)])
    );
    t.expect(
      'The failed photo is named and can be retried',
      (await t.state()).wallpaperPicker.candidate === id &&
        /impossibile|riprova/i.test(await t.page.locator('#appearance').innerText())
    );
    await t.page.unroute(pattern);
    await t.press('wallpaper.retry');
    await p.settled(id);
    t.expect(
      'Retrying a preview does not save it',
      same(await p.saved(), before) && !(await t.state()).wallpaperPicker.applyPending
    );
    t.expect('After the retry focus is back on that photo', (await t.state()).focusAction === choose(id));
    await t.keys('ok');
    await t.ready();
    const s = await t.state();
    t.expect('OK then applies it', s.committed.wall === id && s.writes === before.writes + 1);
  });

  await suite.section('Failed applies and saves keep the applied photo', async t => {
    await t.open();
    const p = picker(t);
    await t.wallpaperPicker();
    const before = await p.saved(),
      id = WALLS[2].id,
      pattern = '**/wallpapers/' + id + '.jpg';
    t.page.allowedFailures.push('/wallpapers/' + id + '.jpg');
    await t.failRequests(pattern);
    await t.press(choose(id));
    await t.waitFor(() => ZenoQA.actions().includes('wallpaper.retry'));
    t.expect(
      'A photo that fails to load is not applied, ticked or saved',
      same(await p.saved(), before) && same(await p.ticked(), [choose(before.committed.wall)])
    );
    await t.page.unroute(pattern);
    await t.press('wallpaper.retry');
    await t.ready();
    let s = await t.state();
    t.expect(
      'Retry still applies it, once, staying in the picker',
      s.committed.wall === id && s.writes === before.writes + 1 && s.view === 'wallpaper'
    );

    const applied = await p.saved(),
      next = WALLS[3],
      requests = [];
    t.page.on('request', r => {
      if (
        r.url().endsWith('/wallpapers/' + next.id + '.jpg') ||
        r.url().includes('/materials/' + next.id + '-')
      )
        requests.push(r.url());
    });
    await t.keys('down');
    await p.settled(next.id);
    const loaded = requests.length;
    await t.run(() => {
      __failWrites = true;
    });
    await t.keys('ok');
    await t.waitFor(() => ZenoQA.actions().includes('wallpaper.retry'));
    const failed = await p.saved();
    t.expect(
      'A save that fails keeps the applied photo, tick and backdrop',
      failed.stored === applied.stored &&
        same(failed.committed, applied.committed) &&
        same(failed.backdrop, applied.backdrop) &&
        failed.writes === applied.writes &&
        same(await p.ticked(), [choose(id)])
    );
    s = await t.state();
    t.expect(
      'After a failed save the applied photo is shown and the failed one is named',
      s.shown.wall === id &&
        p.allFrom(await p.images(), id) &&
        s.wallpaperPicker.candidate === next.id &&
        (await t.page.locator('#appearance').innerText()).includes(next.name)
    );
    await t.run(() => {
      __failWrites = false;
    });
    await t.press('wallpaper.retry');
    await t.ready();
    s = await t.state();
    t.expect(
      'Retry saves it exactly once',
      s.committed.wall === next.id && s.writes === applied.writes + 1 && s.view === 'wallpaper'
    );
    t.expect('Retry reuses the images already loaded', loaded > 0 && requests.length === loaded, requests);
  });

  await suite.section('A missing thumbnail keeps the row usable', async t => {
    await t.open();
    const p = picker(t),
      wall = WALLS[5],
      pattern = '**/wallpapers/' + wall.id + '-thumb.jpg';
    t.page.allowedFailures.push('/wallpapers/' + wall.id + '-thumb.jpg');
    await t.failRequests(pattern);
    await t.wallpaperPicker();
    await t.waitFor(id => {
      const slot = document.querySelector('[data-action="wallpaper.choose.' + id + '"] .wallpaper-thumb');
      return slot && slot.classList.contains('is-missing');
    }, wall.id);
    await t.keys(...Array(5).fill('down'));
    await p.settled(wall.id);
    const row = await t.run(id => {
      const el = document.querySelector('[data-action="wallpaper.choose.' + id + '"]'),
        slot = el.querySelector('.wallpaper-thumb'),
        img = slot.querySelector('img');
      const r = el.getBoundingClientRect(),
        b = slot.getBoundingClientRect();
      return {
        name: el.textContent,
        slotShown: getComputedStyle(slot).display !== 'none' && b.width > 0 && b.height > 0,
        ratio: b.width / b.height,
        inside: b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom,
        imageHidden:
          !img || getComputedStyle(img).display === 'none' || getComputedStyle(img).visibility === 'hidden'
      };
    }, wall.id);
    t.expect(
      'The row keeps its name and an empty 16:9 slot, with no broken-image icon',
      row.name.includes(wall.name) &&
        row.slotShown &&
        row.inside &&
        Math.abs(row.ratio - 16 / 9) < 0.05 &&
        row.imageHidden,
      row
    );
    await t.keys('ok');
    await t.ready();
    t.expect(
      'The full photo can still be applied',
      (await t.state()).committed.wall === wall.id && p.allFrom(await p.images(), wall.id)
    );
  });
}
