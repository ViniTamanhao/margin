# Margin

A minimal, local-first, keyboard-first Markdown editor. **Telescope for prose.**

Margin provides normal folder workspaces, a CodeMirror writing surface, contextual
Markdown presentation and lightweight appearance settings.
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
- **Ctrl/Cmd+B:** expand/collapse Files; opening a file collapses the panel.
- **Ctrl/Cmd+,:** Settings.
- **Escape:** close Files or cancel appearance changes and restore focus.
- **Tab, Up/Down, Home/End, Enter:** navigate and open files in the temporary list.
- **Ctrl/Cmd+S:** flush pending saves.
- Standard CodeMirror selection, undo and redo shortcuts work in the editor.

Edits autosave after 650 ms of inactivity. Closing the window or changing folders
flushes pending edits first. Clean documents reload external changes; conflicting
local edits stay in memory and pause autosave. Choose the disk version, explicitly
keep your version, or save your edits to a new file. A conflict or failed save keeps
the window open.

## Appearance and Markdown presentation

Settings contains only Light/Dark mode and an editor font-family field, both with
live preview. Both themes use neutral gray surfaces, selections and focus accents.
The editor defaults to system sans-serif at a fixed 18 px. Installed fonts and normal
CSS font fallback lists are supported. Choose **Done** to save; Cancel/Escape restores
the saved appearance. Old custom colors and font-size preferences are ignored and
removed on the next save. Legacy unversioned files still migrate the exact former
default serif stack to system sans; versioned files preserve intentional font choices.

Files expands into a real grid column beside the editor with a short transition,
then collapses after opening a file or using Escape/Ctrl/Cmd+B. It resizes the
writing surface and supports reduced motion. The top bar shows a quiet document
basename (full relative path in its tooltip), a persistent `Margin`
wordmark on the left, and the folder action. The wordmark uses system monospace
and follows the theme's text color.
Only Unsaved/Saving states use status space; Saved disappears.
Conflict and error feedback remains in the writing pane.

UI styles share a small token set in `assets/base.css`: a 13 px interface font,
12 px navigation and helper text, 32 px controls, 28 px icon buttons, the existing
spacing scale, and 4 px control / 8 px dialog corners. File navigation uses padded
rows. Empty messages and recovery actions have explicit spacing.
Hover is a quieter tint than selection; selected items keep their fill while hovered,
disabled controls do not gain hover feedback, and keyboard focus uses the accent ring.

Validated settings are stored in Electron's `userData/appearance.json`, separate
from workspace state and Markdown files. New saves use `{ version: 1, appearance
}`. Legacy files load through a single explicit migration boundary and become
versioned on their next save. Unsupported versions and invalid values fall back
safely. Writes are serialized and staged before rename. Missing, invalid or
unreadable settings fall back to Margin Dark.
CodeMirror viewport decorations hide ATX heading markers, single-line bold/italic
markers and inline-code backticks outside the active construct. Any touching cursor
or selection reveals its source syntax, including selections crossing constructs
and multiple cursors. Markdown source, clipboard and undo history stay canonical.
Heading text keeps the same size and weight while markers appear/disappear, though
marker widths can still shift text or wrapping. Multiline constructs, fenced code,
links, setext headings and strikethrough remain visible; this is intentionally a
small source-editor presentation layer.

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
closing, contextual syntax, Markdown clipboard behavior, appearance previews, focus
restoration and workspace/settings restoration across separate processes. It leaves
its temporary artifacts and screenshots in the printed path for inspection.

See [the Sessions 0–2 implementation report](docs/sessions-0-2-report.md) for decisions,
validation, commit progression and remaining limits. Search, palettes,
backlinks, graphs, plugins, sync and AI are deferred to later sessions.
