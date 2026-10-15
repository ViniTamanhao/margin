import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Workspace } from '../../shared/api'
import { EditorController } from './editor/controller'
import { EditorSurface } from './editor/EditorSurface'
import type { AppearanceSettings } from '../../shared/appearance'
import { applyAppearance } from './appearance'
import { SettingsDialog } from './components/SettingsDialog'
import {
  createCommandRegistry,
  commandDefinitions,
  commandTooltip,
  commandForKey,
  type CommandId
} from './commands'
import { Icon } from './components/Icon'
import { FileTree } from './components/FileTree'
import { QuickOpen } from './components/QuickOpen'
import { CommandPalette } from './components/CommandPalette'
import { HeadingPicker } from './components/HeadingPicker'

function App({ initialAppearance }: { initialAppearance: AppearanceSettings }): React.JSX.Element {
  const [appearance, setAppearance] = useState(initialAppearance)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [picker, setPicker] = useState<'files' | 'commands' | 'headings' | null>(null)
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
  const openFile = (path: string): void => {
    void controller.open(path).then((opened) => {
      if (opened) setFilesExpanded(false)
    })
  }
  const toggleFiles = useCallback((): void => {
    setFilesExpanded(!filesExpanded)
    if (filesExpanded) {
      if (editor.path) controller.focus()
      else filesToggle.current?.focus()
    }
  }, [filesExpanded, editor.path, controller])
  const commands = useMemo(
    () =>
      // The registry stores handlers; it never invokes them during render.
      // eslint-disable-next-line react-hooks/refs
      createCommandRegistry([
        {
          id: 'editor.go-to-heading',
          ...commandDefinitions['editor.go-to-heading'],
          isEnabled: () =>
            Boolean(editor.path) && editor.status !== 'missing' && !busy && !editor.locked,
          execute: () => setPicker('headings')
        },
        {
          id: 'navigation.back',
          ...commandDefinitions['navigation.back'],
          isEnabled: () => editor.canGoBack && !busy && !editor.locked,
          execute: () => controller.navigate('back')
        },
        {
          id: 'navigation.forward',
          ...commandDefinitions['navigation.forward'],
          isEnabled: () => editor.canGoForward && !busy && !editor.locked,
          execute: () => controller.navigate('forward')
        },
        {
          id: 'commands.open',
          ...commandDefinitions['commands.open'],
          isEnabled: () => !busy && !editor.locked,
          execute: () => setPicker('commands')
        },
        {
          id: 'workspace.quick-open',
          ...commandDefinitions['workspace.quick-open'],
          isEnabled: () => Boolean(workspace) && !busy && !editor.locked,
          execute: () => setPicker('files')
        },
        {
          id: 'workspace.open',
          ...commandDefinitions['workspace.open'],
          isEnabled: () => !busy && !editor.locked,
          execute: openFolder
        },
        {
          id: 'workspace.toggle-files',
          ...commandDefinitions['workspace.toggle-files'],
          isEnabled: () => Boolean(workspace) && !busy && !editor.locked,
          execute: toggleFiles
        },
        {
          id: 'settings.open',
          ...commandDefinitions['settings.open'],
          isEnabled: () => !busy && !editor.locked,
          execute: () => {
            setFilesExpanded(false)
            setSettingsOpen(true)
          }
        }
      ]),
    [
      busy,
      editor.locked,
      editor.path,
      editor.status,
      editor.canGoBack,
      editor.canGoForward,
      controller,
      workspace,
      openFolder,
      toggleFiles
    ]
  )
  const executeCommand = useCallback(
    (id: CommandId): void => {
      void commands.execute(id).catch(() => {
        setError(`Could not execute “${commandDefinitions[id].title}”. Try again.`)
      })
    },
    [commands]
  )
  useEffect(() => {
    if (filesExpanded)
      filesPanel.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
  }, [filesExpanded])
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (settingsOpen || picker || event.defaultPrevented) return
      if (event.key === 'Escape' && filesExpanded) {
        event.preventDefault()
        setFilesExpanded(false)
        filesToggle.current?.focus()
        return
      }
      const command = commandForKey(event)
      if (command) {
        event.preventDefault()
        event.stopPropagation()
        executeCommand(command)
      }
    }
    const focus = (): void => {
      void controller.refresh()
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('focus', focus)
    }
  }, [controller, executeCommand, filesExpanded, settingsOpen, picker])
  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="app-wordmark">Margin</span>
        <span className="document-name" title={editor.path ?? undefined}>
          {editor.path ? editor.path.slice(editor.path.lastIndexOf('/') + 1) : ''}
        </span>
        <span className="document-status" role="status">
          {editor.status === 'dirty' ? 'Unsaved' : editor.status === 'saving' ? 'Saving…' : ''}
        </span>
        <button
          className="icon-button"
          aria-label="Open Folder"
          title={
            workspace
              ? `${commandTooltip('workspace.open')}\n${workspace.root}`
              : commandTooltip('workspace.open')
          }
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
      <div className={`workspace-body ${filesExpanded ? 'files-expanded' : ''}`}>
        <aside className="navigation-rail" aria-label="Workspace controls">
          <button
            ref={filesToggle}
            className="icon-button"
            aria-label="Toggle files"
            disabled={!commands.get('workspace.toggle-files')?.isEnabled()}
            title={commandTooltip('workspace.toggle-files')}
            aria-expanded={filesExpanded}
            aria-controls={workspace ? 'workspace-files' : undefined}
            onClick={() => executeCommand('workspace.toggle-files')}
          >
            <Icon name="files" />
          </button>
          <button
            className="icon-button settings-toggle"
            aria-label="Settings"
            title={commandTooltip('settings.open')}
            disabled={!commands.get('settings.open')?.isEnabled()}
            onClick={() => executeCommand('settings.open')}
          >
            <Icon name="settings" />
          </button>
        </aside>
        <div className="file-panel">
          {workspace && (
            <nav
              ref={filesPanel}
              id="workspace-files"
              className={`file-list ${filesExpanded ? 'expanded' : ''}`}
              inert={!filesExpanded}
              aria-label="Workspace files"
              tabIndex={-1}
            >
              <FileTree
                key={workspace.root}
                workspace={workspace}
                activePath={editor.path}
                disabled={busy || editor.locked}
                onOpen={openFile}
              />
            </nav>
          )}
        </div>
        <section className="writing-pane" aria-label="Writing surface">
          {editor.status === 'error' && (
            <div className="conflict-actions">
              <button disabled={editor.locked} onClick={() => void controller.flush()}>
                Retry save
              </button>
            </div>
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
      {picker === 'files' && workspace && (
        <QuickOpen
          recents={editor.recents}
          files={workspace.files}
          onOpen={openFile}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'commands' && (
        <CommandPalette
          commands={commands.available()}
          onExecute={executeCommand}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'headings' && (
        <HeadingPicker controller={controller} onClose={() => setPicker(null)} />
      )}
      {settingsOpen && (
        <SettingsDialog
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
