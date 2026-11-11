/**
 * Packages the built web/dist/ directory into web/dist/PlayerReconcile-web-offline.zip
 * so visitors can download the entire client-side site as a zip to run locally offline (#25).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const outZipName = 'PlayerReconcile-web-offline.zip';

function collectFiles(dir, prefix = '') {
  const entries = {};
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === outZipName) continue;
    const fullPath = path.join(dir, item.name);
    const relPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      Object.assign(entries, collectFiles(fullPath, relPath));
    } else {
      entries[relPath] = new Uint8Array(fs.readFileSync(fullPath));
    }
  }
  return entries;
}

if (fs.existsSync(distDir)) {
  const files = collectFiles(distDir, 'PlayerReconcile-web');
  const zipped = zipSync(files);
  const outPath = path.join(distDir, outZipName);
  fs.writeFileSync(outPath, zipped);
  console.log(`Created offline bundle: ${outPath} (${(zipped.byteLength / 1024).toFixed(1)} kB)`);
}
