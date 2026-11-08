// Measures how readable the app names on Home are over each bundled photo.
//
// For every state it takes three screenshots: the real screen, the same screen with
// the labels hidden (what sits behind them), and a mask with only the labels in white.
// Inside the solid core of each glyph it compares the label colour with the background
// and reports the 5th-percentile contrast ratio per label.
//
// Targets: 3:1 for every label, 4.5:1 for the focused one. Labels in the deliberate
// edge fades are reported but not rated. This is a design check in Chromium, not a
// TV measurement or an accessibility certification.
//
//   GALLERY_IDS=cove,mint GALLERY_FONTS=geist node scripts/checks/gallery-contrast.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { openPreview, root } from '../lib/browser.mjs';

const walls = (process.env.GALLERY_IDS || 'summit,goldcoast,sydney,amber,mint,alpine').split(',');
const fonts = (process.env.GALLERY_FONTS || 'manrope').split(',');
const LAYOUTS = ['list', 'dock'],
  MATERIALS = ['soft', 'frost', 'tint'];
const MIN_RATIO = 3,
  FOCUS_RATIO = 4.5,
  MIN_PIXELS = 20,
  CORE = 250;

const LABEL = {
  list: { row: '.ph-row', text: '.ph-name', hide: '#stage .ph-name' },
  dock: { row: '#dock .tile', text: '.label-ink', hide: '#dock .label-ink' }
};

/* In page: label boxes, and whether each sits in a faded edge (context) or is focused. */
function labelBoxes({ layout, label }) {
  const dock = document.querySelector('#dock').getBoundingClientRect(),
    found = [];
  for (const row of document.querySelectorAll(label.row)) {
    const text = row.querySelector(label.text);
    if (!text) continue;
    const box = text.getBoundingClientRect(),
      rowBox = row.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(text).visibility === 'hidden') continue;
    const offStage =
      layout === 'list' ? box.y < 72 || box.bottom > 1016 : rowBox.right < dock.x || rowBox.x > dock.right;
    if (offStage) continue;
    const edge =
      layout === 'list'
        ? rowBox.y < 219 || rowBox.y > 733
        : rowBox.x < dock.x + 16 || rowBox.right > dock.right - 16;
    found.push({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      text: text.textContent,
      focused: row.classList.contains('is-focus'),
      edge
    });
  }
  return found;
}

/* In page: P5 contrast inside the glyph cores of each label. Images are base64 PNGs. */
async function contrast({ shots, labels, core, minPixels }) {
  const pixels = async data => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const g = new OffscreenCanvas(img.width, img.height).getContext('2d');
    g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, px: g.getImageData(0, 0, img.width, img.height).data };
  };
  const lin = c => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = (px, i) => 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
  const percentile = (list, p) => {
    list.sort((a, b) => a - b);
    const at = p * (list.length - 1),
      lo = Math.floor(at);
    return lo + 1 < list.length ? list[lo] + (list[lo + 1] - list[lo]) * (at - lo) : list[lo];
  };
  const [front, back, mask] = await Promise.all([shots.front, shots.back, shots.mask].map(pixels));
  return labels.map(label => {
    const ratios = [];
    const x0 = Math.max(0, Math.floor(label.x)),
      y0 = Math.max(0, Math.floor(label.y));
    const x1 = Math.min(front.w, Math.ceil(label.x + label.width)),
      y1 = Math.min(front.h, Math.ceil(label.y + label.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * front.w + x) * 4;
        const m = 0.299 * mask.px[i] + 0.587 * mask.px[i + 1] + 0.114 * mask.px[i + 2];
        if (m < core) continue;
        const a = lum(front.px, i),
          b = lum(back.px, i);
        ratios.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
      }
    }
    return {
      pixels: ratios.length,
      p5: ratios.length >= minPixels ? percentile(ratios, 0.05) : null
    };
  });
}

const out = root + '.local/qa/';
mkdirSync(out, { recursive: true });
const samples = [],
  errors = [];
const preview = await openPreview();
try {
  const page = await preview.browser.newPage({
    viewport: { width: 1920, height: 1080 },
    reducedMotion: 'reduce'
  });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => {
    if (r.status() >= 400) errors.push(r.status() + ' ' + r.url());
  });
  const png = async () => (await page.screenshot()).toString('base64');

  for (const font of fonts)
    for (const wall of walls)
      for (const layout of LAYOUTS)
        for (const material of MATERIALS)
          for (const end of [false, true]) {
            const label = LABEL[layout];
            await page.goto(preview.baseURL + '/home/');
            await page.waitForFunction(() => window.ZenoQA && ZenoQA.ready());
            await page.evaluate(look => ZenoQA.look(look), {
              bg: 'photo',
              wall,
              layout,
              material,
              font,
              focus: 'glass',
              apps: 'both',
              controls: 'text'
            });
            await page.waitForFunction(() => ZenoQA.ready());
            await page.evaluate(() => ZenoQA.scene('home'));
            const key = layout === 'list' ? (end ? 'down' : 'up') : end ? 'right' : 'left';
            await page.evaluate(k => ZenoQA.nav(Array(8).fill(k)), key);
            await page.addStyleTag({
              content: '#stage *{transition:none!important;animation:none!important}'
            });
            await page.waitForTimeout(120);

            const labels = await page.evaluate(labelBoxes, { layout, label });
            const shots = { front: await png() };
            const hide = await page.addStyleTag({
              content: label.hide + '{visibility:hidden!important}'
            });
            shots.back = await png();
            await hide.evaluate(el => el.remove());
            await page.addStyleTag({
              content:
                '#stage{background:#000!important}#stage *{visibility:hidden!important;background:transparent!important;' +
                'box-shadow:none!important;border-color:transparent!important;text-shadow:none!important;opacity:1!important;' +
                '-webkit-mask-image:none!important;mask-image:none!important}' +
                label.hide +
                '{visibility:visible!important;color:#fff!important}'
            });
            shots.mask = await png();

            const measured = await page.evaluate(contrast, {
              shots,
              labels,
              core: CORE,
              minPixels: MIN_PIXELS
            });
            labels.forEach((l, i) => {
              const target = l.edge ? null : l.focused ? FOCUS_RATIO : MIN_RATIO,
                p5 = measured[i].p5;
              samples.push({
                font,
                wall,
                layout,
                material,
                end,
                text: l.text,
                focused: l.focused,
                edge: l.edge,
                pixels: measured[i].pixels,
                p5,
                target,
                passes: p5 === null || target === null ? null : p5 >= Math.min(target, MIN_RATIO),
                meetsTarget: p5 === null || target === null ? null : p5 >= target
              });
            });
          }
} finally {
  await preview.close();
}

const rated = samples.filter(s => s.passes !== null);
const summary = {
  samples: samples.length,
  rated: rated.length,
  belowMinimum: rated.filter(s => !s.passes).length,
  belowTarget: rated.filter(s => !s.meetsTarget).length,
  unmeasured: samples.filter(s => s.p5 === null).length,
  errors
};
writeFileSync(out + 'gallery-contrast.json', JSON.stringify({ summary, samples }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
for (const s of samples.filter(s => s.passes === false))
  console.log('below 3:1', s.wall, s.layout, s.material, JSON.stringify(s.text), s.p5.toFixed(2));
if (errors.length || summary.belowMinimum) process.exitCode = 1;
