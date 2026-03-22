/**
 * Prepare standalone directory for Electron packaging.
 * - Copies .next/standalone to electron/.standalone (resolved, no symlinks)
 * - Copies .next/static into it
 * - Copies public into it
 * - Rebuilds better-sqlite3 for Electron and copies native module
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STANDALONE_SRC = path.join(ROOT, '.next', 'standalone');
const STANDALONE_DST = path.join(ROOT, 'electron', '.standalone');
const STATIC_SRC = path.join(ROOT, '.next', 'static');

console.log('[prepare] Cleaning previous standalone...');
fs.rmSync(STANDALONE_DST, { recursive: true, force: true });

console.log('[prepare] Copying standalone (resolving symlinks)...');
// cp -rL follows symlinks
execSync(`cp -rL "${STANDALONE_SRC}" "${STANDALONE_DST}"`, { stdio: 'inherit' });

console.log('[prepare] Copying static files...');
const staticDst = path.join(STANDALONE_DST, '.next', 'static');
fs.mkdirSync(path.dirname(staticDst), { recursive: true });
execSync(`cp -r "${STATIC_SRC}" "${staticDst}"`, { stdio: 'inherit' });

// Copy public if exists
const publicSrc = path.join(ROOT, 'public');
if (fs.existsSync(publicSrc)) {
  console.log('[prepare] Copying public...');
  execSync(`cp -r "${publicSrc}" "${path.join(STANDALONE_DST, 'public')}"`, { stdio: 'inherit' });
}

console.log('[prepare] Rebuilding better-sqlite3 for Electron...');
try {
  execSync('npx @electron/rebuild -f -w better-sqlite3', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.warn('[prepare] Warning: @electron/rebuild failed, native module may not work');
}

// Copy rebuilt native module
const nativeSrc = findFile(path.join(ROOT, 'node_modules'), 'better_sqlite3.node');
if (nativeSrc) {
  const nativeDsts = findAllFiles(STANDALONE_DST, 'better_sqlite3.node');
  for (const dst of nativeDsts) {
    fs.copyFileSync(nativeSrc, dst);
    console.log(`[prepare] Copied native module to ${path.relative(ROOT, dst)}`);
  }
}

// Restore better-sqlite3 for Node.js (so `pnpm dev` works after building Electron)
console.log('[prepare] Restoring better-sqlite3 for Node.js...');
try {
  execSync('pnpm rebuild better-sqlite3', { cwd: ROOT, stdio: 'pipe' });
  console.log('[prepare] Restored native module for Node.js');
} catch {}

console.log('[prepare] Done!');

function findFile(dir, name) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.name === name && entry.isFile()) return full;
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const found = findFile(full, name);
        if (found) return found;
      }
    }
  } catch {}
  return null;
}

function findAllFiles(dir, name) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.name === name && entry.isFile()) results.push(full);
      if (entry.isDirectory()) results.push(...findAllFiles(full, name));
    }
  } catch {}
  return results;
}
