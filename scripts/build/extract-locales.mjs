import { parse } from 'acorn';
import { readFileSync, writeFileSync } from 'node:fs';
const phrases = new Set();
const exclude = new Set([
  'Zeno TV',
  'PC',
  'TV',
  'YouTube',
  'Netflix',
  'Prime Video',
  'Disney+',
  'RaiPlay',
  'Mediaset Infinity',
  'NOW',
  'DAZN',
  'Apple TV',
  'Manrope',
  'Geist',
  'Newsreader',
  'Samsung Home',
  'Wake on LAN'
]);
function add(s) {
  s = s.trim();
  if (
    s.length < 2 ||
    s.length > 400 ||
    exclude.has(s) ||
    /[<>={}\\]|https?:|\.js|\.jpg|\.png|translate3d|rgba\(/.test(s) ||
    /^[.#@:/-]/.test(s) ||
    !/[A-Za-zÀ-ž]/.test(s)
  )
    return;
  if (
    s.includes(' ') ||
    /^[A-ZÀ-Ž][a-zà-ž]+(?:…|\?|!)?$/.test(s) ||
    s.includes('’') ||
    ['app', 'disponibili', 'utilizzati'].includes(s)
  )
    phrases.add(s);
}
function walk(n) {
  if (!n || typeof n !== 'object') return;
  if (n.type === 'Literal' && typeof n.value === 'string') {
    if (n.value.includes('<')) {
      for (const m of n.value.matchAll(/>([^<>]+)</g)) if (!m[1].includes("'+")) add(m[1]);
    } else add(n.value);
  }
  for (const k of Object.keys(n)) {
    if (k === 'start' || k === 'end') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') walk(v);
  }
}
for (const f of [
  'main.js',
  'src/system/device.js',
  'src/home/extras.js',
  'src/system/control.js',
  'src/system/info.js',
  'src/sources/icons.js',
  'src/sources/sources.js',
  'src/core/remote-keys.js',
  'src/home/widgets.js',
  'src/home/desktop.js'
])
  walk(parse(readFileSync('app/' + f, 'utf8'), { ecmaVersion: 5 }));
for (const s of [
  '{0} utilizzati · {1} disponibili',
  '{0} disponibili su {1}',
  '{0} · lo sfondo attuale viene conservato',
  'Personale · {0}',
  'Torna a {0}',
  'Disinstallare {0}?',
  'Chiudere {0}?',
  'Avvia {0}',
  '{0} app',
  'Release disponibile: {0}',
  'Developer Mode {0} · Host {1}',
  'PERSONALIZZA',
  'Memoria processo',
  'RAM processo',
  'In esecuzione',
  'Non in esecuzione',
  'Servizio attivo',
  'Versione',
  'Dati',
  'Pacchetto',
  'Apri',
  'Modifica',
  'Seleziona',
  'Salva',
  'Svuota',
  'Lingua',
  'Informazioni di sistema',
  'Aggiorna informazioni'
])
  phrases.add(s);
writeFileSync('.local/locale-phrases.json', JSON.stringify([...phrases].sort(), null, 2) + '\n');
console.log(phrases.size + ' UI phrases extracted');
