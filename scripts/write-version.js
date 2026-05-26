// Stamps public/version.json with the current build time + git commit so
// the client can detect when a new deploy has gone out and prompt every
// open browser to refresh. Runs as part of the build script.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const buildTime = new Date().toISOString();
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  // git not available (rare in CI); fall back to timestamp-only.
}

const out = { buildTime, commit };
const dest = path.join(process.cwd(), 'public', 'version.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`[write-version] ${dest} -> ${buildTime} ${commit}`);
