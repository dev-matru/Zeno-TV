// Test data shared by the UI checks: the fake TV's installed apps and saved Homes.
import { readFileSync } from 'node:fs';
import { root } from '../../lib/browser.mjs';

/* The demo apps (scripts/dev/demo/apps.json): made-up names, as the TV would list them. */
export const DEMO = JSON.parse(readFileSync(root + 'scripts/dev/demo/apps.json', 'utf8'));
const demo = name => DEMO.find(a => a.name === name).id;
export const ARCADE = demo('Arcade'),
  CINEMA = demo('Cinema'),
  MUSIC = demo('Music'),
  SERIES = demo('Series'),
  SPORTS = demo('Sports'),
  VIDEOS = demo('Videos');

/* The Home the checks start from: the two inputs and nine installed apps. */
export const HOME_IDS = ['tv', 'pc'].concat(DEMO.slice(0, 9).map(a => a.id));

/* An installed app not on that Home, whose name tries to inject markup. */
export const FAMILY = 'AbCdEf1234.FamilyApp';
export const FAMILY_NAME = 'Family <img src=x onerror="window.__catalogXss=1"> & TV';
export const PLAYER = 'QaPlayer01.Player';

/* What the fake TV reports as installed. The last four must never be listed:
   Zeno itself, a background service, the system YouTube player and a hidden app. */
export const INSTALLED = DEMO.map(a => ({ id: a.id, name: a.name, show: true, iconPath: '' })).concat([
  { id: FAMILY, name: FAMILY_NAME, show: true, iconPath: '' },
  { id: PLAYER, name: 'Player', show: true, iconPath: '' },
  { id: 'ZenoTV0000.ZenoTV', name: 'Zeno TV', show: true },
  { id: 'AbCdEf1234.worker', name: 'Background worker', show: true },
  { id: 'com.samsung.tv.cobalt-yt', name: 'Player (system)', show: true },
  { id: 'QaHidden01.Hidden', name: 'Hidden', show: false }
]);
/* Apps All apps should list from INSTALLED. */
export const LISTED_COUNT = DEMO.length + 2;

export const WALLS = JSON.parse(readFileSync(root + 'app/assets/wallpapers/SOURCES.json', 'utf8'));

/* A saved Home in the current schema, with optional overrides. */
export function savedHome(patch = {}) {
  return {
    homeVersion: 4,
    dock: HOME_IDS.slice(),
    wallpaper: WALLS[0].id,
    mode: 'fixed',
    lastApp: CINEMA,
    theme: 'shore',
    font: 'manrope',
    apps: 'both',
    controls: 'both',
    ...patch
  };
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
