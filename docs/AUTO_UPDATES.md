# Auto updates (bottom-left toast)

Installed copies of **Offline First Hub** check for a newer signed release on startup (and every 4 hours). When one is found, a Cursor-style toast appears in the **bottom-left** of the window:

- **Later** — hides the toast until the next app launch
- **Install Now** — downloads the update, installs it, then **restarts** the app automatically

Users do not install updates by hand. They only click **Install Now**.

---

## What the user sees

1. App starts and calls the updater endpoint in `src-tauri/tauri.conf.json`.
2. If `latest.json` has a **higher SemVer** than the running app, the toast appears: **New update available**.
3. **Install Now** downloads the platform artifact, verifies the signature, installs it, then relaunches.
4. After restart, the app is on the new version. The toast does not show again until a newer release is published.

The toast never appears in plain browser mode (`npm run dev`) unless you preview it (see [Preview the toast](#preview-the-toast)).

---

## One-time setup (do this before the first public build)

These steps are required **once**. Skip them later when shipping `1.1.0`, `1.2.0`, etc.

### 1. Signing keys

Tauri **requires** a signature. Unsigned updates are rejected.

A key pair already lives at:

```
src-tauri/.updater-keys/poc-desktop-tauri.key      ← PRIVATE (never commit)
src-tauri/.updater-keys/poc-desktop-tauri.key.pub  ← public (already copied into tauri.conf.json)
```

If that folder is empty on a new machine **and no users have the app yet**:

```bash
npx tauri signer generate --ci -w src-tauri/.updater-keys/poc-desktop-tauri.key
```

Then paste the **public** key into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

**Back up the private key** in a password manager. If you lose it, existing installs can never update. You would have to ship a full new installer with a new public key.

Do **not** generate a new key after users already have the app.

### 2. Point the app at your release feed

Edit `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "<your public key>",
    "endpoints": [
      "https://github.com/YOUR_ORG/POC-desktop-tauri/releases/latest/download/latest.json"
    ]
  }
}
```

Replace `YOUR_ORG/POC-desktop-tauri` with your GitHub repo.

This URL must be baked into the **already-installed** build. Changing it later only affects new installs unless you ship an update that also changes the endpoint.

### 3. GitHub Actions secrets (if you use the workflow)

Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Full contents of `poc-desktop-tauri.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Empty unless you set a password on the key |

`GITHUB_TOKEN` is provided automatically.

The workflow is `.github/workflows/release.yml`. It builds macOS / Linux / Windows, signs updater artifacts, and publishes a GitHub Release that includes `latest.json`.

---

## How to release a new version (so users see the popup)

Every release follows the same loop: **bump version → signed build → publish `latest.json` → users get the toast**.

### Option A — GitHub Action (recommended)

1. Update the version in **all three** places (they must match):

   | File | Field |
   |---|---|
   | `package.json` | `"version"` |
   | `src-tauri/tauri.conf.json` | `"version"` |
   | `src-tauri/Cargo.toml` | `version` |

   Example: `1.0.0` → `1.1.0`.

2. Commit and tag:

   ```bash
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
   git commit -m "Release v1.1.0"
   git tag v1.1.0
   git push origin HEAD --tags
   ```

3. The **Release** workflow builds, signs, and uploads:

   - Platform installers (`.dmg` / `.app.tar.gz`, `.AppImage`, `.msi` / `.exe`)
   - Matching `.sig` signature files
   - `latest.json` (this is what the running app fetches)

4. Confirm the release page has `latest.json` attached.

5. Open an **older installed build** (for example `1.0.0`). Within a few seconds the bottom-left toast should appear. Click **Install Now** — the app updates and restarts on `1.1.0`.

> The first public build (`1.0.0`) will not show a toast. The toast appears only when a **newer** version is on the endpoint.

### Option B — Manual release

Use this when you are not using GitHub Actions.

1. Bump versions as in Option A (`package.json`, `tauri.conf.json`, `Cargo.toml`).

2. Signed production build:

   ```bash
   npm run tauri:build
   ```

   `npm run tauri:build` automatically uses `src-tauri/.updater-keys/poc-desktop-tauri.key` when present.

   Artifacts (names vary slightly by OS):

   ```
   src-tauri/target/release/bundle/
   ├── macos/
   │   ├── Offline First Hub Tauri.app
   │   ├── Offline First Hub Tauri.app.tar.gz      ← updater payload
   │   └── Offline First Hub Tauri.app.tar.gz.sig  ← signature
   ├── dmg/
   ├── appimage/   (Linux)
   ├── nsis/ or msi/  (Windows)
   ```

3. Generate `latest.json`:

   ```bash
   npm run updater:latest-json -- \
     --base-url https://github.com/YOUR_ORG/POC-desktop-tauri/releases/download/v1.1.0 \
     --notes "What changed in 1.1.0"
   ```

   Output: `src-tauri/target/release/bundle/latest.json`  
   Shape: see `docs/latest.example.json`.

4. Create a GitHub Release tagged `v1.1.0` and upload:

   - The updater archive(s) (`.app.tar.gz`, `.AppImage`, `.exe` / `.msi`)
   - Their `.sig` files
   - **`latest.json`** (filename must be exactly `latest.json` if you use `/releases/latest/download/latest.json`)

5. Launch the previous installed version. The toast should appear. **Install Now** downloads, verifies, installs, and restarts.

---

## Preview the toast (UI only)

No release required. Useful to check layout against the Cursor-style bar.

```bash
npm run updater:preview
```

Or open the normal Vite URL with:

```
http://localhost:1420/?previewUpdateToast=1
```

**Install Now** in preview only simulates download progress. It does not restart. Real install + restart only happens in a **packaged** Tauri build that can reach `latest.json`.

---

## Local end-to-end test (optional)

1. Build and install version `1.0.0`.
2. Bump to `1.1.0`, run `npm run tauri:build`, then `npm run updater:latest-json -- --base-url http://127.0.0.1:8787 --notes "Local test"`.
3. Temporarily set the updater endpoint to `http://127.0.0.1:8787/latest.json` and `"dangerousInsecureTransportProtocol": true` **only in a test build of 1.0.0**.
4. Serve the bundle folder:

   ```bash
   npx --yes serve src-tauri/target/release/bundle -p 8787
   ```

5. Open the installed `1.0.0` test build → toast → **Install Now** → restart on `1.1.0`.

Do not ship `dangerousInsecureTransportProtocol: true` in production.

---

## Version checklist

Before every release, confirm:

- [ ] `package.json`, `tauri.conf.json`, and `Cargo.toml` versions match
- [ ] New version is **greater** than what users already have (SemVer)
- [ ] `plugins.updater.endpoints` points at a reachable `latest.json`
- [ ] Private signing key is available (`TAURI_SIGNING_PRIVATE_KEY` or local `.updater-keys/*.key`)
- [ ] `latest.json` `version`, `platforms.*.url`, and `platforms.*.signature` are valid
- [ ] Signature text is the **contents** of the `.sig` file, not a file path
- [ ] Installed `1.0.0` (or previous) shows the toast after `latest.json` is published

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No toast after publishing | Installed app version ≥ `latest.json` version, or endpoint URL still has `YOUR_ORG`, or `latest.json` not attached to the GitHub **latest** release |
| Toast shows, **Install Now** fails | Wrong signature, URL 404, or artifact built with a **different** private key than `plugins.updater.pubkey` |
| `tauri:build` fails about signing | Missing `TAURI_SIGNING_PRIVATE_KEY` / `_PATH`. Generate or restore `src-tauri/.updater-keys/poc-desktop-tauri.key` |
| Toast in `tauri dev` but not in browser | Expected. Browser has no updater plugin. Use `npm run updater:preview` for UI |
| Users on an old key never update | Public key in their installed binary does not match the key that signed the new artifacts. Ship a full installer |

---

## Files involved

| Path | Role |
|---|---|
| `src-tauri/tauri.conf.json` | `pubkey`, `endpoints`, `createUpdaterArtifacts` |
| `src-tauri/capabilities/default.json` | `updater:default`, `process:default` |
| `src-tauri/src/lib.rs` | Registers updater + process plugins |
| `src/renderer/components/UpdateToast.tsx` | Bottom-left toast UI |
| `src/renderer/hooks/useAppUpdater.ts` | Check → download → install → relaunch |
| `scripts/tauri-build.mjs` | Signed `tauri build` wrapper |
| `scripts/generate-latest-json.mjs` | Builds `latest.json` from `.sig` artifacts |
| `.github/workflows/release.yml` | Tag-triggered multi-platform release |
