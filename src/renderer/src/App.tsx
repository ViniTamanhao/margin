import { useEffect, useState, useSyncExternalStore } from 'react'
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
      if (alive) setWorkspace(change.workspace)
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
  }, [])
  const openFolder = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const next = await window.margin.workspace.open()
      if (next) {
        setWorkspace(next)
        controller.reset()
      }
    } catch {
      setError('Could not open this folder. Check that it is accessible.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>Margin</h1>
        <span className="workspace-name" title={workspace?.root}>
          {workspace?.name}
        </span>
        <button disabled={busy} onClick={() => void openFolder()}>
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
          <nav className="file-list" aria-label="Markdown files">
            {workspace.files.length === 0 && <p>No Markdown files.</p>}
            {workspace.files.map((path) => (
              <button
                key={path}
                className={editor.path === path ? 'active' : ''}
                onClick={() => void controller.open(path)}
              >
                {path}
              </button>
            ))}
          </nav>
        )}
        <section className="writing-pane" aria-label="Writing surface">
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
                  : editor.status === 'loading'
                    ? 'Opening…'
                    : ''}
              </span>
            </div>
          )}
          <div className={editor.path ? 'editor-host' : 'editor-host hidden'}>
            <EditorSurface controller={controller} />
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
