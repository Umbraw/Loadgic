<div align="center">

# Loadgic

## An Open-Source Visualizer for Code Logic and Runtime Execution

[![Project Page](https://img.shields.io/badge/Project-Page-blue?logo=microsoft)](https://github.com/Umbraw/Loadgic?tab=readme-ov-file)

</div>

---

## News

* **06-01-2026**: Start of the Loadgic visualizer project

---

## Overview

**Loadgic** is an open-source desktop application that visualizes code logic and execution flow.  
It helps developers better understand, analyze, and debug their programs by transforming complex code structures into intuitive visual representations.

This project is built with:

* Vite  
* React  
* TypeScript  
* Electron  
* CodeMirror 6 (file viewer)  
* PixiJS  
* Tree-sitter (multi-language structural analysis)  

---

## Features

* Project folder import and tree explorer  
* File viewer with syntax highlighting (CodeMirror)  
* Binary files are detected and skipped in the viewer  
* Manual analyzer override (per-file) for unknown/no-extension files  
* Inspector: structural analysis for multiple languages (JS/TS, Python, Go, Rust, Java, C/C++, C#, PHP, Ruby, JSON, YAML)  
* Inspector detail tabs: click any symbol to open a dedicated detail view (multiple detail tabs supported)  
* Inspector detail view: collapsible sections (overview, usage, diagnostics, definitions) with occurrence navigation  
* TypeScript/JavaScript detail: uses local `tsserver` (from the `typescript` package) for richer symbol info when available  
* Python detail: uses local `pyright` (LSP) for hover/definitions/references/signatures when available  
* Markdown/YAML overview (text-based fallback without WASM)  

---

## Requirements (for development)

To work on the project locally, you need:

* Node.js **20+** (recommended)  
* npm (included with Node.js)  

---

## Installation (for developers)

From the project root:

```bash
cd app
npm install
````

This installs all dependencies required for development.
It also prepares Tree-sitter WASM files automatically (core + optional pack).

> Note: Markdown overview works without WASM. Other languages rely on Tree-sitter WASM.

---

## Run in development mode

### Windows (default)

```bash
npm run dev
```

### Linux (X11)

```bash
npm run dev:x11
```

### Linux (Wayland)

```bash
npm run dev:wayland
```

This launches the app with hot-reload (recommended while coding).
Changes in the code will automatically refresh the application.

---

## Analyzer System

Loadgic uses **Tree-sitter** for multi-language parsing.  
WASM files are copied to `app/public/treesitter/` on install/build.

For JS/TS detail tabs, Loadgic also queries **tsserver** locally (from the `typescript` dependency) to enrich symbol details.  
Python detail tabs use **pyright** locally (LSP) for richer symbol information.

**Core pack (enabled by default):**
- JavaScript, JSX, TypeScript, TSX
- Python
- JSON
- YAML

**Optional pack (toggle in Settings):**
- Go, Rust, Java, C, C++, C#, PHP, Ruby

Markdown is analyzed with a lightweight text parser (no WASM required).

---

## Build the application (create a real program)

To generate a production version of the application:

```bash
npm run build
```

This command will:

1. Compile TypeScript (`tsc`)
2. Build the frontend with Vite (`vite build`)
3. Package the app using Electron Builder (`electron-builder`)

After the build, the generated application can be found here:

```
app/release/<version>/
```

Example:

```
app/release/0.0.1/
```

On Linux, you will typically get:

* An **AppImage** (portable executable)
* A `linux-unpacked/` folder containing the raw executable

---

## Run the built application (Windows)

After running:

```bash
npm run build
```

On Windows, the build typically generates in:

app/release/<version>/

One or more of the following files:

A .exe installer (recommended)

A win-unpacked/ folder containing the portable executable

Option 1 — Installer (.exe)
Simply double-click the generated .exe file and follow the installer.

Option 2 — Portable version
You can also run the executable directly:

```bash
cd app/release/0.0.1/win-unpacked
Loadgic.exe
```

## Run the built application (Linux)

### Option 1 — AppImage (recommended)

Make the file executable and launch it:

```bash
chmod +x Loadgic-Linux-0.0.1.AppImage
./Loadgic-Linux-0.0.1.AppImage
```

Or via file manager:

* Right-click the AppImage
* Properties
* Allow executing
* Double click

### Option 2 — Unpacked version

```bash
cd app/release/0.0.1/linux-unpacked
./Loadgic
```

---

## Clean build files (cross-platform)

To remove all generated build artifacts and caches (Windows / Linux / macOS):

```bash
npm run clean
```

This removes:

* `dist/`
* `dist-electron/`
* `release/`
* `builder-debug.yml`
* `builder-effective-config.yaml`
* temporary caches and logs

This does **not** delete your source code.

---

## Project Scripts Summary

| Command               | Description                                        |
| --------------------- | -------------------------------------------------- |
| `npm run dev`         | Launch app in development mode (Windows / default) |
| `npm run dev:x11`     | Launch app on Linux using X11                      |
| `npm run dev:wayland` | Launch app on Linux using Wayland                  |
| `npm run build`       | Build and package the app                          |
| `npm run clean`       | Remove all build artifacts (cross-platform)        |
| `npm run preview`     | Preview Vite frontend only (browser)               |
| `npm run lint`        | Run ESLint checks                                  |

---

## Technical notes (for contributors)

This project uses cross-platform tooling to ensure compatibility between Windows and Linux:

* `cross-env` → allows environment variables in npm scripts across platforms
* `rimraf` → replaces Unix-only commands like `rm -rf` with a portable solution

This avoids common platform-specific issues in development scripts.

---

## License

Licensed under the MIT License. See `LICENSE.md`.

---

## Contributing

Contributions, ideas, and feedback are welcome!
Feel free to open issues or pull requests on the GitHub repository.
