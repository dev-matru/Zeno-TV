// The runner and the page session used by every UI check.
//
// A Session opens the real /home/ page with the fake TV installed and offers short
// verbs for driving it (keys, actions, scenes, looks) and for reading its state.
// Checks call `t.expect(name, ok, detail)`; the first failed expectation ends its
// section, and the run carries on with the next section.
import { fakeTV } from './fake-tv.mjs';
import { INSTALLED, savedHome } from './fixtures.mjs';

const SERVICE = 'http://127.0.0.1:4796/**';
const twoFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

export class Suite {
  constructor(preview) {
    this.preview = preview;
    this.only = (process.env.CHECK_SECTION || '').toLowerCase();
    this.report = {
      scope: 'Real Home page in Chromium with a simulated TV. No TV is contacted.',
      checks: [],
      failures: [],
      pageErrors: [],
      expectedNetworkFailures: []
    };
    this.sectionName = '';
  }

  async section(name, body) {
    if (this.only && !name.toLowerCase().includes(this.only)) return;
    this.sectionName = name;
    const t = new Session(this);
    try {
      await body(t);
      console.log('✓ ' + name);
    } catch (error) {
      if (!this.report.failures.some(f => f.section === name))
        this.report.failures.push({ section: name, error: error.stack });
      console.error('✗ ' + name + ': ' + error.message);
    } finally {
      await t.close();
    }
  }

  record(name, ok, detail) {
    const entry = { section: this.sectionName, name, passed: !!ok };
    if (!ok) entry.detail = detail;
    this.report.checks.push(entry);
    if (!ok) {
      this.report.failures.push(entry);
      throw new Error(name + (detail === undefined ? '' : ': ' + JSON.stringify(detail).slice(0, 500)));
    }
  }
}

export class Session {
  constructor(suite) {
    this.suite = suite;
    this.page = null;
  }

  expect(name, ok, detail) {
    this.suite.record(name, ok, detail);
  }

  /* Opens Home. Options go to the fake TV: seed, earlier, catalog, minuteMs,
     catalogFailure, storageFailure, noFontAPI, mock (false = plain browser). */
  async open(options = {}) {
    await this.close();
    const suite = this.suite,
      page = await suite.preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
    this.page = page;
    page.setDefaultTimeout(10000);
    page.allowedFailures = [];
    const allowed = url => page.allowedFailures.some(part => url.includes(part));
    page.on('pageerror', e => suite.report.pageErrors.push({ section: suite.sectionName, error: e.message }));
    page.on('response', r => {
      if (r.status() >= 400 && !allowed(r.url()))
        suite.report.pageErrors.push({
          section: suite.sectionName,
          status: r.status(),
          url: r.url()
        });
    });
    page.on('requestfailed', r => {
      if (page.closing) return;
      const failure = { section: suite.sectionName, url: r.url(), error: r.failure()?.errorText };
      if (allowed(r.url())) suite.report.expectedNetworkFailures.push(failure);
      else if (failure.error !== 'net::ERR_ABORTED') suite.report.pageErrors.push(failure);
    });
    // The local network service, as reached over HTTP.
    await page.route(SERVICE, async route => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204 });
        return;
      }
      const request = route.request().postDataJSON();
      if (request)
        await page.evaluate(r => {
          __tv.serviceRequests.push(r);
        }, request);
      await route.fulfill({
        json: request
          ? { id: request.id, value: { opened: true, ip: '192.0.2.11', enabled: true } }
          : { ready: true }
      });
    });
    await page.addInitScript(fakeTV, {
      mock: true,
      catalog: INSTALLED,
      minuteMs: 60000,
      seed: savedHome(),
      ...options
    });
    await page.goto(suite.preview.baseURL + '/home/');
    await this.ready();
    await page.waitForLoadState('networkidle');
    return page;
  }

  async close() {
    if (!this.page) return;
    this.page.closing = true;
    await this.page.close();
    this.page = null;
  }

  async reload() {
    await this.page.reload();
    await this.ready();
  }

  /* --- reading --- */
  run(fn, arg) {
    return this.page.evaluate(fn, arg);
  }
  qa(method, ...args) {
    return this.page.evaluate(([m, a]) => ZenoQA[m](...a), [method, args]);
  }
  state() {
    return this.qa('state');
  }
  where() {
    return this.qa('where');
  }
  saved() {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem('zeno.home.v1')));
  }
  text() {
    return this.page.locator('#stage').innerText();
  }
  lastLaunch() {
    return this.page.evaluate(() => __tv.calls[__tv.calls.length - 1]);
  }
  waitFor(fn, arg, opts) {
    return this.page.waitForFunction(fn, arg, opts);
  }
  ready() {
    return this.page.waitForFunction(
      () => window.ZenoQA && typeof ZenoQA.ready === 'function' && ZenoQA.ready(),
      null,
      { timeout: 15000 }
    );
  }

  /* --- driving --- */
  keys(...keys) {
    return this.qa('nav', keys);
  }
  async press(action) {
    const result = await this.qa('activate', action);
    if (result === null || result === false) throw new Error('Not available on screen: ' + action);
    return result;
  }
  async scene(name) {
    await this.qa('scene', name);
    await this.page.evaluate(twoFrames);
  }
  async look(patch) {
    await this.qa('look', patch);
    await this.ready();
  }
  choose(axis, value) {
    return this.press('choice.' + axis + '.' + value);
  }
  /* Back from the TV app: the window regains focus. */
  returnFromApp() {
    return this.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  }

  async group(name) {
    await this.scene('settings');
    await this.press('settings.group.' + name);
    await this.waitFor(expected => ZenoQA.state().settingsGroup === expected, name);
  }
  async allApps() {
    await this.scene('settings');
    await this.press('settings.group.manager');
    await this.waitFor(() => !ZenoQA.state().catalog.loading);
  }
  async editor() {
    await this.scene('settings');
    await this.press('settings.editor');
    await this.waitFor(() => document.querySelector('[data-action^="editor.move."]'));
    await this.waitFor(() => !ZenoQA.state().catalog.loading);
  }
  /* In the editor, walk the remote to app `id` in the Home column and press its remove button. */
  async removeFromHome(id) {
    let action = (await this.state()).focusAction;
    const step = async key => {
      await this.keys(key);
      action = (await this.state()).focusAction;
    };
    if (action === 'editor.done' || action === 'editor.undo') await step('down');
    if (action.startsWith('editor.add.')) await step('left');
    if (action.startsWith('editor.remove.')) await step('left');
    const home = (await this.state()).dock;
    const from = home.indexOf(action.replace('editor.move.', '')),
      to = home.indexOf(id);
    if (from < 0 || to < 0) throw new Error('Cannot reach ' + id + ' in the editor');
    await this.keys(...Array(Math.abs(to - from)).fill(to > from ? 'down' : 'up'));
    await this.keys('right', 'ok');
  }
  async wallpaperPicker() {
    await this.group('background');
    await this.press('background.wallpaper');
    await this.waitFor(
      () => ZenoQA.state().view === 'wallpaper' && ZenoQA.state().settingsGroup === 'wallpaper'
    );
  }

  /* Hold requests matching `pattern` until release() is called. */
  async holdRequests(pattern) {
    const held = [];
    let release;
    const gate = new Promise(r => {
      release = r;
    });
    await this.page.route(pattern, async route => {
      held.push(route.request().url());
      await gate;
      await route.continue();
    });
    return { held, release: () => release() };
  }
  failRequests(pattern) {
    return this.page.route(pattern, route => route.abort('failed'));
  }

  /* --- Settings helpers --- */
  /* Visible radio choices on screen. */
  choices() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('#stage [role="radio"]')]
        .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
        .map(e => ({
          action: e.getAttribute('data-action'),
          checked: e.getAttribute('aria-checked'),
          disabled: e.getAttribute('aria-disabled') === 'true',
          focused: e.classList.contains('is-focus'),
          text: e.textContent.trim()
        }))
    );
  }
  async focusedChoice() {
    const action = (await this.state()).focusAction;
    return (await this.choices()).find(c => c.action === action);
  }
  /* Moves around a choice grid until an enabled, unselected choice has focus. */
  async reachUnselectedChoice() {
    for (const key of ['right', 'right', 'down', 'left', 'left', 'down', 'right', 'right', 'down']) {
      await this.keys(key);
      const choice = await this.focusedChoice();
      if (choice && choice.checked === 'false' && !choice.disabled) return choice;
    }
    throw new Error('No unselected choice reachable with the remote');
  }
  /* Walks a fixed remote path and fails if focus ever lands on something unusable. */
  async walkChoices() {
    const visited = [];
    for (const key of ['down', 'down', 'right', 'right', 'up', 'left', 'left', 'down', 'down', 'up', 'up']) {
      await this.keys(key);
      const focus = await this.page.evaluate(() => {
        const action = ZenoQA.state().focusAction;
        const el = [...document.querySelectorAll('#stage [data-action]')].find(
          e =>
            e.getAttribute('data-action') === action &&
            e.getClientRects().length &&
            getComputedStyle(e).visibility !== 'hidden'
        );
        return {
          action,
          exists: !!el,
          disabled: el?.getAttribute('aria-disabled') === 'true',
          count: ZenoQA.where().focusCount
        };
      });
      visited.push(focus.action);
      if (!focus.exists || focus.disabled || focus.count !== 1)
        throw new Error('Remote ' + key + ' reached an unusable choice: ' + JSON.stringify(focus));
    }
    return visited;
  }
  /* What Settings has applied, saved and rendered, for before/after comparisons. */
  snapshot() {
    return this.page.evaluate(() => {
      const s = ZenoQA.state();
      const rendered = [...document.getElementById('stage').classList]
        .filter(c => /^(bg|l|a|u|f|m|font)-/.test(c))
        .sort();
      return {
        stored: localStorage.getItem('zeno.home.v1'),
        committed: s.committed,
        shown: s.shown,
        rendered,
        writes: s.writes,
        storageAttempts: window.__storageAttempts
      };
    });
  }
  /* Elements on screen that would need live blur. */
  liveFilters() {
    return this.page.evaluate(() =>
      [...document.querySelectorAll('#stage, #stage *')]
        .filter(e => e.getClientRects().length)
        .map(e => {
          const s = getComputedStyle(e);
          return {
            tag: e.tagName,
            cls: e.className,
            filter: s.filter,
            backdrop: s.backdropFilter || s.webkitBackdropFilter || 'none'
          };
        })
        .filter(s => /blur|url\(/.test(s.filter) || s.backdrop !== 'none')
    );
  }
}
