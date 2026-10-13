import { useState } from 'react'
import type { DocumentSnapshot, Workspace } from '../../shared/api'

function App(): React.JSX.Element {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [document, setDocument] = useState<DocumentSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const openFolder = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const next = await window.margin.workspace.open()
      if (next) {
        setWorkspace(next)
        setDocument(null)
      }
    } catch {
      setError('Could not open this folder. Check that it is accessible.')
    } finally {
      setBusy(false)
    }
  }
  const openFile = async (path: string): Promise<void> => {
    try {
      setDocument(await window.margin.document.read(path))
      setError('')
    } catch {
      setError('Could not read this file. It may have moved or been deleted.')
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
                className={document?.path === path ? 'active' : ''}
                onClick={() => void openFile(path)}
              >
                {path}
              </button>
            ))}
          </nav>
        )}
        {document ? (
          <pre className="document-preview">{document.content}</pre>
        ) : (
          <div className="empty-state">
            <p>{workspace ? 'Choose a Markdown file.' : 'Open a folder. Start writing.'}</p>
          </div>
        )}
      </div>
    </main>
  )
}
export default App
