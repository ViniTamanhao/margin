# Margin V0 — Sessions 0, 1 and 2

## Implemented

- **Foundation:** retained the existing Electron/React/TypeScript/electron-vite setup;
  enabled strict TypeScript explicitly; replaced starter IPC with a typed, narrow
  preload bridge; enabled sandboxing and context isolation with Node integration off;
  denied renderer navigation and popup windows; replaced the starter screen with a
  restrained shell and semantic CSS tokens.
- **Workspaces:** native folder selection, asynchronous recursive Markdown discovery,
  normalized relative paths, directory exclusions and symlink rejection, visible
  workspace identity, a temporary keyboard-accessible file list, last-folder
  persistence/restoration, graceful handling of unavailable previous folders, and
  debounced incremental filesystem watching with lifecycle cleanup.
- **Writing:** CodeMirror 6 with Markdown syntax, wrapping, selections, undo/redo,
  serif typography, per-file in-session selection/history retention, loading from
  original files, 650 ms autosave, manual save, visible save state, and flushes before
  closing or replacing the workspace.
- **External changes:** clean documents reload; local edits pause autosave on conflict;
  users can adopt disk contents, explicitly retain local contents, or save a new copy.
  Removed/renamed/unreadable documents retain the editor buffer. Autosave does not
  recreate missing files, and unresolved dirty buffers prevent closing the window.

## Architectural decisions

1. React owns only surrounding UI and small presentation snapshots. A local editor
   controller owns CodeMirror `EditorState` sessions and the active `EditorView`.
   Whole documents are never mirrored into React or Zustand. Zustand is unnecessary.
2. The shared API defines contracts/channel names; preload exposes intent-based
   async methods and unsubscribe functions. Main-process handlers validate request
   types, revision hashes and the owning main frame. There is no general IPC or
   filesystem bridge exposed to the renderer.
3. Window lifecycle, IPC wiring and filesystem services are separate modules.
   Discovery and watching stay outside React. Scans use asynchronous filesystem calls;
   watcher events incrementally update the list rather than rescanning on every edit.
4. The workspace is an ordinary directory. Application state persists only its last
   root in Electron userData; it contains no document database or authoritative cache.
5. Document saves use content revisions, a per-file write queue, two disk checks,
   same-directory staging, flushing and atomic replacement. Permission bits are
   preserved. Existing files cannot be overwritten by the Save a copy operation.
   Recovery snapshots preserve the observed original and proposed edit outside the
   workspace. Save failures keep the buffer and offer retry/recovery.
6. The file list is temporary scaffolding. There is no command registry, search system,
   theme UI, index, SQLite storage or speculative architecture for later sessions.

## Dependencies added

| Dependency                  | Purpose                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `@codemirror/state`         | Immutable document/selection state and per-file sessions.                       |
| `@codemirror/view`          | Canonical editor view, wrapping, input, selections and keymaps.                 |
| `@codemirror/commands`      | Standard editing commands and undo/redo history.                                |
| `@codemirror/lang-markdown` | Markdown language support.                                                      |
| `@codemirror/language`      | Syntax highlighting.                                                            |
| `chokidar` 4                | Cross-platform recursive watching, normalized events and atomic-write handling. |
| `vitest` (development)      | Focused filesystem/path/persistence regression tests.                           |

Chokidar's [upstream documentation](https://github.com/paulmillr/chokidar/tree/4.0.3)
explains the watcher behavior used here. The Electron smoke tests use existing Electron
and Node capabilities; no browser automation package or UI framework was added.

## Progressive commits

Every slice was reviewed and validated before committing. No previous history was
rewritten or squashed.

| Commit                                                                                    | Contents                                                                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `8d504fd` — `chore: establish isolated application shell and typed preload API`           | Security defaults, strict TypeScript, typed bridge, starter removal and tokens.                     |
| `5878a56` — `feat: add folder selection and safe Markdown workspace discovery`            | Native selection, discovery, path validation, loading, list and filesystem tests.                   |
| `807afaa` — `feat: restore recent workspace and watch Markdown file changes`              | JSON state persistence, restoration, watcher lifecycle and incremental events/tests.                |
| `43f9bf5` — `feat: integrate CodeMirror Markdown surface and per-file editor state`       | Editor integration, Markdown, wrapping, undo/redo and in-session selection state.                   |
| `de36fec` — `feat: add revision-checked autosave and flush edits before closing`          | Debounce, revision checks, write queue, recovery snapshots and close handshake.                     |
| `d4953bb` — `feat: handle external document changes and recover conflicting edits safely` | Reload/conflict handling, explicit resolution, copy recovery, focus fix and Electron smoke harness. |
| `31efe25` — `fix: preserve document permissions during atomic saves`                      | Explicit chmod avoids umask changing file permissions; private recovery files; regression test.     |
| `04fc6a9` — `style: refine writing typography and keyboard file navigation`               | Correct CodeMirror CSS precedence, arrow/Home/End navigation and smoke assertions.                  |
| `docs: document Sessions 0–2 architecture and validation`                                 | README and this implementation report.                                                              |

## Validation

Validated on Linux with the existing desktop display:

| Command                                                  | Result                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                         | Pass: main/preload/shared and renderer, with strict TypeScript.                                 |
| `pnpm lint`                                              | Pass.                                                                                           |
| `pnpm test`                                              | Pass: 9 tests across 3 files.                                                                   |
| `pnpm build`                                             | Pass: production main, preload and renderer bundles.                                            |
| `pnpm test:smoke`                                        | Pass: real Electron workflow plus restoration and missing-folder startup in separate processes. |
| `pnpm dev -- --user-data-dir=/tmp/margin-dev-validation` | Development server and Electron launched successfully; stopped after startup validation.        |
| `git diff --check`                                       | Pass for every commit slice.                                                                    |

Filesystem tests cover nested discovery/exclusions, traversal/symlink refusal, reading,
watcher creates/modifies/renames/deletes and workspace switching, state persistence,
exact UTF-8 saves, permissions, recovery versions, stale saves, deleted-file refusal,
serialized competing writes, invalid UTF-8, and exclusive recovery-copy creation.

Electron smoke checks verify isolated/sandboxed preload, deterministic folder picker
wiring, file-list keyboard navigation and opening, editing, autosave, undo/redo,
selection restoration, applied typography/spacing tokens, clean external reload,
conflicts with no stale overwrite, refusal to close unresolved edits, both conflict
resolution choices, saving a recovery copy, immediate close flushing, restoration
following process restart and graceful startup after the old workspace disappears.
Native dialogs are substituted by the test; their OS presentation is not automated.
The final screenshot was rendered and inspected for layout and typography.

Existing package scripts invoke npm internally, which emits warnings about pnpm/mirror
configuration keys; all validation commands still succeed. Existing pnpm configuration
also emits a deprecation notice about the old package.json build-allowlist field. These
setup warnings were not expanded into unrelated dependency/configuration upgrades.

## Known limits and deferred work

- Filesystem revision checks are optimistic. A separate program can still replace a
  file between the final comparison and rename because ordinary cross-platform APIs
  offer no compare-and-swap replacement. Recovery retains observed disk/local copies,
  but cannot guarantee preservation of an unseen external replacement in that gap.
- A full crash/power-loss recovery system is not implemented. Unsaved edits within
  the debounce window are in memory, and the containing directory is not fsynced.
- Recovery snapshots currently have no retention limit or recovery browser; they may
  grow over time. They can be removed independently of the canonical Markdown files.
- Files must be UTF-8. Symlinks are excluded and hard-linked documents refuse writes.
  Normal LF/CRLF files are supported; unusual mixed line endings are not guaranteed
  byte-for-byte preservation after editing. Atomic replacement preserves permission
  bits, but not every filesystem's ownership, ACL or extended metadata.
- File selections/history persist for the current session only. A clean external reload
  clamps selections and starts a fresh undo history. Renames are presented as removal
  plus creation; Margin does not guess which new file should receive a dirty buffer.
- Watchers depend on OS delivery; network filesystems and very large workspaces were
  not benchmarked. Reopening a folder rescans it. Focus/open also recheck cached
  document contents independently of watcher events.
- Automated desktop validation ran on Linux. Windows/macOS packaging and native picker
  presentation still need platform-specific smoke checks.
- Later sessions retain fuzzy/text/semantic navigation, palettes, theming UI, backlinks,
  graphs, plugins, sync and AI. None were implemented in this change.
