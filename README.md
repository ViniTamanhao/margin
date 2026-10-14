# Margin

A minimal, local-first, keyboard-first Markdown editor. **Telescope for prose.**

Sessions 0–2 provide normal folder workspaces and a CodeMirror writing surface.
Markdown files remain the source of truth; there is no project format or database.

## Run

```sh
pnpm install
pnpm dev
```

Open Folder selects a directory using the native system picker. Nested `.md` files
appear in the temporary file list; `.git`, `node_modules`, `.hg`, `.svn` and symbolic
links are excluded. The last workspace is restored on startup if it is accessible.

- **Ctrl/Cmd+Shift+O:** Open Folder.
- **Tab, Up/Down, Home/End, Enter:** navigate and open files in the temporary list.
- **Ctrl/Cmd+S:** flush pending saves.
- Standard CodeMirror selection, undo and redo shortcuts work in the editor.

Edits autosave after 650 ms of inactivity. Closing the window or changing folders
flushes pending edits first. Clean documents reload external changes; conflicting
local edits stay in memory and pause autosave. Choose the disk version, explicitly
keep your version, or save your edits to a new file. A conflict or failed save keeps
the window open.

## Architecture

```text
src/renderer/src     React shell, CodeMirror and transient editor sessions
src/shared/api.ts    Typed IPC contracts and explicit channel names
src/preload          Narrow, asynchronous context bridge
src/main/ipc.ts      Dialog/API wiring and runtime request validation
src/main/services    Workspace discovery/watching, documents and lightweight state
src/main             Window creation and close lifecycle
```

The renderer has no Node or filesystem API. Context isolation, sandboxing and a
content security policy are enabled. Navigation and new renderer windows are denied.
The main process uses asynchronous filesystem operations. No Zustand is needed at
this scope: React owns presentation, CodeMirror owns documents/selections/history,
and ordinary Markdown files own persisted content.

## Save safety and recovery

Saves compare SHA-256 revisions before staging and again immediately before
replacement. Writes are serialized per file, staged next to the original, flushed,
and renamed into place. File permission bits are preserved. Missing files are never
recreated by autosave; symlink and hard-linked documents are not writable.

Before replacement, the observed disk version and proposed local version are retained
under Electron's `userData/recovery` directory. Each document directory contains a
`source.json` with its original path and content-addressed `.md` versions. These copies
are recovery material, not authoritative documents. They currently have no automatic
retention policy or recovery browser.

Independent programs do not share Margin's save queue. Ordinary filesystem APIs do
not provide a compare-and-swap rename, so there remains a small race between the final
revision check and replacement. The observed disk and local versions are recoverable;
an unseen external replacement in that interval cannot be guaranteed recoverable.

Files must be valid UTF-8. LF and CRLF documents are supported. Cursor positions and
undo histories are retained only during the current session; external reloads reset
undo history. Edits still inside the debounce window are not crash recovery drafts.

## Validate

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:smoke
```

GitHub Actions runs frozen-lockfile installation, type checking, linting, unit tests
and the production build on pull requests and pushes to `main` and `develop`, using
Node 24 and pnpm 12 as configured in `mise.toml`. The desktop smoke test remains a
local validation.

`test:smoke` requires a desktop display and a current production build. It launches the
real Electron application against temporary files, substitutes deterministic native
dialog results, and checks editing, saving, conflicts, keyboard navigation, window
closing and workspace restoration across separate processes. It leaves its temporary
artifacts and screenshot in the printed path for inspection.

See [the Sessions 0–2 implementation report](docs/sessions-0-2-report.md) for decisions,
validation, commit progression and remaining limits. Search, palettes, themes,
backlinks, graphs, plugins, sync and AI are deferred to later sessions.
