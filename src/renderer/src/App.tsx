import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Workspace } from '../../shared/api'
import { EditorController } from './editor/controller'
import { EditorSurface } from './editor/EditorSurface'
import type { AppearanceSettings } from '../../shared/appearance'
import { applyAppearance } from './appearance'
import { AppearanceDialog } from './components/AppearanceDialog'
import { commandTooltip, shellCommandForKey, type ShellCommandId } from './commands'
import { Icon } from './components/Icon'

function App({ initialAppearance }: { initialAppearance: AppearanceSettings }): React.JSX.Element {
  const [appearance, setAppearance] = useState(initialAppearance)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [controller] = useState(() => new EditorController(window.margin.document))
  const editor = useSyncExternalStore(controller.subscribe, controller.snapshot)
  const [filesExpanded, setFilesExpanded] = useState(false)
  const filesToggle = useRef<HTMLButtonElement>(null)
  const filesPanel = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const unsubscribe = window.margin.workspace.onChanged((change) => {
      if (alive) {
        setWorkspace(change.workspace)
        void controller.refresh(change.changedPaths)
      }
    })
    void window.margin.workspace
      .current()
      .then((workspace) => {
        if (alive) setWorkspace(workspace)
      })
      .catch(() => {
        if (alive) setError('Could not restore the workspace. Open a folder to continue.')
      })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [controller])
  useEffect(
    () =>
      window.margin.window.onClosing(() => {
        controller.setLocked(true)
        void Promise.all([controller.flush(), window.margin.appearance.read()])
          .then(([saved]) => {
            if (!saved) controller.setLocked(false)
            return window.margin.window.confirmClose(saved)
          })
          .catch(() => {
            controller.setLocked(false)
            setError('Could not finish saving. The window was kept open.')
            void window.margin.window.confirmClose(false)
          })
      }),
    [controller]
  )
  const openFolder = useCallback(async (): Promise<void> => {
    controller.setLocked(true)
    setBusy(true)
    setError('')
    try {
      if (!(await controller.flush())) return
      const next = await window.margin.workspace.open()
      if (next) {
        setWorkspace(next)
        controller.reset()
      }
    } catch {
      setError('Could not open this folder. Check that it is accessible.')
    } finally {
      setBusy(false)
      controller.setLocked(false)
    }
  }, [controller])
  const executeCommand = useCallback(
    (id: ShellCommandId): void => {
      if (id === 'workspace.open') {
        if (!busy && !editor.locked) void openFolder()
      }
      if (id === 'workspace.toggle-files' && workspace) {
        setFilesExpanded(!filesExpanded)
        if (filesExpanded) {
          if (editor.path) controller.focus()
          else filesToggle.current?.focus()
        }
      }
      if (id === 'appearance.open') {
        setFilesExpanded(false)
        setSettingsOpen(true)
      }
    },
    [busy, editor.locked, editor.path, controller, filesExpanded, openFolder, workspace]
  )
  useEffect(() => {
    if (filesExpanded)
      filesPanel.current?.querySelector<HTMLButtonElement>('[aria-current], button')?.focus()
  }, [filesExpanded])
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (settingsOpen || event.defaultPrevented) return
      if (event.key === 'Escape' && filesExpanded) {
        event.preventDefault()
        setFilesExpanded(false)
        filesToggle.current?.focus()
        return
      }
      const command = shellCommandForKey(event)
      if (command) {
        event.preventDefault()
        executeCommand(command)
      }
    }
    const focus = (): void => {
      void controller.refresh()
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('focus', focus)
    }
  }, [controller, executeCommand, filesExpanded, settingsOpen])
  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="app-name">Margin</span>
        <span className="workspace-name" title={workspace?.root}>
          {workspace?.name}
        </span>
        <button
          className="icon-button"
          aria-label="Open Folder"
          title={commandTooltip('workspace.open')}
          disabled={busy || editor.locked}
          onClick={() => executeCommand('workspace.open')}
        >
          <Icon name="folder" />
        </button>
      </header>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {workspace?.warnings.map((warning) => (
        <p className="notice" key={warning}>
          {warning}
        </p>
      ))}
      <div className="workspace-body">
        <aside className="navigation-rail" aria-label="Workspace controls">
          <button
            ref={filesToggle}
            className="icon-button"
            aria-label="Toggle files"
            disabled={!workspace}
            title={commandTooltip('workspace.toggle-files')}
            aria-expanded={filesExpanded}
            aria-controls={workspace ? 'workspace-files' : undefined}
            onClick={() => executeCommand('workspace.toggle-files')}
          >
            <Icon name="files" />
          </button>
          <button
            className="icon-button settings-toggle"
            aria-label="Appearance settings"
            title={commandTooltip('appearance.open')}
            onClick={() => executeCommand('appearance.open')}
          >
            <Icon name="settings" />
          </button>
        </aside>
        {workspace && (
          <nav
            ref={filesPanel}
            id="workspace-files"
            className={`file-list ${filesExpanded ? 'expanded' : ''}`}
            inert={!filesExpanded}
            aria-label="Markdown files"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setFilesExpanded(false)
                filesToggle.current?.focus()
                return
              }
              const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
              if (!keys.includes(event.key)) return
              const buttons = [...event.currentTarget.querySelectorAll('button')]
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : Math.max(
                        0,
                        Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))
                      )
              event.preventDefault()
              buttons[next]?.focus()
            }}
          >
            {workspace.files.length === 0 && <p>No Markdown files.</p>}
            {workspace.files.map((path) => (
              <button
                key={path}
                disabled={busy || editor.locked}
                aria-current={editor.path === path ? 'page' : undefined}
                className={editor.path === path ? 'active' : ''}
                onClick={() => {
                  void controller.open(path).then(() => {
                    if (controller.snapshot().path === path) setFilesExpanded(false)
                  })
                }}
              >
                {path}
              </button>
            ))}
          </nav>
        )}
        <section
          className="writing-pane"
          aria-label="Writing surface"
          onPointerDown={() => setFilesExpanded(false)}
        >
          {editor.status === 'error' && (
            <button className="inline-action" onClick={() => void controller.flush()}>
              Retry save
            </button>
          )}
          {editor.status === 'conflict' && (
            <div className="conflict-actions">
              <button
                disabled={editor.locked}
                onClick={() => void controller.resolveConflict('disk')}
              >
                Use disk version
              </button>
              <button
                disabled={editor.locked}
                onClick={() => void controller.resolveConflict('local')}
              >
                Keep my version
              </button>
              <button disabled={editor.locked} onClick={() => void controller.saveCopy()}>
                Save a copy…
              </button>
            </div>
          )}
          {editor.status === 'missing' && (
            <div className="conflict-actions">
              <button disabled={editor.locked} onClick={() => void controller.saveCopy()}>
                Save a copy…
              </button>
              <button onClick={() => void controller.refresh()}>Check again</button>
              <button onClick={() => controller.closeUnavailable()}>Close if unchanged</button>
            </div>
          )}
          {editor.openError && (
            <p className="notice" role="alert">
              {editor.openError}
            </p>
          )}
          {editor.error && (
            <p className="notice" role="alert">
              {editor.error}
            </p>
          )}
          {editor.path && (
            <div className="document-heading">
              <span>{editor.path}</span>
              <span aria-live="polite">
                {editor.status === 'dirty'
                  ? 'Unsaved'
                  : editor.status === 'saving'
                    ? 'Saving…'
                    : editor.status === 'saved'
                      ? 'Saved'
                      : ''}
              </span>
            </div>
          )}
          <div className={editor.path ? 'editor-host' : 'editor-host hidden'}>
            <EditorSurface controller={controller} activePath={editor.path} />
          </div>
          {!editor.path && (
            <div className="empty-state">
              <p>
                {workspace
                  ? 'Open Files to choose a Markdown document.'
                  : 'Open a folder. Start writing.'}
              </p>
            </div>
          )}
        </section>
      </div>
      {settingsOpen && (
        <AppearanceDialog
          settings={appearance}
          onSaved={(next) => {
            setAppearance(next)
            applyAppearance(next)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  )
}
export default App
