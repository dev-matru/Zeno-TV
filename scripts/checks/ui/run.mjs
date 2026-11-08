// UI checks for the real Home page, in Chromium against a simulated TV.
//   node scripts/checks/ui/run.mjs                 everything
//   CHECK_SECTION=wallpaper node scripts/checks/ui/run.mjs   sections whose name contains "wallpaper"
// Report: .local/qa/checks.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { openPreview, root } from '../../lib/browser.mjs';
import { Suite } from './harness.mjs';
import startup from './startup.mjs';
import catalogue from './catalogue.mjs';
import editing from './editing.mjs';
import settings from './settings.mjs';
import wallpaper from './wallpaper.mjs';
import input from './input.mjs';

const preview = await openPreview();
const suite = new Suite(preview);
try {
  for (const area of [startup, catalogue, editing, settings, wallpaper, input]) await area(suite);
  suite.sectionName = 'Whole run';
  try {
    suite.record('No unexpected page errors or failed requests', suite.report.pageErrors.length === 0, suite.report.pageErrors);
  } catch (error) { /* recorded */ }
} catch (error) {
  suite.report.failures.push({ section: suite.sectionName, error: error.stack });
} finally {
  await preview.close();
  suite.report.finishedAt = new Date().toISOString();
  mkdirSync(root + '.local/qa', { recursive: true });
  writeFileSync(root + '.local/qa/checks.json', JSON.stringify(suite.report, null, 2) + '\n');
}
const passed = suite.report.checks.filter(c => c.passed).length;
console.log(passed + ' checks passed; ' + suite.report.failures.length + ' failure(s). Report: .local/qa/checks.json');
if (suite.report.failures.length) process.exitCode = 1;
