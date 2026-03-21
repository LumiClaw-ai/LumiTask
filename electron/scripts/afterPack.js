/**
 * electron-builder afterPack hook.
 * Copies node_modules into the standalone directory inside the app bundle,
 * since electron-builder's default filters exclude node_modules from extraResources.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async function afterPack(context) {
  const appDir = context.appOutDir;
  const resourcesDir = path.join(appDir, context.packager.appInfo.productFilename + '.app', 'Contents', 'Resources');
  const standaloneDir = path.join(resourcesDir, 'standalone');
  const srcModules = path.join(__dirname, '..', '.standalone', 'node_modules');
  const dstModules = path.join(standaloneDir, 'node_modules');

  if (!fs.existsSync(standaloneDir)) {
    console.log('[afterPack] standalone dir not found, skipping');
    return;
  }

  if (!fs.existsSync(srcModules)) {
    console.log('[afterPack] source node_modules not found, skipping');
    return;
  }

  console.log('[afterPack] Copying node_modules into standalone (resolving symlinks)...');
  execSync(`cp -rL "${srcModules}" "${dstModules}"`, { stdio: 'inherit' });

  // Also copy .next/node_modules if exists
  const srcNextModules = path.join(__dirname, '..', '.standalone', '.next', 'node_modules');
  const dstNextModules = path.join(standaloneDir, '.next', 'node_modules');
  if (fs.existsSync(srcNextModules) && !fs.existsSync(dstNextModules)) {
    console.log('[afterPack] Copying .next/node_modules...');
    execSync(`cp -rL "${srcNextModules}" "${dstNextModules}"`, { stdio: 'inherit' });
  }

  // Hoist packages from .pnpm to top-level node_modules for Next.js compatibility
  // Next.js require-hook.js resolves these from top level
  const pnpmDir = path.join(dstModules, '.pnpm', 'node_modules');
  if (fs.existsSync(pnpmDir)) {
    const entries = fs.readdirSync(pnpmDir);
    for (const entry of entries) {
      const src = path.join(pnpmDir, entry);
      const dst = path.join(dstModules, entry);
      if (!fs.existsSync(dst)) {
        try {
          execSync(`cp -rL "${src}" "${dst}" 2>/dev/null`, { stdio: 'pipe' });
        } catch {}
      }
    }
    console.log(`[afterPack] Hoisted ${entries.length} packages from .pnpm to top-level`);
  }

  console.log('[afterPack] Done!');
};
