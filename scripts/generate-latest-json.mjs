#!/usr/bin/env node
/**
 * Builds latest.json from signed Tauri updater artifacts.
 *
 * Usage:
 *   node scripts/generate-latest-json.mjs \
 *     --base-url https://github.com/YOUR_ORG/POC-desktop-tauri/releases/download/v1.1.0 \
 *     --notes "Bug fixes and performance improvements"
 *
 * Writes:
 *   src-tauri/target/release/bundle/latest.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle');
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const version = arg('--version', conf.version || '0.0.0');
const notes = arg('--notes', `Offline First Hub ${version}`);
const baseUrl = (arg('--base-url') || '').replace(/\/$/, '');
const outFile = arg('--out', path.join(bundleDir, 'latest.json'));

if (!baseUrl) {
  console.error('Missing --base-url (download prefix for updater artifacts).');
  console.error('Example: --base-url https://github.com/YOUR_ORG/POC-desktop-tauri/releases/download/v1.1.0');
  process.exit(1);
}

function findFile(dir, matcher) {
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((name) => matcher(name) && !name.endsWith('.sig'));
  return match ? path.join(dir, match) : null;
}

function readSignature(artifactPath) {
  const sigPath = `${artifactPath}.sig`;
  if (!fs.existsSync(sigPath)) {
    throw new Error(`Missing signature file: ${sigPath}`);
  }
  return fs.readFileSync(sigPath, 'utf8').trim();
}

function encodeName(filePath) {
  return encodeURIComponent(path.basename(filePath));
}

const platforms = {};

const macTar = findFile(path.join(bundleDir, 'macos'), (name) => name.endsWith('.app.tar.gz'));
if (macTar) {
  const entry = {
    signature: readSignature(macTar),
    url: `${baseUrl}/${encodeName(macTar)}`,
  };
  platforms['darwin-aarch64'] = entry;
  platforms['darwin-x86_64'] = entry;
}

const appImage = findFile(path.join(bundleDir, 'appimage'), (name) => name.endsWith('.AppImage'));
if (appImage) {
  platforms['linux-x86_64'] = {
    signature: readSignature(appImage),
    url: `${baseUrl}/${encodeName(appImage)}`,
  };
}

const nsis = findFile(path.join(bundleDir, 'nsis'), (name) => name.endsWith('.exe'));
const msi = findFile(path.join(bundleDir, 'msi'), (name) => name.endsWith('.msi'));
const windowsArtifact = nsis || msi;
if (windowsArtifact) {
  platforms['windows-x86_64'] = {
    signature: readSignature(windowsArtifact),
    url: `${baseUrl}/${encodeName(windowsArtifact)}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.error(`No signed updater artifacts found under ${bundleDir}.`);
  console.error('Run `npm run tauri:build` first so .tar.gz / .AppImage / .exe + .sig files exist.');
  process.exit(1);
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outFile}`);
console.log(JSON.stringify(manifest, null, 2));
