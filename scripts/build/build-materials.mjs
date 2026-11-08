// Renders the pre-blurred materials for each bundled wallpaper (see materials/recipe.js).
// The TV never blurs anything live; it only shows these JPEGs.
//
//   node scripts/build/build-materials.mjs            all wallpapers
//   node scripts/build/build-materials.mjs cove,mint  only these
//
// Output goes to .local/materials/builder/ for review before it replaces app assets.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';

const sources = JSON.parse(readFileSync(root + 'app/assets/wallpapers/SOURCES.json', 'utf8'));
const known = new Set(sources.map(s => s.id));
const ids = process.argv[2] ? process.argv[2].split(',') : [...known];
const unknown = ids.filter(id => !known.has(id));
if (unknown.length) throw new Error('Unknown wallpaper: ' + unknown.join(', '));

/* Soft-glass darkness picked by eye for the first photos; later ones use the computed value. */
const REVIEWED_TINT = {
  misty: 0.43303399,
  cove: 0.389543,
  forest: 0.43034609,
  valley: 0.51301798,
  night: 0.46650529,
  peaks: 0.36319971,
  bridge: 0.30784841,
  ridge: 0.6
};

const out = root + '.local/materials/builder/';
mkdirSync(out, { recursive: true });
const report = { recipe: 1, size: [1920, 1080], assets: [], errors: [] };

const preview = await openPreview();
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(preview.baseURL + '/build/canvas.html');
  await page.addScriptTag({ path: root + 'scripts/build/materials/recipe.js' });

  for (const id of ids) {
    const { files, tint } = await page.evaluate(
      ([url, reviewed]) => window.ZenoMaterialRecipe(url, reviewed),
      ['/home/assets/wallpapers/' + id + '.jpg', REVIEWED_TINT[id] ?? null]
    );
    for (const [suffix, data] of Object.entries(files)) {
      const bytes = Buffer.from(data, 'base64');
      writeFileSync(out + id + '-' + suffix + '.jpg', bytes);
      report.assets.push({ id, suffix, bytes: bytes.length, softTint: tint });
    }
    console.log(id + ': ' + Object.keys(files).length + ' materials');
  }
  writeFileSync(out + 'report.json', JSON.stringify(report, null, 2) + '\n');
  if (report.errors.length) throw new Error(report.errors.join('\n'));
} finally {
  await preview.close();
}
