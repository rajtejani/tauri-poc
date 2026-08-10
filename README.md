# Offline First Hub — Tauri Desktop App

A **Tauri v2** desktop application built as a parity counterpart to the Electron-based `POC-desktop-main`. The goal is to evaluate Electron vs Tauri across startup time, memory usage, CPU footprint, and bundle size using an identical feature set and UI.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup & Installation](#setup--installation)
- [Running the App](#running-the-app)
- [Building for Production](#building-for-production)
- [Folder Structure](#folder-structure)
- [Architecture](#architecture)
- [IPC Bridge (Tauri Commands & Events)](#ipc-bridge-tauri-commands--events)
- [LAN Sync Server API](#lan-sync-server-api)
- [Socket.IO Events](#socketio-events)
- [Auto Updates](#auto-updates)
- [Environment & Configuration](#environment--configuration)
- [Troubleshooting](#troubleshooting)

---

## Overview

| Feature | Details |
|---|---|
| **App Name** | Offline First Hub |
| **Version** | 1.0.0 |
| **App ID** | `com.offlinefirst.desktop.tauri` |
| **Window Size** | 2000 × 1000 (min 900 × 600) |
| **LAN Sync Port** | `4000` |
| **DB Engine** | SQLite via `rusqlite` (bundled) |
| **Sync Protocol** | HTTP REST + Socket.IO |

**Pages included:**
- **Dashboard** — stats overview, device list, event log
- **Tasks** — paginated task list with create/update/delete
- **Devices** — connected LAN device list
- **Printers** — thermal printer discovery and management
- **Logs** — structured event log viewer

---

## Tech Stack

### Frontend (Renderer)

| Technology | Version | Role |
|---|---|---|
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.5.3 | Type safety |
| Vite | ^5.4.2 | Dev server & bundler |
| React Router DOM | ^6.22.3 | Client-side routing |
| Zustand | ^4.5.2 | Global state management |
| Tailwind CSS | ^3.4.1 | Utility-first styling |
| Lucide React | ^0.344.0 | Icon library |
| `@tauri-apps/api` | ^2 | Tauri IPC bridge |
| `@tauri-apps/plugin-opener` | ^2 | OS file/URL opener |
| `@tauri-apps/plugin-updater` | ^2 | In-app update check / download / install |
| `@tauri-apps/plugin-process` | ^2 | Relaunch after installing an update |

### Backend (Rust / Tauri Core)

| Technology | Version | Role |
|---|---|---|
| Tauri | 2 | Desktop shell & native APIs |
| tauri-plugin-updater | 2 | Signed auto-update plugin |
| tauri-plugin-process | 2 | App relaunch after update |
| rusqlite (bundled) | 0.32 | SQLite database |
| axum | 0.7 | HTTP server for LAN sync |
| socketioxide | 0.14 | Socket.IO server |
| tokio | 1 | Async runtime |
| tower-http | 0.5 | CORS middleware |
| serde / serde_json | 1 | Serialization |
| uuid | 1 | UUID generation |
| chrono | 0.4 | Timestamps |
| parking_lot | 0.12 | Efficient mutex/rwlock |
| local-ip-address | 0.6 | LAN IP detection |
| once_cell | 1 | Global singletons |

---

## Prerequisites

Before running this project, make sure you have the following installed:

### Required

| Tool | Version | Install |
|---|---|---|
| **Node.js** | >= 18 LTS | [nodejs.org](https://nodejs.org) |
| **npm** | >= 9 | Bundled with Node.js |
| **Rust** | stable (latest) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Tauri CLI** | v2 | Installed via `npm install` (dev dep) |

### macOS Specific

```bash
# Xcode Command Line Tools (required for Rust compilation)
xcode-select --install
```

macOS **10.15 Catalina** or later is required (enforced in `tauri.conf.json`).

### Verify Installation

```bash
node --version       # should be >= 18
npm --version        # should be >= 9
rustc --version      # should be stable
cargo --version      # should be present
```

---

## Setup & Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd POC-desktop-tauri
```

### 2. Install Node.js Dependencies

```bash
npm install
```

This installs all frontend packages and the Tauri CLI (`@tauri-apps/cli`).

### 3. Install Rust Dependencies (automatic on first build)

Cargo dependencies are resolved automatically when you first run `tauri dev` or `tauri build`. No manual step needed — Cargo reads `src-tauri/Cargo.toml` and fetches all crates.

> **Note:** The first Rust compilation takes **3–10 minutes** as all crates are compiled from source. Subsequent builds are incremental and much faster.

---

## Running the App

### Development Mode

```bash
npm run tauri:dev
```

This command does the following in order:
1. Starts the Vite dev server at `http://localhost:1420`
2. Compiles the Rust backend in debug mode
3. Opens the Tauri desktop window pointing to the Vite dev server
4. Enables hot-reload for React code changes

> **Shortcut:** You can also run `npm run dev` alone if you only want to test the React UI in a browser (without Tauri APIs).

```bash
# React UI only (browser mode — no native APIs)
npm run dev
```

### TypeScript Type Check

```bash
npm run typecheck
```

---

## Building for Production

### Release Build

```bash
npm run tauri:build
```

This command:
1. Runs `tsc --noEmit` to type-check the TypeScript
2. Runs `vite build` to produce an optimized frontend bundle in `dist/`
3. Compiles the Rust backend in **release mode** (fully optimized)
4. Bundles everything into a native `.app` (macOS), `.dmg`, `.msi`, etc.

### Build Output

Artifacts are placed in:

```
src-tauri/target/release/bundle/
├── dmg/              # macOS disk image (.dmg)
├── macos/            # macOS .app bundle
└── ...               # Additional platform-specific formats
```

### Available npm Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Start Vite dev server only |
| `build` | `tsc --noEmit && vite build` | Type-check + build frontend |
| `preview` | `vite preview` | Preview the production build |
| `tauri` | `tauri` | Raw Tauri CLI passthrough |
| `tauri:dev` | `tauri dev` | Full dev mode (frontend + desktop) |
| `tauri:build` | `node scripts/tauri-build.mjs` | Signed production build (updater artifacts) |
| `updater:preview` | `VITE_PREVIEW_UPDATE_TOAST=true vite` | Preview the bottom-left update toast in the browser |
| `updater:latest-json` | `node scripts/generate-latest-json.mjs` | Build `latest.json` from signed artifacts |
| `typecheck` | `tsc --noEmit` | TypeScript type checking only |

---

## Folder Structure

```
POC-desktop-tauri/
├── index.html                    # Vite entry HTML
├── package.json                  # Node.js dependencies & scripts
├── package-lock.json             # Lockfile
├── tsconfig.json                 # Root TypeScript config
├── tsconfig.node.json            # TypeScript config for Vite/Node context
├── vite.config.ts                # Vite bundler configuration
├── tailwind.config.cjs           # Tailwind CSS configuration
├── postcss.config.cjs            # PostCSS config (autoprefixer)
├── .gitignore                    # Git ignore rules
├── docs/
│   └── AUTO_UPDATES.md           # How auto-update toast + releases work
├── scripts/
│   ├── tauri-build.mjs           # Signed tauri build wrapper
│   └── generate-latest-json.mjs
├── .github/workflows/release.yml # Tag-triggered multi-OS updater release
│
├── public/                       # Static assets served as-is
│
├── dist/                         # ⚙️ Auto-generated: Vite production output
│
├── src/                          # Frontend source (React / TypeScript)
│   ├── main.tsx                  # React root — mounts <App /> into #root
│   ├── App.tsx                   # Root layout: Sidebar + Router <Routes>
│   ├── index.css                 # Global styles / Tailwind directives
│   ├── vite-env.d.ts             # Vite environment type declarations
│   │
│   ├── renderer/                 # UI layer
│   │   ├── components/           # Reusable UI components
│   │   │   ├── Sidebar.tsx       # Navigation sidebar with route links
│   │   │   ├── TaskList.tsx      # Paginated task table with CRUD actions
│   │   │   ├── DeviceCard.tsx    # Connected device info card
│   │   │   ├── EventLog.tsx      # Scrollable structured event log
│   │   │   ├── StatCard.tsx      # Summary stat display card
│   │   │   ├── StatusBadge.tsx   # Online/offline/syncing badge
│   │   │   └── UpdateToast.tsx   # Bottom-left “New update available” toast
│   │   │
│   │   ├── pages/                # Route-level page components
│   │   │   ├── DashboardPage.tsx # Overview: stats, devices, recent logs
│   │   │   ├── TasksPage.tsx     # Full task management page
│   │   │   ├── DevicesPage.tsx   # Connected LAN devices page
│   │   │   ├── PrintersPage.tsx  # Thermal printer discovery & management
│   │   │   └── LogsPage.tsx      # Structured event log page
│   │   │
│   │   ├── hooks/                # Custom React hooks
│   │   │   ├── useAppBootstrap.ts  # App init: loads tasks, listens to Tauri events
│   │   │   ├── useAppUpdater.ts    # Check / download / install / relaunch
│   │   │   └── useTasks.ts         # Task CRUD operations via tauriBridge
│   │   │
│   │   ├── store/                # Global state (Zustand)
│   │   │   └── appStore.ts       # Tasks, devices, server status, logs
│   │   │
│   │   └── lib/                  # Renderer-side utilities
│   │       ├── tauriBridge.ts    # Tauri invoke/event wrappers (IPC layer)
│   │       ├── browserMock.ts    # Browser-mode mock for Tauri APIs
│   │       └── utils.ts          # Formatting helpers
│   │
│   └── shared/                   # Code shared between renderer and any other context
│       ├── types.ts              # Shared TypeScript types (Task, Device, etc.)
│       ├── conflictResolver.ts   # LWW (Last-Write-Wins) conflict resolution logic
│       └── utils.ts              # Shared utility functions
│
└── src-tauri/                    # Tauri / Rust backend
    ├── tauri.conf.json           # Tauri app configuration (window, bundle, security)
    ├── Cargo.toml                # Rust package manifest & dependencies
    ├── Cargo.lock                # Rust lockfile
    ├── build.rs                  # Tauri build script
    │
    ├── capabilities/             # Tauri v2 permission declarations
    │
    ├── icons/                    # App icons for all platforms
    │   ├── 32x32.png
    │   ├── 128x128.png
    │   ├── 128x128@2x.png
    │   ├── icon.icns             # macOS icon
    │   └── icon.ico              # Windows icon
    │
    ├── gen/                      # ⚙️ Auto-generated: Tauri schema/bindings
    │
    ├── target/                   # ⚙️ Auto-generated: Rust build artifacts
    │
    └── src/                      # Rust source code
        ├── main.rs               # Binary entry point (calls lib)
        ├── lib.rs                # Tauri app setup, plugin registration, command registration
        ├── commands.rs           # Tauri command handlers (invokable from frontend)
        ├── db.rs                 # SQLite database layer (schema, queries, migrations)
        ├── models.rs             # Rust data models / Serde structs
        ├── server.rs             # Axum HTTP + Socket.IO LAN sync server
        ├── conflict.rs           # LWW conflict resolution (Rust side)
        ├── logger.rs             # Structured event logger
        └── printers.rs           # Thermal printer discovery & management
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Tauri Desktop Shell                │
│                                                     │
│  ┌─────────────────────┐   ┌─────────────────────┐ │
│  │   React Renderer    │   │    Rust Backend      │ │
│  │  (WKWebView/WebView2)│◄─►│   (Native Process)  │ │
│  │                     │IPC│                     │ │
│  │  • React + TS       │   │  • SQLite (rusqlite) │ │
│  │  • Zustand store    │   │  • Tauri commands    │ │
│  │  • React Router     │   │  • Axum HTTP server  │ │
│  │  • Tailwind CSS     │   │  • Socket.IO server  │ │
│  │  • tauriBridge.ts   │   │  • Printer mgmt      │ │
│  └─────────────────────┘   └──────────┬──────────┘ │
│                                        │ Port 4000  │
└────────────────────────────────────────┼────────────┘
                                         │
                          ┌──────────────▼──────────────┐
                          │      LAN Network              │
                          │                               │
                          │  GET  /health                 │
                          │  GET  /api/tasks              │
                          │  GET  /api/devices            │
                          │  WS   / (Socket.IO)           │
                          │                               │
                          │  Mobile / Web Clients         │
                          └───────────────────────────────┘
```

### Layer Comparison (Electron vs Tauri)

| Layer | Electron (POC-desktop-main) | Tauri (this repo) |
|---|---|---|
| Shell | Electron 29 + Chromium | Tauri 2 + WKWebView (macOS) |
| DB | `better-sqlite3` (Node.js) | `rusqlite` (Rust, bundled) |
| Sync server | Express + socket.io | axum + socketioxide |
| IPC | Preload bridge (`contextBridge`) | `tauriBridge.ts` → Tauri commands/events |
| Bundle format | Electron ASAR | macOS `.app` / `.dmg` |

---

## IPC Bridge (Tauri Commands & Events)

The frontend communicates with the Rust backend exclusively through `src/renderer/lib/tauriBridge.ts`.

### Tauri Commands (Frontend → Rust)

| Command | Description |
|---|---|
| `get_tasks` | Fetch paginated task list |
| `create_task` | Create a new task |
| `update_task` | Update an existing task |
| `delete_task` | Delete a task |
| `get_devices` | Fetch connected device list |
| `get_logs` | Fetch event log entries |
| `get_server_status` | Get LAN sync server status |
| `start_server` | Start the LAN sync server |
| `stop_server` | Stop the LAN sync server |
| `get_printers` | List discovered printers |
| `print_test_page` | Send test print job |

### Tauri Events (Rust → Frontend)

| Event | Payload | Description |
|---|---|---|
| `tasks:updated` | `{ task: Task }` | A task was created/updated/deleted |
| `status:changed` | `{}` | Server status or device list changed |

---

## LAN Sync Server API

When started, the embedded Axum server listens on **port 4000** and exposes:

### HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ status: "ok", timestamp }` |
| `GET` | `/api/tasks` | Paginated tasks with keyset cursor |
| `GET` | `/api/devices` | List of connected devices |

#### Task List Query Parameters

| Param | Type | Description |
|---|---|---|
| `limit` | `number` | Page size |
| `cursorUpdatedAt` | `string` | Cursor for keyset pagination (ISO timestamp) |
| `cursorId` | `string` | Cursor task ID for tie-breaking |
| `filter` | `string` | Filter string |

---

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `device:connect` | `{ deviceId, name, type }` | Register a connecting device |
| `device:register` | `{ deviceId, name, platform }` | Register with ACK response |
| `heartbeat` | — | Ping; receives `{ serverTime }` ACK |
| `sync:request` | `{ deviceId, since?, cursor?, limit? }` | Request sync page |
| `task:create` | `{ task, operationId }` | Create task with LWW conflict check |
| `task:update` | `{ task, operationId }` | Update task with LWW conflict check |
| `task:delete` | `{ task, operationId }` | Delete task with LWW conflict check |
| `task:list` | — | Fetch current task list page |

### Server → Client (broadcasts)

| Event | Payload | Description |
|---|---|---|
| `task:created` | `Task` | A new task was applied |
| `task:updated` | `Task` | A task update was applied |
| `task:deleted` | `Task` | A task deletion was applied |
| `devices:list` | `{ devices: Device[] }` | Updated device list |
| `device:connected` | `{ device }` | Sent back to the registering client |

### Conflict Resolution

Tasks use **Last-Write-Wins (LWW)** based on `updatedAt` timestamps. If two updates arrive with the same timestamp, the lexicographically greater `id` wins. The host's version is preserved on conflict.

---

## Auto Updates

The packaged app shows a Cursor-style **bottom-left** toast when a newer signed release is published. **Install Now** downloads the update and restarts the app. Users never update manually.

Full release checklist (bump version → signed build → publish `latest.json` → toast appears):

**[docs/AUTO_UPDATES.md](./docs/AUTO_UPDATES.md)**

Quick preview of the toast UI (no release needed):

```bash
npm run updater:preview
```

---

## Environment & Configuration

### Tauri Configuration (`src-tauri/tauri.conf.json`)

| Key | Value | Description |
|---|---|---|
| `productName` | `Offline First Hub Tauri` | App display name |
| `identifier` | `com.offlinefirst.desktop.tauri` | Bundle identifier |
| `build.devUrl` | `http://localhost:1420` | Vite dev server URL |
| `app.windows[0].width` | `2000` | Default window width |
| `app.windows[0].backgroundColor` | `#0f172a` | Dark background |
| `bundle.macOS.minimumSystemVersion` | `10.15` | macOS Catalina minimum |
| `bundle.createUpdaterArtifacts` | `true` | Emit `.tar.gz` / `.sig` updater files |
| `plugins.updater.endpoints` | GitHub `latest.json` | Where installed apps check for updates |

### Vite Configuration (`vite.config.ts`)

The Vite dev server runs on port **1420** (required by Tauri's `devUrl`).

---

## Troubleshooting

### First build is very slow
This is expected. Cargo compiles all Rust crates from scratch on the first run. Subsequent builds use incremental compilation.

### `tauri:dev` can't connect to Vite
Make sure the Vite server is actually running on port `1420`. Tauri starts Vite automatically via `beforeDevCommand`, but if it fails silently, run `npm run dev` in a separate terminal first.

### Port 4000 already in use
Another process is occupying the LAN sync port. Find and kill it:
```bash
lsof -i :4000
kill -9 <PID>
```

### Rust compilation errors
Make sure your Rust toolchain is up to date:
```bash
rustup update stable
```

### macOS: App not opening (security warning)
If you're running a locally built `.app`, macOS Gatekeeper may block it. Right-click → **Open** to bypass the check, or run:
```bash
xattr -rd com.apple.quarantine /path/to/OfflineFirstHub.app
```

### Update toast never appears
The running app version must be **lower** than `latest.json`, the endpoint URL in `tauri.conf.json` must be reachable, and artifacts must be signed with the same key as `plugins.updater.pubkey`. See [docs/AUTO_UPDATES.md](./docs/AUTO_UPDATES.md).

### `xcode-select` errors on macOS
```bash
xcode-select --install
sudo xcode-select --switch /Library/Developer/CommandLineTools
```

---

## Related Projects

| Project | Description |
|---|---|
| [`../POC-desktop-main`](../POC-desktop-main) | Electron parity build |
| [`../benchmarks/METHODOLOGY.md`](../benchmarks/METHODOLOGY.md) | Benchmark methodology |
| [`../benchmarks/ASSUMPTIONS.md`](../benchmarks/ASSUMPTIONS.md) | Benchmark assumptions |
