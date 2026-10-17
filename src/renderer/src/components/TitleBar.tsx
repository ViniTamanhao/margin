import { useEffect, useState, type ReactNode } from 'react'
import type { WindowAction, WindowState } from '../../../shared/api'
import { Icon } from './Icon'

export function TitleBar({
  children,
  onError
}: {
  children: ReactNode
  onError: (message: string) => void
}): React.JSX.Element {
  const [state, setState] = useState<WindowState | null>(null)
  useEffect(() => {
    let current = true
    let changed = false
    const unsubscribe = window.margin.window.onStateChanged((next) => {
      changed = true
      if (current) setState(next)
    })
    void window.margin.window
      .state()
      .then((next) => {
        if (current && !changed) setState(next)
      })
      .catch(() => {
        if (current) onError('Could not read window controls.')
      })
    return () => {
      current = false
      unsubscribe()
    }
  }, [onError])

  function action(intent: WindowAction): void {
    void window.margin.window
      .action(intent)
      .catch(() => onError('Could not update the window. Try again.'))
  }
  return (
    <header
      className="app-header"
      data-focused={state?.focused ?? true}
      data-fullscreen={state?.fullscreen ?? false}
    >
      {children}
      {window.margin.window.platform === 'linux' && !state?.fullscreen && (
        <div className="window-controls" role="group" aria-label="Window controls">
          <button
            className="window-control"
            aria-label="Minimize window"
            title="Minimize"
            disabled={!state?.minimizable}
            onClick={() => action('minimize')}
          >
            <Icon name="minimize" />
          </button>
          <button
            className="window-control"
            aria-label={state?.maximized ? 'Restore window' : 'Maximize window'}
            title={state?.maximized ? 'Restore' : 'Maximize'}
            disabled={!state?.maximizable}
            onClick={() => action('toggle-maximize')}
          >
            <Icon name={state?.maximized ? 'restore' : 'maximize'} />
          </button>
          <button
            className="window-control"
            aria-label="Close window"
            title="Close"
            onClick={() => action('close')}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </header>
  )
}
