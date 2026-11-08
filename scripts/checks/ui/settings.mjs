// Settings: every look option, how choices are browsed and applied, and what
// happens when an image, a font or a save is slow or fails.
import { root } from '../../lib/browser.mjs';
import { WALLS, same } from './fixtures.mjs';

const SHOTS = root + '.local/qa/';
const ROTATION = ['fixed', 'open', '5', '15', '60'];
/* Stage class prefix for each look axis. */
const CLASS_PREFIX = {
  bg: 'bg',
  layout: 'l',
  apps: 'a',
  controls: 'u',
  focus: 'f',
  material: 'm',
  font: 'font'
};

async function resizeStage(t, width) {
  await t.page.setViewportSize({ width, height: (width * 9) / 16 });
  await t.waitFor(
    w => Math.abs(document.getElementById('stage').getBoundingClientRect().width - w) < 1,
    width
  );
}

export default async function settings(suite) {
  await suite.section('Every look option applies and shows the right images', async t => {
    await t.open();
    for (const bg of ['dark', 'light', 'photo'])
      for (const layout of ['list', 'dock'])
        for (const focus of ['type', 'glass']) {
          await t.look({ bg, layout, focus });
          const s = await t.state();
          t.expect(
            `Background ${bg}, layout ${layout} and focus ${focus} combine freely`,
            s.look.bg === bg && s.look.layout === layout && s.look.focus === focus && s.shown.bg === bg,
            s.look
          );
        }
    for (const axis of ['apps', 'controls'])
      for (const value of ['icons', 'both', 'text']) {
        await t.look({ [axis]: value });
        t.expect(`${axis} = ${value} sticks`, (await t.state()).look[axis] === value);
      }
    await t.look({ bg: 'photo', layout: 'dock', focus: 'glass', apps: 'both', controls: 'icons' });
    for (const material of ['soft', 'frost', 'tint']) {
      await t.look({ material });
      const s = await t.state();
      t.expect(
        `Glass ${material} is what is on screen`,
        s.shown.material === material && s.look.material === material
      );
    }

    const fonts = (await t.state()).fonts.available;
    t.expect('The default font is offered', fonts.includes('manrope'));
    for (const font of fonts) {
      await t.look({ font });
      const s = await t.state();
      t.expect(`Font ${font} is applied and shown`, s.look.font === font && s.shown.font === font);
      if (font !== 'newsreader') continue;
      for (const layout of ['list', 'dock'])
        for (const controls of ['icons', 'both', 'text']) {
          await t.look({ layout, controls });
          const notSerif = await t.run(() =>
            [
              ...document.querySelectorAll(
                '.home .clock, .home .u, .home .u-label, .home .ph-name, .home .tile .label, .home .app-focus-name, .home .util-focus-label'
              )
            ]
              .filter(e => !/Newsreader/.test(getComputedStyle(e).fontFamily))
              .map(e => ({ cls: e.className, font: getComputedStyle(e).fontFamily }))
          );
          t.expect(
            `Newsreader reaches all Home text (${layout}, ${controls})`,
            notSerif.length === 0,
            notSerif
          );
        }
    }
    await t.look({ font: 'manrope' });

    for (const wall of WALLS) {
      await t.look({ wall: wall.id });
      const s = await t.state();
      t.expect(
        `Photo ${wall.id} comes with its own materials`,
        s.shown.wall === wall.id && s.wallpaper === wall.id
      );
    }
    for (const layout of ['list', 'dock'])
      for (const width of [1920, 1280]) {
        await resizeStage(t, width);
        await t.look({ layout });
        const box = await t.run(() => {
          const b = document.getElementById('stage').getBoundingClientRect();
          return {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            focus: ZenoQA.where().focusCount
          };
        });
        t.expect(
          `${layout} fills a ${width}px screen with one focus`,
          Math.abs(box.x) < 1 &&
            Math.abs(box.y) < 1 &&
            Math.abs(box.width - width) < 1 &&
            Math.abs(box.height - (width * 9) / 16) < 1 &&
            box.focus === 1,
          box
        );
        await t.page.screenshot({
          path: SHOTS + 'production-' + layout + '-' + width + '.jpg',
          quality: 90
        });
      }
    const blur = await t.liveFilters();
    t.expect('Nothing uses live blur', blur.length === 0, blur);
    t.expect(
      'No design-lab leftovers in the page',
      await t.run(
        () =>
          !document.querySelector('[data-lab], #lab, #side') &&
          !document.querySelector('script[src*="prototype"]')
      )
    );
    const look = (await t.state()).look;
    await t.reload();
    t.expect('The look survives a reload', same((await t.state()).look, look));
  });

  await suite.section('Settings lists every choice', async t => {
    await t.open();
    await t.scene('settings');
    const groups = [
      'settings.group.background',
      'settings.group.layout',
      'settings.group.typography',
      'settings.group.focus',
      'settings.editor',
      'settings.group.samsung'
    ];
    const reachable = new Set();
    for (const category of ['home', 'appearance', 'applications', 'devices', 'system']) {
      await t.press('settings.category.' + category);
      (await t.qa('actions')).forEach(a => reachable.add(a));
    }
    t.expect(
      'The sidebar categories lead to every settings group',
      groups.every(g => reachable.has(g))
    );

    await t.look({ layout: 'list' });
    const options = {
      background: { bg: ['dark', 'light', 'photo'] },
      layout: {
        layout: ['list', 'dock', 'grid'],
        apps: ['icons', 'both', 'text'],
        controls: ['icons', 'both', 'text']
      },
      typography: { font: (await t.state()).fonts.available },
      focus: { focus: ['type', 'glass'], material: ['soft', 'frost', 'tint'] }
    };
    for (const [group, axes] of Object.entries(options)) {
      await t.group(group);
      const shown = await t.choices(),
        applied = (await t.state()).committed;
      for (const [axis, values] of Object.entries(axes)) {
        const rows = shown.filter(c => c.action?.startsWith('choice.' + axis + '.'));
        t.expect(
          `${group}: all ${axis} choices are on one screen`,
          same(rows.map(r => r.action).sort(), values.map(v => 'choice.' + axis + '.' + v).sort()),
          rows
        );
        t.expect(
          `${group}: only the applied ${axis} is ticked`,
          same(
            rows.filter(r => r.checked === 'true').map(r => r.action),
            ['choice.' + axis + '.' + applied[axis]]
          ),
          rows
        );
      }
      t.expect(
        `${group}: the category list is not repeated inside`,
        !(await t.qa('actions')).some(a => a.startsWith('settings.group.'))
      );
      await t.keys('back');
      const s = await t.state();
      t.expect(
        `${group}: Back lands on its category`,
        s.view === 'settings' && s.focusAction === 'settings.group.' + group,
        await t.where()
      );
    }

    await t.group('background');
    const background = await t.qa('actions');
    t.expect(
      'Background leads to the photo picker and rotation',
      background.includes('background.wallpaper') && background.includes('background.rotation'),
      background
    );
    await t.press('background.rotation');
    const rotation = await t.choices();
    t.expect(
      'All five rotation modes are on one screen',
      same(rotation.map(r => r.action).sort(), ROTATION.map(v => 'rotation.' + v).sort()),
      rotation
    );
    await t.keys('back');
    let s = await t.state();
    t.expect(
      'Back from rotation lands on its row',
      s.settingsGroup === 'background' && s.focusAction === 'background.rotation',
      await t.where()
    );
    await t.group('samsung');
    const samsung = await t.qa('actions');
    t.expect(
      'The Samsung group offers Samsung Home and TV settings',
      samsung.includes('samsung.home') && samsung.includes('samsung.settings')
    );
  });

  await suite.section('Moving through choices never applies them', async t => {
    await t.open();
    const path = [
      'right',
      'right',
      'down',
      'left',
      'left',
      'down',
      'right',
      'right',
      'down',
      'left',
      'up',
      'up',
      'up',
      'right'
    ];
    for (const group of ['background', 'layout', 'typography', 'focus', 'samsung']) {
      await t.group(group);
      const before = await t.snapshot(),
        seen = new Set();
      for (const key of path) {
        await t.keys(key);
        seen.add((await t.state()).focusAction);
        const now = await t.snapshot();
        if (!same(now, before))
          throw new Error(
            group + ': moving focus changed what is applied or saved: ' + JSON.stringify({ before, now })
          );
        if ((await t.where()).focusCount !== 1)
          throw new Error(group + ': moving focus left more or less than one focus');
      }
      t.expect(`${group}: arrows move between choices without applying or saving`, seen.size > 1, [...seen]);
      const first = (await t.choices())[0];
      if (first) {
        await t.page.locator('[data-action="' + first.action + '"]').hover();
        t.expect(`${group}: hovering with a pointer applies nothing`, same(await t.snapshot(), before));
      }
      await t.keys('back');
      t.expect(
        `${group}: Back leaves everything as it was`,
        same(await t.snapshot(), before) && (await t.state()).focusAction === 'settings.group.' + group
      );
    }
    t.expect('Browsing the Samsung group launches nothing', (await t.run(() => __tv.calls.length)) === 0);

    await t.group('background');
    await t.press('background.rotation');
    const before = await t.snapshot();
    await t.keys('down', 'down', 'up', 'right', 'left');
    t.expect('Moving through rotation modes saves nothing', same(await t.snapshot(), before));
    await t.keys('back');
    t.expect(
      'Back from rotation leaves the mode unchanged',
      same(await t.snapshot(), before) && (await t.state()).settingsGroup === 'background'
    );
  });

  await suite.section('The on-screen Back button remembers the focused choice', async t => {
    await t.open();
    await t.group('layout');
    const before = await t.snapshot(),
      target = await t.reachUnselectedChoice();
    await t.press('settings.back');
    let s = await t.state();
    t.expect(
      'On-screen Back returns to the Layout category',
      s.view === 'settings' && s.focusAction === 'settings.group.layout'
    );
    t.expect('On-screen Back applies nothing', same(await t.snapshot(), before));
    await t.press('settings.group.layout');
    s = await t.state();
    t.expect('Reopening focuses the choice last visited', s.focusAction === target.action, {
      expected: target.action,
      actual: s.focusAction
    });
    await t.keys('back');
    await t.press('settings.group.layout');
    t.expect('The remote Back key remembers it too', (await t.state()).focusAction === target.action);
  });

  await suite.section('OK applies a choice once and saves it', async t => {
    await t.open();
    const cases = [
      ['background', 'bg', ['dark', 'light', 'photo']],
      ['layout', 'layout', ['list', 'dock']],
      ['layout', 'apps', ['icons', 'text', 'both']],
      ['layout', 'controls', ['text', 'both', 'icons']],
      ['typography', 'font', (await t.state()).fonts.available],
      ['focus', 'focus', ['type', 'glass']],
      ['focus', 'material', ['frost', 'tint', 'soft']]
    ];
    for (const [group, axis, values] of cases) {
      if (axis === 'focus') await t.look({ layout: 'list' });
      await t.group(group);
      const current = await t.snapshot();
      await t.choose(axis, current.committed[axis]);
      await t.ready();
      t.expect(`${axis}: OK on the ticked choice writes nothing`, same(await t.snapshot(), current));
      for (const value of values) {
        const before = await t.snapshot();
        await t.choose(axis, value);
        await t.ready();
        const after = await t.snapshot(),
          rows = await t.choices();
        const changed = before.committed[axis] === value ? 0 : 1;
        const others = { ...after.committed, [axis]: before.committed[axis] };
        const onScreen = !Object.hasOwn(after.shown, axis) || after.shown[axis] === value;
        t.expect(
          `${axis}: OK on ${value} applies it with one save`,
          after.committed[axis] === value &&
            onScreen &&
            after.rendered.includes(CLASS_PREFIX[axis] + '-' + value) &&
            same(others, before.committed) &&
            after.writes === before.writes + changed &&
            after.storageAttempts - before.storageAttempts === changed &&
            rows.some(r => r.action === 'choice.' + axis + '.' + value && r.checked === 'true'),
          { before, after, rows }
        );
      }
      const applied = await t.snapshot();
      await t.keys('back');
      t.expect(
        `${axis}: Back keeps what was applied`,
        same(await t.snapshot(), applied) && (await t.state()).focusAction === 'settings.group.' + group
      );
    }

    await t.group('background');
    await t.press('background.rotation');
    const current = await t.snapshot();
    await t.press('rotation.' + current.committed.mode);
    t.expect('Rotation: OK on the ticked mode writes nothing', same(await t.snapshot(), current));
    for (const mode of ['open', '5', '15', '60', 'fixed']) {
      const before = await t.snapshot();
      await t.press('rotation.' + mode);
      const s = await t.state();
      t.expect(
        `Rotation: OK on ${mode} applies it with one save`,
        s.mode === mode &&
          (await t.saved()).mode === mode &&
          s.writes === before.writes + 1 &&
          (await t.choices()).some(r => r.action === 'rotation.' + mode && r.checked === 'true')
      );
    }

    await t.group('layout');
    const before = await t.snapshot(),
      target = await t.reachUnselectedChoice();
    const [, axis, value] = target.action.split('.');
    await t.page.keyboard.down('Enter');
    await t.page.keyboard.down('Enter');
    await t.ready();
    let s = await t.state();
    t.expect(
      'Holding OK applies the choice once',
      s.committed[axis] === value && s.writes === before.writes + 1
    );
    await t.page.keyboard.up('Enter');
    await t.page.keyboard.down('Escape');
    await t.page.keyboard.down('Escape');
    s = await t.state();
    t.expect(
      'Holding Back closes one level only',
      s.view === 'settings' && s.focusAction === 'settings.group.layout'
    );
    await t.page.keyboard.up('Escape');
  });

  await suite.section('Glass for panels can be chosen on any background', async t => {
    await t.open();
    await t.look({ material: 'tint' });
    for (const patch of [{ bg: 'dark' }, { bg: 'light' }, { bg: 'photo', layout: 'list', focus: 'type' }]) {
      await t.look(patch);
      await t.group('focus');
      const glass = (await t.choices()).filter(c => c.action.startsWith('choice.material.'));
      t.expect(
        'All three glass options are usable with ' + JSON.stringify(patch),
        glass.length === 3 &&
          glass.every(c => !c.disabled) &&
          glass.some(c => c.action === 'choice.material.tint' && c.checked === 'true'),
        glass
      );
      await t.choose('material', 'frost');
      await t.ready();
      t.expect('The glass choice is applied', (await t.state()).committed.material === 'frost');
      await t.choose('material', 'tint');
      await t.ready();
      await t.keys('back');
    }
  });

  await suite.section('Photo tools are disabled without a photo background', async t => {
    await t.open();
    for (const bg of ['dark', 'light']) {
      await t.look({ bg });
      await t.group('background');
      const before = await t.snapshot();
      for (const action of ['background.wallpaper', 'background.rotation']) {
        const el = t.page.locator('[data-action="' + action + '"]');
        t.expect(
          `${bg}: ${action} is marked unavailable`,
          (await el.getAttribute('aria-disabled')) === 'true'
        );
        const focus = (await t.state()).focusAction;
        await el.click({ force: true });
        const s = await t.state();
        t.expect(
          `${bg}: clicking ${action} does nothing`,
          same(await t.snapshot(), before) && s.settingsGroup === 'background' && s.focusAction === focus
        );
      }
      await t.walkChoices();
      t.expect(`${bg}: the remote skips the unavailable photo tools`, same(await t.snapshot(), before));
      const notes = await t.page.locator('.setting-reason:visible').allTextContents();
      t.expect(
        `${bg}: a note says how to enable them`,
        notes.some(n => /foto/i.test(n) && /fotograf|rotazione/i.test(n)),
        notes
      );
    }
  });

  await suite.section('Remembered focus on a disabled control moves somewhere usable', async t => {
    await t.open();
    await t.group('focus');
    await t.choose('material', 'tint');
    await t.ready();
    await t.keys('back');
    await t.press('settings.group.background');
    await t.choose('bg', 'dark');
    await t.ready();
    await t.keys('back');
    await t.press('settings.group.focus');
    const focus = await t.focusedChoice();
    t.expect(
      'The remembered glass choice is still usable',
      focus && !focus.disabled && focus.action === 'choice.material.tint',
      focus
    );
    t.expect('Switching background kept the glass choice', (await t.state()).look.material === 'tint');

    await t.look({ bg: 'photo' });
    await t.group('background');
    await t.press('background.rotation');
    await t.press('rotation.fixed');
    await t.look({ bg: 'dark' });
    const before = await t.snapshot();
    t.expect(
      'With every rotation mode disabled, focus goes to Back',
      (await t.state()).focusAction === 'settings.back'
    );
    const visited = await t.walkChoices();
    t.expect(
      '...and stays there',
      visited.every(a => a === 'settings.back') && same(await t.snapshot(), before),
      visited
    );
    await t.page.locator('[data-action="rotation.5"]').click({ force: true });
    t.expect(
      'Clicking a disabled mode does nothing',
      (await t.state()).focusAction === 'settings.back' && same(await t.snapshot(), before)
    );
    await t.keys('back');
    const back = await t.focusedChoice();
    t.expect(
      'Back skips the now disabled rotation row',
      (await t.state()).settingsGroup === 'background' &&
        back &&
        !back.disabled &&
        back.action.startsWith('choice.bg.'),
      back
    );
  });

  await suite.section('Back while images load cancels the choice', async t => {
    await t.open();
    await t.group('focus');
    const before = await t.snapshot(),
      gate = await t.holdRequests('**/*-field-frost.jpg');
    try {
      await t.choose('material', 'frost');
      await t.waitFor(() => !!ZenoQA.state().pending);
      t.expect('While loading, Home and storage are unchanged', same(await t.snapshot(), before));
      await t.keys('back');
      await t.ready();
      const s = await t.state();
      t.expect(
        'Back cancels and returns to the category',
        same(await t.snapshot(), before) && s.view === 'settings' && s.focusAction === 'settings.group.focus'
      );
      gate.release();
      await t.page.waitForLoadState('networkidle');
      t.expect(
        'Images arriving late apply nothing',
        gate.held.length > 0 && same(await t.snapshot(), before) && !(await t.state()).pending
      );
    } finally {
      gate.release();
      await t.page.unroute('**/*-field-frost.jpg');
    }
  });

  await suite.section('Back while a font loads cancels the choice', async t => {
    await t.open();
    await t.group('typography');
    const before = await t.snapshot(),
      pattern = '**/fonts/newsreader/*',
      gate = await t.holdRequests(pattern);
    try {
      await t.choose('font', 'newsreader');
      await t.waitFor(() => !!ZenoQA.state().pending);
      t.expect(
        'While the font loads, the old font stays applied and ticked',
        same(await t.snapshot(), before) &&
          (await t.choices()).some(c => c.action === 'choice.font.manrope' && c.checked === 'true')
      );
      await t.keys('back');
      await t.ready();
      t.expect(
        'Back cancels and returns to Typography',
        same(await t.snapshot(), before) && (await t.state()).focusAction === 'settings.group.typography'
      );
      gate.release();
      await t.page.waitForLoadState('networkidle');
      t.expect(
        'The font arriving late applies nothing',
        gate.held.length > 0 && same(await t.snapshot(), before) && !(await t.state()).pending
      );
      await t.group('typography');
      await t.choose('font', 'newsreader');
      await t.ready();
      const s = await t.state();
      t.expect(
        'Choosing the font again works',
        s.look.font === 'newsreader' && s.shown.font === 'newsreader' && s.writes === before.writes + 1
      );
    } finally {
      gate.release();
      await t.page.unroute(pattern);
    }
  });

  await suite.section('A failed choice can be retried', async t => {
    await t.open();
    await t.group('focus');
    const original = await t.snapshot(),
      frost = '**/*-field-frost.jpg';
    t.page.allowedFailures.push('-field-frost.jpg');
    await t.failRequests(frost);
    await t.choose('material', 'frost');
    await t.waitFor(() => !ZenoQA.state().pending);
    t.expect(
      'A missing image keeps the old glass applied and ticked',
      same(await t.snapshot(), original) &&
        (await t.choices()).some(c => c.action === 'choice.material.soft' && c.checked === 'true')
    );
    t.expect('A Retry control appears', (await t.qa('actions')).includes('settings.retry'));
    await t.page.unroute(frost);
    await t.press('settings.retry');
    await t.ready();
    let s = await t.state();
    t.expect(
      'Retry applies the same choice',
      s.look.material === 'frost' && s.shown.material === 'frost' && s.writes === original.writes + 1
    );

    await t.group('background');
    const before = await t.snapshot();
    await t.run(() => {
      __failWrites = true;
    });
    await t.choose('bg', 'light');
    await t.waitFor(() => !ZenoQA.state().pending);
    const failed = await t.snapshot();
    t.expect(
      'A failed save keeps the old background applied and ticked',
      same(failed.committed, before.committed) &&
        same(failed.shown, before.shown) &&
        failed.stored === before.stored &&
        failed.writes === before.writes &&
        (await t.choices()).some(c => c.action === 'choice.bg.photo' && c.checked === 'true')
    );
    await t.run(() => {
      __failWrites = false;
    });
    await t.press('settings.retry');
    await t.ready();
    s = await t.state();
    t.expect(
      'Retry saves it once',
      s.look.bg === 'light' && s.shown.bg === 'light' && s.writes === before.writes + 1
    );
  });

  await suite.section('Settings fit on 1080p and 720p screens', async t => {
    await t.open();
    for (const width of [1920, 1280]) {
      await resizeStage(t, width);
      for (const name of ['background', 'layout', 'typography', 'focus', 'samsung', 'rotation']) {
        await t.group(name === 'rotation' ? 'background' : name);
        if (name === 'rotation') await t.press('background.rotation');
        const boxes = await t.run(() => {
          const stage = document.getElementById('stage').getBoundingClientRect(),
            live = ZenoQA.actions();
          return [...document.querySelectorAll('#stage [data-action]')]
            .filter(e => live.includes(e.getAttribute('data-action')) && e.getClientRects().length)
            .map(e => {
              const r = e.getBoundingClientRect();
              const partsInside = [...e.querySelectorAll('.setting-name, .setting-tick svg')]
                .map(p => p.getBoundingClientRect())
                .every(
                  p => p.x >= r.x - 1 && p.y >= r.y - 1 && p.right <= r.right + 1 && p.bottom <= r.bottom + 1
                );
              const label = e.querySelector('.setting-name'),
                tick = e.querySelector('.setting-tick svg');
              const apart =
                !label ||
                !tick ||
                label.getBoundingClientRect().right <= tick.getBoundingClientRect().left + 1;
              return {
                action: e.getAttribute('data-action'),
                inside:
                  r.x >= stage.x - 1 &&
                  r.y >= stage.y - 1 &&
                  r.right <= stage.right + 1 &&
                  r.bottom <= stage.bottom + 1,
                fits:
                  e.scrollWidth <= e.clientWidth + 1 &&
                  e.scrollHeight <= e.clientHeight + 1 &&
                  partsInside &&
                  apart,
                width: r.width,
                height: r.height
              };
            });
        });
        t.expect(
          `${name} fits ${width}px without clipping`,
          boxes.length > 0 && boxes.every(b => b.inside && b.fits) && (await t.where()).focusCount === 1,
          boxes
        );
        await t.page.screenshot({
          path: SHOTS + 'settings-' + name + '-' + width + '.jpg',
          quality: 90
        });
      }
    }
    const blur = await t.liveFilters();
    t.expect('Settings use pre-rendered glass, no live blur', blur.length === 0, blur);
  });
}
