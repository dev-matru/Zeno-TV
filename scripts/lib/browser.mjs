// Starts the local preview server on a free port and a headless Chromium next to it.
// Used by the checks and the build tools; nothing here runs on the TV.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = fileURLToPath(new URL('../../', import.meta.url));

const STARTUP_MS = 10000;

function startServer(publicOnly) {
  const args = ['scripts/dev/preview.py', '--port', '0'];
  if (publicOnly) args.push('--public');
  const child = spawn('python3', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });

  const address = new Promise((resolve, reject) => {
    let stdout = '';
    const fail = message => { clearTimeout(timer); reject(new Error(message)); };
    const timer = setTimeout(() => fail('The preview server did not start in time'), STARTUP_MS);
    child.once('error', error => fail(error.message));
    child.once('exit', code => fail('The preview server stopped (' + code + '): ' + stderr));
    child.stdout.on('data', data => {
      stdout += data;
      const url = /http:\/\/127\.0\.0\.1:\d+/.exec(stdout);
      if (url) { clearTimeout(timer); resolve(url[0]); }
    });
  });
  return { child, address };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await once(child, 'exit');
}

/* { browser, baseURL, close() }. ZENO_PUBLIC=1 forces the public-only preview. */
export async function openPreview({ publicOnly = false } = {}) {
  const server = startServer(publicOnly || process.env.ZENO_PUBLIC === '1');
  let browser = null;
  try {
    const baseURL = await server.address;
    browser = await chromium.launch({ headless: true });
    const close = async () => {
      try { await browser.close(); } finally { await stopServer(server.child); }
    };
    return { browser, baseURL, close };
  } catch (error) {
    if (browser) await browser.close();
    await stopServer(server.child);
    throw error;
  }
}
