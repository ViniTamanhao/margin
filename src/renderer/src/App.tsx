import type { WorkspaceEntry } from '../../shared/api'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { EditorController } from './editor/controller'
import { EditorSurface } from './editor/EditorSurface'
import type { AppearanceSettings } from '../../shared/appearance'
import { applyAppearance } from './appearance'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'
import { TitleBar } from './components/TitleBar'
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
import { ContentSearch } from './components/ContentSearch'
import { QuickOpen } from './components/QuickOpen'
import { CommandPalette } from './components/CommandPalette'
import { HeadingPicker } from './components/HeadingPicker'
import { useWorkspaceFiles } from './useWorkspaceFiles'

function App({ initialAppearance }: { initialAppearance: AppearanceSettings }): React.JSX.Element {
  const [appearance, setAppearance] = useState(initialAppearance)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [picker, setPicker] = useState<'files' | 'commands' | 'headings' | 'content' | null>(null)
  const [controller] = useState(() => new EditorController(window.margin.document))
  const editor = useSyncExternalStore(controller.subscribe, controller.snapshot)
  const [filesExpanded, setFilesExpanded] = useState(false)
  const filesToggle = useRef<HTMLButtonElement>(null)
  const filesPanel = useRef<HTMLElement>(null)
  const {
    workspace,
    busy,
    openFolder,
    error: workspaceError,
    selection: treeSelection,
    setSelection: setTreeSelection,
    editing: treeEditing,
    setEditing: setTreeEditing,
    treeRef,
    beginEdit,
    commitEdit,
    trash
  } = useWorkspaceFiles(controller)
  const [error, setError] = useState('')
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
          id: 'help.keyboard-shortcuts',
          ...commandDefinitions['help.keyboard-shortcuts'],
          isEnabled: () => !busy && !editor.locked,
          execute: () => setShortcutsOpen(true)
        },
        {
          id: 'editor.save',
          ...commandDefinitions['editor.save'],
          isEnabled: () => Boolean(editor.path) && !editor.locked,
          execute: async () => {
            await controller.flush()
          }
        },
        {
          id: 'workspace.new-file',
          ...commandDefinitions['workspace.new-file'],
          isEnabled: () => Boolean(workspace) && !busy && !editor.locked && !treeEditing,
          execute: (target) => {
            setFilesExpanded(true)
            beginEdit('new-file', target)
          }
        },
        {
          id: 'workspace.new-folder',
          ...commandDefinitions['workspace.new-folder'],
          isEnabled: () => Boolean(workspace) && !busy && !editor.locked && !treeEditing,
          execute: (target) => {
            setFilesExpanded(true)
            beginEdit('new-folder', target)
          }
        },
        {
          id: 'workspace.rename',
          ...commandDefinitions['workspace.rename'],
          isEnabled: (target) =>
            Boolean(target === undefined ? treeSelection : target) &&
            !busy &&
            !editor.locked &&
            !treeEditing,
          execute: (target) => {
            setFilesExpanded(true)
            beginEdit('rename', target)
          }
        },
        {
          id: 'workspace.trash',
          ...commandDefinitions['workspace.trash'],
          isEnabled: (target) =>
            Boolean(target === undefined ? treeSelection : target) &&
            !busy &&
            !editor.locked &&
            !treeEditing,
          execute: trash
        },
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
          id: 'workspace.search-content',
          ...commandDefinitions['workspace.search-content'],
          isEnabled: () => Boolean(workspace) && !busy && !editor.locked,
          execute: () => setPicker('content')
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
          id: 'window.toggle-fullscreen',
          ...commandDefinitions['window.toggle-fullscreen'],
          isEnabled: () => true,
          execute: () => window.margin.window.action('toggle-fullscreen')
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
      treeEditing,
      treeSelection,
      beginEdit,
      trash,
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
  const availableCommands = useMemo(() => commands.available(), [commands])
  const executeCommand = useCallback(
    (id: CommandId, target?: WorkspaceEntry | null): void => {
      void commands.execute(id, target).catch(() => {
        setError(`Could not execute “${commandDefinitions[id].title}”. Try again.`)
      })
    },
    [commands]
  )
  useEffect(() => {
    if (filesExpanded)
      filesPanel.current
        ?.querySelector<HTMLElement>('.tree-inline-edit input, [tabindex="0"]')
        ?.focus()
  }, [filesExpanded])
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (shortcutsOpen || settingsOpen || picker || event.defaultPrevented) return
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('.tree-inline-edit, .tree-context-menu')
      )
        return
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
  }, [controller, executeCommand, filesExpanded, shortcutsOpen, settingsOpen, picker])
  return (
    <main className="app-shell" data-platform={window.margin.window.platform}>
      <TitleBar onError={setError}>
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
      </TitleBar>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {workspaceError && (
        <p className="notice" role="alert">
          {workspaceError}
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
            className="icon-button shortcuts-toggle"
            aria-label="Keyboard Shortcuts"
            title={commandTooltip('help.keyboard-shortcuts')}
            disabled={!commands.get('help.keyboard-shortcuts')?.isEnabled()}
            onClick={() => executeCommand('help.keyboard-shortcuts')}
          >
            <Icon name="keyboard" />
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
                ref={treeRef}
                key={workspace.root}
                workspace={workspace}
                activePath={editor.path}
                selection={treeSelection}
                onSelect={setTreeSelection}
                onCommand={executeCommand}
                onCommit={commitEdit}
                onEditingChange={setTreeEditing}
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
      {picker === 'content' && workspace && (
        <ContentSearch
          root={workspace.root}
          onOpen={(result) => {
            void controller.open(result.path, result.position).then((opened) => {
              if (opened) setFilesExpanded(false)
            })
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'commands' && (
        <CommandPalette
          commands={availableCommands}
          onExecute={executeCommand}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'headings' && (
        <HeadingPicker controller={controller} onClose={() => setPicker(null)} />
      )}
      {shortcutsOpen && <KeyboardShortcuts onClose={() => setShortcutsOpen(false)} />}
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
