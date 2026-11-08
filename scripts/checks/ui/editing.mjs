// Changing which apps are on Home: every step saves at once, can be undone,
// and a failed save changes nothing.
import { FAMILY, FAMILY_NAME, same } from './fixtures.mjs';

export default async function editing(suite) {
  await suite.section('Editing Home: save, undo, move and limits', async t => {
    await t.open();
    await t.editor();
    const original = (await t.state()).dock;

    await t.removeFromHome('netflix');
    t.expect(
      'Removing an app saves at once and does not uninstall it',
      !(await t.saved()).dock.includes('netflix') &&
        (await t.run(() => __tv.catalog.some(a => a.id === 'org.tizen.netflix-app')))
    );
    t.expect(
      'Focus moves to the add button of the removed app',
      (await t.state()).focusAction === 'editor.add.netflix',
      (await t.state()).focusAction
    );
    await t.keys('ok');
    t.expect('Pressing OK again puts it back in the same place', same((await t.saved()).dock, original));

    await t.removeFromHome('netflix');
    await t.press('editor.undo');
    t.expect('Undo restores and saves the previous Home', same((await t.saved()).dock, original));

    await t.press('editor.move.netflix');
    await t.keys('down');
    t.expect('A move in progress is not saved', same((await t.saved()).dock, original));
    await t.keys('back');
    t.expect('Back drops the move in progress', same((await t.state()).dock, original));

    await t.press('editor.move.netflix');
    await t.keys('down', 'ok');
    const swapped = original.slice(),
      at = swapped.indexOf('netflix');
    [swapped[at], swapped[at + 1]] = [swapped[at + 1], swapped[at]];
    t.expect('A finished move is saved at once', same((await t.saved()).dock, swapped));

    await t.press('editor.add.' + FAMILY);
    let s = await t.state();
    t.expect(
      'Home can hold more than the eleven built-in apps',
      s.dock.length === 12 && s.dock.includes(FAMILY)
    );
    t.expect(
      'An installed app is pinned by its stable ID',
      (await t.saved()).dock.includes(FAMILY) && s.dock.length === 12
    );
    t.expect(
      'The pin keeps the app name for when the app list fails',
      (await t.saved()).appRecords.some(a => a.id === FAMILY && a.name === FAMILY_NAME)
    );
    await t.reload();
    t.expect('The pin survives a reload', (await t.state()).dock.includes(FAMILY));

    await t.editor();
    const all = (await t.state()).dock;
    for (const id of all.slice(1)) await t.removeFromHome(id);
    await t.removeFromHome(all[0]);
    t.expect(
      'The last app cannot be removed',
      same((await t.state()).dock, [all[0]]) && same((await t.saved()).dock, [all[0]])
    );
    t.expect('There is no Save button to forget', !/\bSave\b/.test(await t.text()));
  });

  await suite.section('Failed saves change nothing', async t => {
    await t.open();
    await t.editor();
    const before = await t.saved();
    await t.run(() => {
      window.__failWrites = true;
    });
    await t.removeFromHome('netflix');
    t.expect(
      'A removal that cannot be saved is not applied',
      same((await t.state()).dock, before.dock) && same(await t.saved(), before)
    );
    t.expect(
      'The failure is shown on screen',
      /non salvato|salvataggio non riuscito|nessuna modifica|riprova/i.test(await t.text())
    );
    await t.run(() => {
      window.__failWrites = false;
    });
    await t.keys('ok');
    t.expect('OK on the same control retries the save', !(await t.saved()).dock.includes('netflix'));

    await t.scene('home');
    const shown = await t.state(),
      stored = await t.saved();
    await t.run(() => {
      window.__failWrites = true;
    });
    await t.qa('look', { bg: shown.look.bg === 'light' ? 'dark' : 'light' });
    await t.waitFor(() => !ZenoQA.state().pending);
    t.expect(
      'A look change that cannot be saved is not shown either',
      (await t.state()).look.bg === shown.look.bg && same(await t.saved(), stored)
    );
  });
}
