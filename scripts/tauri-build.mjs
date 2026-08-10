#!/usr/bin/env node
/**
 * Runs `tauri build` with the updater signing key when one is available.
 * Required once `bundle.createUpdaterArtifacts` is enabled.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = path.join(root, 'src-tauri', '.updater-keys', 'poc-desktop-tauri.key');

const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY && !env.TAURI_SIGNING_PRIVATE_KEY_PATH && fs.existsSync(keyPath)) {
  env.TAURI_SIGNING_PRIVATE_KEY_PATH = keyPath;
}

if (!env.TAURI_SIGNING_PRIVATE_KEY && !env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
  console.error(`Missing updater signing key.

Generate a key pair (first time only):
  npx tauri signer generate --ci -w src-tauri/.updater-keys/poc-desktop-tauri.key

Then paste the PUBLIC key into src-tauri/tauri.conf.json → plugins.updater.pubkey
and keep the private key secret (CI secret + password manager).

See docs/AUTO_UPDATES.md for the full release flow.
`);
  process.exit(1);
}

const child = spawn('npx', ['tauri', 'build', ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
