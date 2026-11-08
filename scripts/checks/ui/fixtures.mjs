// Test data shared by the UI checks: the fake TV's installed apps and saved Homes.
import { readFileSync } from 'node:fs';
import { root } from '../../lib/browser.mjs';

/* Built-in Home apps in their default order, with the TV app IDs they launch. */
export const BUILTIN = [
  ['tv', 'org.tizen.tv-viewer', 'TV'],
  ['pc', 'zeno.pc', 'PC'],
  ['youtube', 'xvvl3S1TT1.TizenTubeStandalone', 'YouTube'],
  ['netflix', 'org.tizen.netflix-app', 'Netflix'],
  ['primevideo', 'org.tizen.primevideo', 'Prime Video'],
  ['disneyplus', 'MCmYXNxgcu.DisneyPlus', 'Disney+'],
  ['raiplay', '5im3FztIhW.RaiTVtizen', 'RaiPlay'],
  ['infinity', 'g3zzYA7yO8.InfinityNew', 'Mediaset Infinity'],
  ['now', 'jcz0WrZYdy.NOWTV', 'NOW'],
  ['dazn', 'yu1NM3vHsU.DAZN', 'DAZN'],
  ['appletv', 'com.samsung.tv.aria-video', 'Apple TV']
];
export const HOME_IDS = BUILTIN.map(b => b[0]);
export const appIdOf = id => BUILTIN.find(b => b[0] === id)[1];

/* An installed app with no built-in entry, whose name tries to inject markup. */
export const FAMILY = 'AbCdEf1234.FamilyApp';
export const FAMILY_NAME = 'Family <img src=x onerror="window.__catalogXss=1"> & TV';
export const SPOTIFY = 'rJeHak5zRg.Spotify';

/* What the fake TV reports as installed. The last three must never be listed:
   Zeno itself, a background service and a second YouTube. */
export const INSTALLED = BUILTIN.map(([, appId, name]) => ({
  id: appId,
  name,
  show: true,
  iconPath: ''
})).concat([
  { id: FAMILY, name: FAMILY_NAME, show: true, iconPath: '' },
  { id: SPOTIFY, name: 'Spotify', show: true, iconPath: '' },
  { id: '5b8c3eb16b.BeamCTVDev', name: 'HBO Max', show: true, iconPath: '' },
  { id: 'ZenoTV0000.ZenoTV', name: 'Zeno TV', show: true },
  { id: 'AbCdEf1234.worker', name: 'Background worker', show: true },
  { id: 'com.samsung.tv.cobalt-yt', name: 'YouTube', show: true }
]);
/* Apps All apps should list from INSTALLED. */
export const LISTED_COUNT = 12;

export const WALLS = JSON.parse(readFileSync(root + 'app/assets/wallpapers/SOURCES.json', 'utf8'));

/* A saved Home in the current schema, with optional overrides. */
export function savedHome(patch = {}) {
  return {
    homeVersion: 4,
    dock: HOME_IDS.slice(),
    wallpaper: WALLS[0].id,
    mode: 'fixed',
    lastApp: 'netflix',
    theme: 'shore',
    font: 'manrope',
    apps: 'both',
    controls: 'both',
    ...patch
  };
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
