// The music player: repeat, in order and shuffle, the playlist you pick, and the
// cross-fade between tracks and when a track starts again.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';

const preview = await openPreview({ publicOnly: true });
const song = readFileSync(root + 'app/assets/audio/pad.m4a');
let count = 0;
const check = (v, m) => {
  assert(v, m);
  count++;
};

try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Two downloaded tracks, served by a stand-in for the service on the TV.
  await page.route(/127\.0\.0\.1:4796\/music\//, route => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
    if (!range)
      return route.fulfill({
        status: 200,
        contentType: 'audio/mp4',
        headers: { 'Accept-Ranges': 'bytes' },
        body: song
      });
    const from = Number(range[1]),
      to = range[2] ? Math.min(Number(range[2]), song.length - 1) : song.length - 1;
    route.fulfill({
      status: 206,
      contentType: 'audio/mp4',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes ' + from + '-' + to + '/' + song.length },
      body: song.subarray(from, to + 1)
    });
  });
  await page.addInitScript(() => {
    ZENO_OFFLINE_TEST = true;
    if (!localStorage.getItem('zeno.music.v1'))
      localStorage.setItem(
        'zeno.music.v1',
        JSON.stringify({
          tracks: [
            { id: 'ln-aaaaaaaaaaaa', title: 'Rain test', ext: 'm4a', origin: 'link', added: 1 },
            { id: 'ln-bbbbbbbbbbbb', title: 'Song test', ext: 'm4a', origin: 'link', added: 2 }
          ]
        })
      );
    window.testAudios = [];
    const A = window.Audio;
    window.Audio = function (...args) {
      const a = new A(...args);
      testAudios.push(a);
      return a;
    };
  });
  const ready = () => page.waitForFunction(() => window.ZenoQA && ZenoQA.ready());
  const act = async a => {
    check(await page.evaluate(a => !!ZenoQA.activate(a), a), 'Missing action ' + a);
    await ready();
  };
  const P = () => page.evaluate(() => ZenoWidgets.player());
  const ids = () => page.evaluate(() => ZenoWidgets.tracks().map(t => t.id));
  const playing = () => page.evaluate(() => testAudios.filter(a => !a.paused && a.src).length);

  await page.goto(preview.baseURL + '/home/');
  await ready();
  const all = await ids();
  check(all.length === 6 && all.includes('ln-bbbbbbbbbbbb'), 'Built-in and downloaded tracks: ' + all);

  // Repeat is the default; built-in loops repeat natively, without a gap.
  check((await P()).mode === 'one' && (await P()).loop, 'Repeat the track by default');
  check(await page.evaluate(() => !ZenoWidgets.setMode('loop')), 'Unknown modes are refused');
  await page.mouse.click(1900, 1000);
  await page.evaluate(() => ZenoWidgets.media('MediaPlay'));
  await page.waitForFunction(() => ZenoWidgets.player().playing && ZenoWidgets.player().duration > 0);
  check(
    await page.evaluate(() => testAudios.some(a => !a.paused && a.loop)),
    'Built-in loop uses the native loop'
  );

  // The playlist: everything by default, then the tracks you pick, at least one.
  check((await P()).rotation === 6, 'Every track is in the playlist');
  check(await page.evaluate(() => ZenoWidgets.toggleRotation('piano')), 'Leave one track out');
  check((await P()).rotation === 5, 'Five tracks left');
  check(
    await page.evaluate(() => !ZenoWidgets.tracks().find(t => t.id === 'piano').inRotation),
    'The track left out is marked'
  );
  check(
    await page.evaluate(
      () =>
        ZenoWidgets.setRotation(['lounge', 'ln-bbbbbbbbbbbb']) &&
        ZenoWidgets.toggleRotation('lounge') &&
        !ZenoWidgets.toggleRotation('ln-bbbbbbbbbbbb')
    ),
    'The last track stays in the playlist'
  );
  check(!(await page.evaluate(() => ZenoWidgets.setRotation(['Bad id']))), 'Invalid ids are refused');

  // In order: Next follows the playlist and skips the tracks left out.
  await page.evaluate(() => ZenoWidgets.setRotation(['lounge', 'pad', 'ln-aaaaaaaaaaaa']));
  await page.evaluate(() => ZenoWidgets.setMode('order'));
  check(!(await P()).loop, 'In order does not repeat');
  const order = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => ZenoWidgets.media('MediaTrackNext'));
    order.push((await P()).id);
  }
  check(
    order.join() === 'pad,ln-aaaaaaaaaaaa,lounge,pad',
    'Next goes through the playlist in order: ' + order
  );
  await page.waitForFunction(() => !ZenoWidgets.player().fading);
  check((await P()).playing && (await playing()) === 1, 'One track playing after a manual change');

  // Shuffle: every track once before any repeats, and Previous goes back.
  await page.evaluate(() => ZenoWidgets.setRotation([]));
  await page.evaluate(() => ZenoWidgets.setMode('shuffle'));
  const start = (await P()).id,
    seen = [start];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => ZenoWidgets.media('MediaTrackNext'));
    seen.push((await P()).id);
  }
  check(new Set(seen).size === 6, 'Shuffle plays every track once: ' + seen);
  await page.evaluate(() => ZenoWidgets.media('MediaTrackPrevious'));
  check((await P()).id === seen[4], 'Previous goes back to the track before');

  // Cross-fade: a track that repeats fades into its own beginning.
  await page.evaluate(() => ZenoWidgets.setMode('one'));
  await page.evaluate(() =>
    ZenoWidgets.selectTrack(ZenoWidgets.tracks().findIndex(t => t.id === 'ln-aaaaaaaaaaaa'))
  );
  await page.waitForFunction(() => !ZenoWidgets.player().fading && ZenoWidgets.player().duration > 40);
  check(
    await page.evaluate(() => testAudios.every(a => a.paused || !a.loop)),
    'Downloaded tracks do not use the native loop'
  );
  await page.evaluate(() => ZenoWidgets.seekAudio(100));
  await page.waitForFunction(() => ZenoWidgets.player().fading, null, { timeout: 5000 });
  check((await playing()) === 2, 'Two copies play during the fade');
  await page.waitForTimeout(1500);
  const mid = await page.evaluate(() => testAudios.filter(a => !a.paused && a.src).map(a => a.volume));
  check(mid.length === 2 && mid.every(v => v > 0.1 && v < 0.99), 'Both copies are partly audible: ' + mid);
  await page.waitForFunction(() => !ZenoWidgets.player().fading, null, { timeout: 8000 });
  const after = await P();
  check(after.id === 'ln-aaaaaaaaaaaa' && after.playing && after.position < 8, 'The track starts again');
  check((await playing()) === 1, 'Only one copy left after the fade');
  check(
    await page.evaluate(() => testAudios.find(a => !a.paused && a.src).volume === 1),
    'Full volume after the fade'
  );

  // In order: the end of a track fades into the next one.
  await page.evaluate(() => ZenoWidgets.setRotation(['ln-aaaaaaaaaaaa', 'ln-bbbbbbbbbbbb']));
  await page.evaluate(() => ZenoWidgets.setMode('order'));
  await page.evaluate(() => ZenoWidgets.seekAudio(100));
  await page.waitForFunction(() => ZenoWidgets.player().fading, null, { timeout: 5000 });
  check((await P()).id === 'ln-bbbbbbbbbbbb', 'The next track fades in');
  // Pausing in the middle of a fade stops both.
  await page.evaluate(() => ZenoWidgets.pauseAudio());
  check(!(await P()).fading && (await playing()) === 0, 'Pause ends the fade');

  // The settings page.
  await page.evaluate(() => ZenoQA.scene('settings'));
  await act('settings.group.desktopwidgets');
  await act('widget.open.player');
  await act('widget.mode.shuffle');
  check((await P()).mode === 'shuffle', 'Mode chosen from the menu');
  check(
    await page.evaluate(() => document.getElementById('appearance').textContent.includes('2 brani su 6')),
    'The menu says how many tracks are in the playlist'
  );
  await act('widget.open.playerlist');
  await act('widget.rotation.all');
  check((await P()).rotation === 6, 'All tracks from the menu');
  await act('widget.rotation.noise');
  check((await P()).rotation === 5, 'One track left out from the menu');

  // Mode, playlist and track survive a restart.
  await page.reload();
  await ready();
  const back = await P();
  check(
    back.mode === 'shuffle' && back.rotation === 5 && back.id === 'ln-bbbbbbbbbbbb',
    'Saved: ' + JSON.stringify(back)
  );
  check(errors.length === 0, errors.join('\n'));
  console.log(count + ' player checks passed: modes, playlist, cross-fade and saved state.');
} finally {
  await preview.close();
}
