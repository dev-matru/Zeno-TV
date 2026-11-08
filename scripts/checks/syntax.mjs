// Parse every runtime script with Node, so a typo fails before it reaches the TV.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.js')) files.push(path);
  }
})(join(root, 'app'));
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log('Syntax OK for ' + files.length + ' runtime scripts (' + relative(root, join(root, 'app')) + ').');
