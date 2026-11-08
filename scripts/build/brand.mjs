// Renders the raster versions of the Zeno TV mark (app/assets/brand/mark.svg):
//   app/icon.png                 the TV launcher icon, 1024×1024
//   docs/images/logo-light.png   mark + name for light pages (README)
//   docs/images/logo-dark.png    the same for dark pages
// Usage: node scripts/build/brand.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { root } from '../lib/browser.mjs';

const mark = readFileSync(root + 'app/assets/brand/mark.svg', 'utf8');
const geist = readFileSync(root + 'app/assets/fonts/geist/Geist-Variable.ttf').toString('base64');
const font = `@font-face{font-family:Geist;src:url(data:font/ttf;base64,${geist});font-weight:100 900}`;

const INK = {
  light: { frame: '#3f5455', name: '#192324', accent: '#4b7d6d' },
  dark: { frame: '#d9e3e0', name: '#eef2f0', accent: '#8cc3b2' }
};

function lockup(ink) {
  return `<style>${font}
    html,body{margin:0;background:transparent}
    .lockup{display:inline-flex;flex-direction:column;align-items:center;gap:34px;padding:24px 32px}
    .mark{width:300px;color:${ink.frame}}
    .mark svg{display:block;width:100%;height:auto}
    .name{font:440 112px/1 Geist,sans-serif;letter-spacing:-1px;color:${ink.name};white-space:nowrap}
    .name b{font-weight:440;color:${ink.accent};margin-left:.18em}
  </style><div class="lockup"><div class="mark">${mark}</div><div class="name">Zeno<b>TV</b></div></div>`;
}

const icon = `<style>html,body{margin:0}
  .tile{width:1024px;height:1024px;display:flex;align-items:center;justify-content:center;
        background:radial-gradient(120% 90% at 30% 15%,#24373a 0%,#121c1e 55%,#0a1011 100%)}
  .mark{width:700px;color:#e4ece9;transform:translateY(12px)}
  .mark svg{display:block;width:100%;height:auto}
</style><div class="tile"><div class="mark">${mark}</div></div>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1200 },
    deviceScaleFactor: 2
  });
  for (const [name, ink] of Object.entries(INK)) {
    await page.setContent(lockup(ink));
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator('.lockup')
      .screenshot({ path: root + 'docs/images/logo-' + name + '.png', omitBackground: true });
    console.log('docs/images/logo-' + name + '.png');
  }
  const flat = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await flat.setContent(icon);
  await flat.screenshot({ path: root + 'app/icon.png' });
  console.log('app/icon.png');
} finally {
  await browser.close();
}
