import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { Workspace } from '../../shared/api'
import { EditorController } from './editor/controller'
import { EditorSurface } from './editor/EditorSurface'

function App(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [controller] = useState(() => new EditorController(window.margin.document))
  const editor = useSyncExternalStore(controller.subscribe, controller.snapshot)
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
        void controller
          .flush()
          .then((saved) => {
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
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'o' &&
        !busy &&
        !editor.locked
      ) {
        event.preventDefault()
        void openFolder()
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
  }, [busy, editor.locked, controller, openFolder])
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Margin</h1>
        <span className="workspace-name" title={workspace?.root}>
          {workspace?.name}
        </span>
        <button
          title="Open Folder (Ctrl/Cmd+Shift+O)"
          disabled={busy || editor.locked}
          onClick={() => void openFolder()}
        >
          Open Folder
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
        {workspace && (
          <nav
            className="file-list"
            aria-label="Markdown files"
            onKeyDown={(event) => {
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
                onClick={() => void controller.open(path)}
              >
                {path}
              </button>
            ))}
          </nav>
        )}
        <section className="writing-pane" aria-label="Writing surface">
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
              <p>{workspace ? 'Choose a Markdown file.' : 'Open a folder. Start writing.'}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
export default App
