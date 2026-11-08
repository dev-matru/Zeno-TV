// Starting up: reading saved preferences (current, older and broken) and staying
// usable when parts of the platform are missing.
import { FAMILY, WALLS, savedHome, same } from './fixtures.mjs';

export default async function startup(suite) {
  await suite.section('Saved preferences from earlier versions', async t => {
    for (const theme of ['list', 'shore', 'grid']) {
      await t.open({
        seed: savedHome({
          theme,
          dock: ['youtube', 'netflix'],
          wallpaper: WALLS[1].id,
          lastApp: 'youtube',
          mode: '15'
        })
      });
      const s = await t.state();
      t.expect(
        `"${theme}" keeps the app order, photo, rotation and last app`,
        same(s.dock, ['youtube', 'netflix']) &&
          s.wallpaper === WALLS[1].id &&
          s.mode === '15' &&
          s.lastApp === 'youtube',
        s
      );
      const wantList = theme === 'list';
      t.expect(
        `"${theme}" opens in the matching layout and background`,
        s.look.layout === (wantList ? 'list' : 'dock') && s.look.bg === (wantList ? 'dark' : 'photo'),
        s.look
      );
    }

    await t.open({
      seed: undefined,
      earlier: savedHome({ theme: 'list', dock: ['netflix'], lastApp: 'netflix' })
    });
    let s = await t.state();
    t.expect('A Home saved under an older key is picked up', s.dock.length === 1 && s.look.layout === 'list');
    await t.look({ controls: 'text' });
    t.expect('The next change is written under the current key', (await t.saved()).dock[0] === 'netflix');
    await t.reload();
    s = await t.state();
    t.expect('The migrated Home survives a reload', s.look.controls === 'text' && s.dock[0] === 'netflix');
  });

  await suite.section('Broken or invalid preferences', async t => {
    await t.open({
      seed: '{broken',
      earlier: savedHome({ dock: ['netflix'], lastApp: 'netflix' })
    });
    t.expect(
      'Unreadable current preferences fall back to the older key',
      same((await t.state()).dock, ['netflix'])
    );

    await t.open({
      seed: { dock: [], wallpaper: 'missing', mode: 'constructor', theme: 'constructor' }
    });
    const s = await t.state();
    t.expect(
      'Nonsense values give a usable, bounded Home',
      s.dock.length >= 1 &&
        s.dock.length <= 64 &&
        WALLS.some(w => w.id === s.wallpaper) &&
        ['fixed', 'open', '5', '15', '60'].includes(s.mode),
      s
    );

    await t.open({
      seed: savedHome({ dock: [FAMILY, 'netflix'], lastApp: FAMILY }),
      catalogFailure: true
    });
    await t.allApps();
    t.expect(
      'A pinned installed app stays on Home when the app list fails',
      (await t.state()).dock.includes(FAMILY)
    );
  });

  await suite.section('Missing platform features at startup', async t => {
    await t.open({ noFontAPI: true });
    t.expect(
      'Without the font loading API Home still starts with the default font and one focus',
      (await t.state()).look.font === 'manrope' && (await t.where()).focusCount === 1
    );

    await t.open({ seed: savedHome({ mode: 'open' }), storageFailure: true });
    t.expect(
      'If saving the next photo fails, the previous photo is kept',
      (await t.state()).wallpaper === WALLS[0].id && (await t.saved()).wallpaper === WALLS[0].id
    );
  });
}
