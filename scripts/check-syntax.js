'use strict';

/** `npm run check`: node --check untuk semua file .js di src/ dan scripts/. */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['src', 'scripts'];

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = DIRS.flatMap((d) => collect(path.join(ROOT, d)));
let failed = 0;

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed += 1;
    console.error(`✗ ${path.relative(ROOT, file)}\n${err.stderr?.toString() || err.message}`);
  }
}

console.log(`${files.length - failed}/${files.length} file lolos cek sintaks.`);
process.exit(failed ? 1 : 0);
