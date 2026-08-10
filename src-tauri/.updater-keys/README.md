# Updater signing keys

Tauri verifies every update against the **public** key in `tauri.conf.json`.
The matching **private** key must stay secret.

| File | Commit? | Purpose |
|---|---|---|
| `poc-desktop-tauri.key` | **Never** | Signs updater artifacts |
| `poc-desktop-tauri.key.pub` | No (already copied into `tauri.conf.json`) | Public half of the pair |

Generate (only if this folder is empty **and** you have not shipped an app yet):

```bash
npx tauri signer generate --ci -w src-tauri/.updater-keys/poc-desktop-tauri.key
```

If users already have a build, do **not** generate a new key. Reuse the original private key or they will not receive updates.

See `docs/AUTO_UPDATES.md`.
