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
- spawning workers/processes
- exposing safe APIs to the renderer

Do not turn the Electron main process into a giant backend.

Long-running or CPU-heavy work should run in workers, utility processes, or dedicated services.

---

## Preload / IPC boundary

Keep the renderer isolated from Node.

Expose narrow, typed APIs through the preload layer.

Prefer APIs based on user intentions:

```ts
workspace.open()
workspace.listFiles()
document.read(path)
document.write(path, contents)
search.query(query)
```

rather than exposing low-level primitives such as unrestricted filesystem access.

IPC contracts should be typed on both sides.

Avoid synchronous IPC.

Treat IPC boundaries similarly to an internal API boundary.

---

# Editor Architecture

CodeMirror 6 is the canonical editing engine.

Markdown source text remains canonical.

React must not mirror the entire editor document into component state.

Avoid patterns like:

```ts
const [content, setContent] = useState(entireDocument)
```

for every editor update unless there is a specific justified reason.

CodeMirror owns active editor state.

React owns surrounding application UI.

Use CodeMirror extensions for editor-specific behavior such as:

- Markdown syntax
- decorations
- keymaps
- selections
- editor commands
- custom Markdown presentation

Do not rebuild editor functionality manually in React.

---

# State Management

Use the smallest appropriate state scope.

Prefer, in order:

1. local component state
2. CodeMirror state for editor concerns
3. small shared React contexts where appropriate
4. Zustand for genuinely application-global state

Do not create one giant global store.

Do not duplicate the same state across CodeMirror, React, Zustand, and the Electron process.

Each piece of state should have an obvious owner.

Persist only what actually needs persistence.

---

# Filesystem Rules

Workspace files belong to the user.

Always assume files may change outside Margin.

Operations should eventually tolerate:

- external edits
- external deletes
- external renames
- files being created by other programs
- Git operations changing many files
- editor crashes

Never silently overwrite external modifications without appropriate safeguards.

Use filesystem watchers where useful, but do not assume watcher events are perfectly reliable or arrive exactly once.

Normalize paths at system boundaries.

Do not scatter raw path manipulation throughout UI components.

---

# Search Architecture

Search should be designed as a replaceable service.

Do not tightly couple search implementation to the palette UI.

Conceptually support multiple retrieval sources:

```text
file names
headings
lexical text
semantic chunks
recent documents
commands
```

The UI should consume normalized results.

A search result should be capable of describing:

```ts
type SearchResult = {
  id: string
  kind: string
  title: string
  subtitle?: string
  preview?: string
  path?: string
  position?: {
    line?: number
    column?: number
  }
  score: number
}
```

The exact type may evolve.

The important principle is that search engines should not determine presentation.

---

# Semantic Search

Semantic search is important, but it must not compromise the fundamental architecture.

Embeddings and vector indexes are caches.

They are never user data.

Semantic indexing should eventually:

- operate incrementally
- run outside the renderer
- understand Markdown structure
- prefer heading/section-aware chunks
- survive interruption
- tolerate stale results
- rebuild cleanly

Margin must remain fully usable while semantic indexing is unavailable.

Do not block file opening or editing while embeddings are generated.

---

# Commands

Important application actions should be represented as commands.

A command should have a stable identifier.

For example:

```ts
{
  id: "workspace.open-file",
  title: "Open File",
  shortcut: "Mod+P",
  execute: ...
}
```

Prefer commands over keyboard shortcuts implemented directly inside arbitrary components.

This allows the same action to be invoked from:

- keyboard shortcuts
- command palette
- menus
- future plugins
- automated tests

Command identifiers should remain stable where practical.

---

# UI Components

Keep the component system small.

Margin does not need a large third-party design system.

Prefer reusable primitives such as:

- Button
- IconButton
- Input
- Dialog
- Popover
- Tooltip
- Menu
- Picker
- PickerItem
- ScrollArea

Avoid introducing Material UI, Chakra, Ant Design, or similarly large design systems without a very strong justification.

Radix-style headless primitives may be used selectively when implementing accessible behavior ourselves would be error-prone.

---

# Appearance and Themes

Margin is intended to become highly customizable visually.

Do not hard-code appearance values throughout components.

Use design tokens from the beginning.

Examples:

```css
--margin-bg
--margin-surface
--margin-text
--margin-text-muted
--margin-border
--margin-accent
--margin-selection

--editor-font-family
--editor-font-size
--editor-line-height
--editor-content-width

--space-xs
--space-sm
--space-md

--radius-sm
--radius-md
```

Components should consume semantic tokens rather than literal colors whenever possible.

Bad:

```css
color: #7c7c7c;
```

Better:

```css
color: var(--margin-text-muted);
```

Theme customization itself can arrive later.

The architecture must support it now.

Do not couple component behavior to a specific theme.

---

# CSS

Prefer plain CSS.

Keep styling close to the relevant component where practical.

Prefer semantic class names.

Avoid utility-class sprawl.

Avoid excessive inline styles.

Do not introduce a CSS abstraction framework without a concrete problem that justifies it.

Use modern CSS features when they simplify the implementation.

---

# React Guidelines

Prefer simple functional components.

Components should generally have one obvious responsibility.

Avoid:

- enormous page components
- premature generic components
- unnecessary `useEffect`
- state synchronization effects
- deeply nested providers
- unnecessary memoization
- abstractions created after only one use case

Before using `useEffect`, ask whether the behavior belongs in:

- an event handler
- derived state
- CodeMirror
- a service
- Electron lifecycle code

Effects should synchronize React with something external, not compensate for unclear state ownership.

---

# TypeScript Guidelines

Use strict TypeScript.

Avoid `any`.

Prefer `unknown` when input genuinely has unknown structure and narrow it explicitly.

Public/internal architectural boundaries should have explicit types.

Prefer discriminated unions where they improve clarity.

Avoid enormous generic type machinery.

Do not create types merely to eliminate repeated primitive fields when doing so makes code harder to understand.

Runtime boundaries should validate untrusted data.

Important examples include:

- IPC
- configuration files
- theme files
- persisted application state
- future plugin APIs

---

# Error Handling

Do not silently swallow errors.

User-facing errors should explain what operation failed without exposing unnecessary implementation detail.

Developer-facing logs should preserve useful context.

Distinguish between:

- recoverable UI failure
- filesystem failure
- corrupted cache/index
- programmer invariant violation

If an index/cache becomes corrupted, rebuilding it is preferable to risking user documents.

Never repair internal state by modifying Markdown files unless that modification is explicitly part of a user command.

---

# Logging

Keep logging structured and useful.

Avoid noisy permanent logs in hot paths.

Do not log document contents by default.

Do not log secrets, tokens, private file contents, or embedding payloads unnecessarily.

Logs should help diagnose:

- startup
- workspace loading
- indexing
- search
- IPC failures
- filesystem errors

---

# Testing Philosophy

Prioritize tests around behavior that would be expensive to regress.

Important areas include:

- file operations
- search ranking
- command behavior
- path handling
- Markdown chunking
- index updates
- IPC contracts
- keyboard navigation
- search result selection
- editor persistence

Pure transformation functions should generally have unit tests.

Complex UI workflows should have focused integration tests.

Avoid testing implementation details.

Do not create tests solely to increase coverage numbers.

For bug fixes, add a regression test when practical.

---

# Performance Guidelines

Be suspicious of work performed:

- on every keystroke
- during React render
- on the Electron main thread
- synchronously across IPC
- across the entire workspace

Search interactions may occur several times per second.

Design accordingly.

Where useful, support:

- cancellation
- incremental results
- debouncing
- result limits
- stale-result rejection
- background processing

Do not optimize hypothetical bottlenecks with complicated architecture.

Measure meaningful bottlenecks before optimizing them.

---

# Accessibility

Minimal UI does not mean inaccessible UI.

Interactive elements should have appropriate semantic roles and labels.

Keyboard focus must remain visible and predictable.

Dialogs and palettes should manage focus correctly.

Escape should behave consistently.

Do not remove accessibility behavior simply because Margin primarily targets keyboard-heavy technical users.

---

# Security

Electron security defaults matter.

Keep:

- `contextIsolation` enabled
- renderer Node access disabled
- preload APIs narrow
- IPC channels explicit

Do not expose:

```ts
window.fs
window.require
window.exec
```

or similarly unrestricted privileged interfaces.

Treat Markdown as untrusted input.

Never execute code embedded in Markdown.

External URLs should be handled deliberately rather than being allowed to navigate the application window arbitrarily.

---

# Dependency Policy

Before adding a dependency, answer:

1. What concrete problem does it solve?
2. Would implementing the required subset ourselves be simpler?
3. Is the dependency actively maintained?
4. What is its runtime/bundle cost?
5. Does it impose architecture on the project?
6. Can we remove or replace it later?

Prefer small focused dependencies.

Do not add a package for trivial utility functions.

Do not introduce overlapping libraries solving the same problem.

---

# Scope Discipline

Margin V0 exists to prove:

> Markdown editing + extremely good fuzzy/text/semantic navigation is a compelling product.

Features outside that loop should generally wait.

Examples of features that should NOT be introduced casually during V0:

- backlinks
- graph views
- databases
- canvases
- collaboration
- accounts
- cloud sync
- mobile clients
- rich-text block editors
- plugin marketplaces
- AI chat assistants
- large settings systems
- complex layouts
- workspace dashboards

A feature being useful does not mean it belongs in V0.

---

# Product Decision Heuristic

When deciding between two implementations, prefer the one that makes Margin:

1. faster
2. simpler
3. more keyboard-friendly
4. easier to understand
5. less dependent on Margin-specific state
6. easier to maintain
7. more consistent across platforms

If a proposed feature makes Margin resemble a traditional IDE or knowledge-management application, reconsider whether it belongs.

---

# AI Agent Working Rules

Before making substantial changes:

1. Inspect the existing architecture.
2. Read relevant files before modifying them.
3. Understand existing conventions.
4. Prefer extending existing patterns over inventing new ones.
5. Identify whether the change belongs in renderer, preload, main, or worker code.

Do not perform broad refactors unrelated to the requested task.

Do not rename or move large parts of the repository unless the task requires it.

Do not introduce speculative abstractions for future features.

Do not implement future roadmap items unless they are necessary for the current task.

When requirements are ambiguous, choose the smallest implementation consistent with Margin's principles.

---

# Implementation Style

Favor vertical slices.

A feature should ideally progress through:

```text
user interaction
    ↓
application command
    ↓
typed service boundary
    ↓
implementation
    ↓
user-visible result
```

Avoid implementing large infrastructure layers with no user-visible consumer.

Build enough architecture to support the current feature cleanly.

Then iterate.

---

# Changes Should Be Reviewable

Prefer small coherent changes.

Avoid mixing:

- formatting
- refactoring
- dependency upgrades
- architecture changes
- feature implementation

in one change unless necessary.

Do not rewrite working code merely to match personal preference.

Preserve existing behavior unless changing it is part of the task.

---

# Documentation

Important architectural decisions should be documented.

Comments should explain why something exists, not restate obvious code.

Good:

```ts
// Search runs outside the renderer because semantic and lexical
// indexing must never compete with editor responsiveness.
```

Bad:

```ts
// Set loading to true.
setLoading(true)
```

Update documentation when behavior or architecture materially changes.

---

# Development Commands

Use the package manager already configured by the repository.

For Margin this is expected to be `pnpm`.

Before assuming a command exists, inspect `package.json`.

Typical commands may include:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Do not invent scripts that are not present.

After changes, run the narrowest relevant validation first.

Before considering substantial work complete, run available:

```text
type checking
linting
relevant tests
build
```

Fix errors introduced by the change.

Do not silently ignore failing validation.

---

# Git

Do not modify Git history unless explicitly requested.

Do not:

- force push
- rewrite commits
- delete branches
- run destructive cleanup commands

without explicit instruction.

Do not commit generated build output unless the repository intentionally tracks it.

Keep generated caches, indexes, local databases, and personal workspace data out of Git.

---

# Definition of Done

A feature is not complete merely because it works in the happy path.

Before finishing a task, consider:

- Does it preserve Markdown as source of truth?
- Is it keyboard accessible?
- Does it block the renderer or main process?
- Does it behave sensibly when files change externally?
- Does it follow existing architecture?
- Did we introduce unnecessary dependencies?
- Are appearance values theme-ready?
- Are important boundaries typed?
- Is failure handled appropriately?
- Are relevant tests present?
- Does the application still typecheck/build?
- Did this make Margin more complicated than necessary?

Most importantly:

> Does this make the core Margin experience better?

If not, reconsider the change.
