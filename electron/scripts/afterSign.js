/**
 * electron-builder afterSign hook.
 * Re-signs the app with proper entitlements after electron-builder's default signing.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async function afterSign(context) {
  const appPath = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  const entitlements = path.join(__dirname, '..', 'entitlements.mac.plist');
  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');

  console.log('[afterSign] Re-signing with entitlements...');

  // Sign all frameworks first
  try {
    const items = fs.readdirSync(frameworksDir);
    for (const item of items) {
      const itemPath = path.join(frameworksDir, item);
      if (item.endsWith('.framework') || item.endsWith('.app')) {
        execSync(`codesign --force --sign - --entitlements "${entitlements}" "${itemPath}"`, { stdio: 'pipe' });
      }
    }
  } catch {}

  // Sign the main app last
  try {
    execSync(`codesign --force --sign - --entitlements "${entitlements}" "${appPath}"`, { stdio: 'pipe' });
    console.log('[afterSign] Done!');
  } catch (e) {
    console.warn('[afterSign] Warning:', e.message);
  }
};
