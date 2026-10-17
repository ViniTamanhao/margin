# Margin

A minimal, local-first, keyboard-first Markdown editor. **Telescope for prose.**

Margin provides normal folder workspaces, a CodeMirror writing surface, contextual
Markdown presentation, transient keyboard pickers and lightweight appearance settings.
Markdown files remain the source of truth; there is no project format or database.

## Run

```sh
pnpm install
pnpm dev
```

Development and builds require a C compiler (`cc` on Linux/macOS, `clang` with the
Windows SDK on Windows; override with `CC`). Vite builds the small native rename
helper automatically; `pnpm test` builds it before running tests. Packages must be
built for the host platform and architecture. The helper is bundled under
`resources/native` and unpacked from ASAR; it has no Node/Electron ABI dependency.

Open Folder selects a directory using the native system picker. Folders (including empty folders) and nested `.md` files
appear in a collapsible tree in the temporary Files panel; `.git`, `node_modules`, `.hg`, `.svn` and symbolic
links are excluded. The last workspace is restored on startup if it is accessible.

- **Ctrl/Cmd+P:** Quick Open Markdown files by fuzzy filename or relative path.
- **Ctrl/Cmd+Shift+P:** Command Palette; type **Go to Heading** for current-document headings.
- **Alt+Left / Alt+Right:** Back / Forward through navigation locations.
- **Ctrl/Cmd+Shift+O:** Open Folder.
- **Ctrl/Cmd+B:** expand/collapse Files; opening a file collapses the panel.
- **Ctrl/Cmd+,:** Settings.
- **Escape:** close the active picker, close Files, or cancel appearance changes and restore focus.
- **Tab:** enter or leave the file tree.
- **Up/Down, Home/End:** move between visible folders and files.
- **Right/Left:** expand/collapse a folder, or move to its first child/parent.
- **Enter/Space:** toggle a folder or open a Markdown file.
- **F2 (tree focus):** rename the selected item inline.
- **Delete (tree focus):** Move to Trash, with confirmation.
- **Shift+F10 / context-menu key (tree focus):** open the item's action menu.
- **Ctrl/Cmd+S:** flush pending saves.
- Standard CodeMirror selection, undo and redo shortcuts work in the editor.

Edits autosave after 650 ms of inactivity. Closing the window or changing folders
flushes pending edits first. Clean documents reload external changes; conflicting
local edits stay in memory and pause autosave. Choose the disk version, explicitly
keep your version, or save your edits to a new file. A conflict or failed save keeps
the window open.

## Keyboard navigation

Quick Open, Command Palette and Go to Heading share one centered `Picker`: a query
input, active result, Up/Down movement, Enter activation and Escape cancellation.
The input keeps focus and exposes its selected listbox option through
`aria-activedescendant`. Mouse movement and keyboard movement share selection.
Native modal dialogs contain focus; cancellation restores the previously focused
control. Activation closes the picker before opening a file, another picker or Settings.
Only the first 100 matches are rendered. Matching is memoized by query and the caller's
stable matching callback; arrow movement and hover only update selection. The three
picker callers stabilize callbacks against their actual file, command or heading data.
All styles consume the existing theme tokens.

Quick Open searches the workspace's existing Markdown paths entirely in memory.
Replaceable matching functions score case-insensitive subsequences, favoring word
and camel-case boundaries, contiguous runs and filename matches over path-only
matches. Ties are deterministic. An empty query orders known recent files first,
then uses stable relative-path ordering. No filesystem scan or IPC occurs per query.
Deleted files disappear through the existing watcher. A failed open preserves the
active document and reports the unavailable target.

`commands.ts` contains explicit stable IDs, titles and shortcuts. The application
binds their enabled predicates and handlers in one registry. Controls, shortcuts and
palette entries use that registry's execution boundary; unavailable commands are
hidden from the palette. Application shortcuts run before CodeMirror keymaps,
including Alt+Arrow navigation. Settings remains the existing appearance dialog.

`EditorController` owns a small in-memory `NavigationSession`. Successful file opens
from either the sidebar or Quick Open and explicit heading jumps record departure
locations as `{ path, position }`. Cursor movement and typing do not record history.
Back/Forward restore document, primary cursor, editor focus and scroll around the
location. Duplicate consecutive locations are suppressed, and new navigation after
Back clears Forward. History is bounded to 100 entries per direction; recents are
unique, most-recent-first and bounded to 50 files. Both reset on a workspace switch
or app restart. Failed and superseded opens do not advance history or recents.
Unavailable history targets report an error and preserve the current location and
stacks. Stored offsets are clamped after document changes; they are not semantic
anchors that track text edits.

Go to Heading reads the active CodeMirror document, including unsaved edits. It
uses the existing Markdown syntax tree for ATX and Setext heading levels, excludes
code fences and indented code, and strips common inline markers from result titles.
Parsing finishes in short budgets with yields, and cancelled or stale requests are
rejected. Only heading metadata enters React state. Selecting a heading moves the
cursor to its source start, scrolls it into view and records a return location. If
the source changed while the picker was open, reopen it to get current targets.
The command is available from Command Palette without assigning another shortcut.

## Workspace file operations

The Files panel has quiet New File/New Folder buttons and a small context menu.
The same stable commands (`workspace.new-file`, `workspace.new-folder`,
`workspace.rename`, `workspace.trash`) are available in Command Palette when enabled.
New File/New Folder have no global shortcuts. F2 and Delete are handled only by
focused tree rows, leaving normal editor and input behavior intact.

The selected filesystem item is separate from the active document. Creation targets
the selected folder, the selected file's parent, or the workspace root when the
background is selected. Click empty tree space to select the root. New names and
renames use an inline input: Enter confirms, Escape cancels, and validation errors
keep editing active. File rename initially selects the stem. `notes` becomes
`notes.md`; other file extensions are rejected. A folder's full name is editable,
including names that end in `.md`. New files start empty and open in CodeMirror.
New folders and renamed items are selected and revealed in the tree.

Typed, asynchronous preload methods `workspace.createFile`, `createFolder`,
`rename`, and `trash` carry a workspace root plus relative paths/names. Main validates
request shapes; `WorkspaceFiles` validates the root's identity, every parent segment,
actual filesystem type and names. Absolute/traversing paths, ignored directories,
symlinks and reserved names are rejected. Exclusive file creation and `mkdir` reject
collisions without overwriting existing paths. Rename uses an atomic OS no-replace
operation for both files and folders, after collision and source-identity checks.
Linux uses `renameat2(RENAME_NOREPLACE)`, macOS uses `renamex_np(RENAME_EXCL)`, and
Windows uses `MoveFileExW` without replacement flags. A destination created after
preflight is rejected without replacing it, even when it is an empty directory.
Unsupported filesystems fail safely; there is no ordinary-rename or copy/delete
fallback. Operations and watcher updates are serialized; monotonic snapshot versions
reject stale renderer snapshots. Delayed
watcher events inspect the current path rather than trusting an old event's meaning.
Successful replies and operation notifications update the UI immediately.

Before rename or Trash, `EditorController` locks editing and flushes affected cached
documents. Conflict, missing and failed-save states block the operation. A rename
cannot replace a different cached destination session, even if it disappeared from
the filesystem. Prefix remapping preserves active/cached sessions, primary cursor,
undo history, autosave timers, Back/Forward locations, recents and heading targets.
Folder rename remaps all known descendants. Markdown links are left untouched.
Watcher refreshes wait until session keys have been remapped or removed.

Move to Trash always uses a native confirmation, defaulting to Cancel. Folder
confirmation explicitly warns that the folder may contain files Margin does not
display. Main revalidates the item after confirmation and uses Electron's
`shell.trashItem`; there is no permanent-delete fallback. Trashed documents are
removed from cached sessions and navigation only after success. Failures preserve
the original editor state and show a useful error.

Parent traversal still uses Node's path APIs rather than descriptor-relative
operations. Identity and symlink checks cannot exclude an external program replacing
a source or parent between validation and the OS call. Atomic no-replace protects
the destination from overwrite; stronger source/parent protection remains separate.

## Appearance and Markdown presentation

Settings contains Light/Dark mode, an editor font family, and separate editor
(12–32 px) and interface (11–20 px) font sizes, all with live preview. Both themes use neutral gray surfaces, selections and focus accents.
The editor defaults to system sans-serif at 18 px. The searchable font dropdown offers system, serif, monospace, and familiar font
stacks, with a small preview. Fonts use local fallbacks when unavailable; no fonts
are downloaded. Type to filter, use arrows and Enter to select, or Escape to dismiss
the list before dismissing Settings. Existing custom font stacks remain selectable. Choose **Done** to save; Cancel/Escape restores
the saved appearance. Existing settings without font sizes use 18 px editor and 13 px interface defaults.
Obsolete custom colors and the legacy `fontSize` field are removed on the next save. Legacy unversioned files still migrate the exact former
default serif stack to system sans; versioned files preserve intentional font choices.

Files expands into a real grid column beside the editor with a short transition,
then collapses after opening a file or using Escape/Ctrl/Cmd+B. It resizes the
writing surface and supports reduced motion. A single draggable title strip shows a quiet document basename (full relative path
in its tooltip) and the folder action, alongside native window controls. Electron
hides the separate OS title text; no permanent wordmark is shown. Window controls
follow theme previews and reserve their own space in the strip.
Only Unsaved/Saving states use status space; Saved disappears.
Conflict and error feedback remains in the writing pane.

UI styles share a small token set in `assets/base.css`: a default 13 px interface font,
relative navigation and helper text sizes, controls and icon buttons that grow with text, the existing
spacing scale, and 4 px control / 8 px dialog corners. File navigation uses padded
rows with folder disclosure icons and indentation. Expansion is kept for the current
workspace session; folder changes outside Margin update the tree. Empty messages and recovery actions have explicit spacing.
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
restoration, Quick Open, palette execution, heading jumps, Back/Forward cursor
restoration, deleted picker targets, active file/content previews, delayed-response
races, heading typography, shortcut reference focus, and workspace/settings restoration across
separate processes. It also bundles a test-only instrumented caller of the real
Picker to check recomputation, and runs inline creation, rename/undo/history,
context-menu, conflict-blocking and external watcher workflows. The Trash boundary
is replaced only in the temporary workspace and its confirmation payloads are
checked, including the unseen-folder warning. No personal files are moved to Trash.
It leaves its temporary artifacts and screenshots in the printed path for inspection.

See [the Sessions 0–2 implementation report](docs/sessions-0-2-report.md) for decisions,
validation, commit progression and remaining limits. Semantic indexing, backlinks,
graphs, tabs, split panes, persistent navigation, configurable shortcuts, plugins,
sync and AI remain deferred.

## Content search and previews

Quick Open (Ctrl/Cmd+P) searches filenames and relative paths only. Search Workspace
(Ctrl/Cmd+Shift+F) searches literal text in Markdown files with smart case: lowercase
queries ignore case, queries containing uppercase letters match case. Results are
ordered by path, line and column, capped at 100 in the picker (200 at the API boundary).
Each match carries a workspace-relative path, one-based line/column, and a zero-based
CodeMirror UTF-16 position. Enter uses the existing navigation session, so Alt+Left
restores the previous document and cursor.

The replaceable main-process ContentSearchService streams the existing workspace
file list, validates paths through WorkspaceService, excludes ignored folders and
symlinks, and yields regularly. No new dependency or system binary is required.
Bundled ripgrep is deferred until cross-platform binary distribution is established.
Queries debounce for 100 ms; the typed IPC API explicitly cancels superseded work,
and the picker rejects stale responses. Unreadable or externally removed files are
skipped with a developer log; results reflect saved disk text, not unsaved buffers.

Quick Open and content search share an optional Picker preview pane. Only the active
file is read through document.read after 75 ms; late responses are discarded. Preview
reads never touch editor sessions, recents, navigation or autosave. Source previews
show the first 30 lines for files or eight context lines either side of a content
match. Previews hide below 640 px. Opening a stale search result clamps its saved
position to the current document; rerun search if external edits moved the match.

Heading typography uses parsed ATX/Setext syntax and stable line decorations,
independent of contextual marker replacement. The keyboard icon immediately above
Settings opens a transient reference derived from command definitions; Files-panel
shortcuts are contextual. Keybindings remain fixed.
