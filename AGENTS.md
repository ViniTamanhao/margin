# AGENTS.md

## Project: Margin

Margin is a minimal, local-first, keyboard-first Markdown editor focused on extremely fast navigation and retrieval across text.

The central product idea is:

> Telescope for prose.

Margin should make finding and moving through Markdown feel closer to Telescope in Neovim than to navigating a traditional notes application.

The primary workflow is:

1. Open a normal directory containing Markdown files.
2. Write in Markdown.
3. Invoke a keyboard-driven finder.
4. Search by filename, heading, exact text, or eventually semantic meaning.
5. Jump directly to the relevant document or passage.
6. Continue writing.

Margin is not intended to become an Obsidian clone, knowledge graph, Notion clone, IDE, or general-purpose productivity platform.

When making architectural or product decisions, optimize for the workflow above.

---

# Core Product Principles

## 1. Markdown files are the source of truth

User content lives in ordinary `.md` files.

Never require Margin-specific document formats for core functionality.

Do not make SQLite, application state, indexes, embeddings, or caches authoritative copies of user documents.

Margin should remain useful even if every internal database/index is deleted.

Internal state may always be reconstructed from the filesystem.

---

## 2. Local-first by default

Core editing and navigation must work without an account, server, or internet connection.

Do not introduce cloud dependencies into core functionality.

Future online features such as sync may exist, but they must remain separate from the local editing architecture.

---

## 3. Search is navigation

Search is not an auxiliary feature.

Search is Margin's primary navigation model.

Prefer interactions such as:

- quick open
- fuzzy file search
- heading search
- workspace text search
- semantic search
- recent documents
- command palette

over permanent navigation chrome.

A feature that improves finding and jumping between pieces of text is generally more valuable than another visible panel.

---

## 4. Keyboard-first

Every important workflow should be usable efficiently without a mouse.

Keyboard interaction is a first-class API.

When introducing interactive UI, consider:

- keyboard shortcut
- focus behavior
- arrow-key navigation
- Enter behavior
- Escape behavior
- focus restoration
- predictable selection
- command discoverability

Do not bolt keyboard support onto mouse-first interfaces afterward.

---

## 5. Minimal UI

Margin should expose complexity when invoked rather than displaying it permanently.

Prefer:

- commands over toolbars
- palettes over large panels
- temporary overlays over permanent UI
- contextual actions over visible action collections

Do not add UI merely because similar applications have it.

Every permanent visual element should justify the space it occupies.

---

## 6. Performance is a product feature

Margin must feel immediate.

Avoid architectures where UI responsiveness depends on:

- filesystem scanning
- indexing
- embeddings
- database work
- parsing the entire workspace
- expensive synchronous IPC

The editor and command palette must remain responsive while background work occurs.

When possible:

- perform work incrementally
- cache reconstructable results
- avoid unnecessary React renders
- debounce appropriately
- cancel obsolete searches
- move CPU-heavy work outside the renderer
- measure before introducing complicated optimization

A theoretically elegant implementation that feels slower is usually the wrong implementation.

---

## 7. Consistency over novelty

Prefer boring, understandable technology over clever abstractions.

Margin will be developed heavily with AI assistance.

Architecture should therefore be:

- explicit
- conventional
- discoverable
- strongly typed
- easy to trace
- difficult to misuse

Avoid unnecessary metaprogramming, hidden behavior, abstraction layers, and framework-specific magic.

---

# Technology Direction

The intended application stack is:

- Electron
- React
- TypeScript
- Vite / electron-vite
- CodeMirror 6
- Zustand where global application state is actually needed
- plain CSS
- CSS custom properties/design tokens
- SQLite for reconstructable application metadata/indexes
- background workers or utility processes for expensive operations

Additional dependencies should be added deliberately.

Before introducing a library, ask whether the problem is sufficiently difficult or general to justify increasing Margin's dependency surface.

---

# Application Architecture

Keep the application divided conceptually into:

```text
Renderer
    ↓
Typed application APIs
    ↓
Electron main process
    ↓
Services / workers
    ↓
Filesystem, search, indexes, OS
```

## Renderer

The renderer owns presentation and interaction.

Typical renderer responsibilities:

- React UI
- CodeMirror editor instances
- command palette UI
- keyboard interaction
- transient UI state
- application state needed for rendering

The renderer should not:

- recursively scan workspaces
- perform expensive indexing
- generate embeddings
- run long synchronous filesystem operations
- directly access unrestricted Node APIs

---

## Electron main process

The main process owns privileged desktop capabilities and application lifecycle.

Typical responsibilities:

- windows
- dialogs
- filesystem access
- workspace lifecycle
- OS integration
-
