import { useEffect, useRef } from 'react'
import { shortcutGroups } from '../commands'
import { Icon } from './Icon'

export function KeyboardShortcuts({ onClose }: { onClose(): void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="settings-dialog shortcut-dialog"
      aria-labelledby="shortcuts-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="settings-heading">
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <button className="icon-button" aria-label="Close Keyboard Shortcuts" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="shortcut-body">
        {shortcutGroups().map((group) => (
          <section key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.shortcuts.map(({ title, shortcut }) => (
                <div className="shortcut-row" key={title}>
                  <dt>{title}</dt>
                  <dd>
                    <kbd>{shortcut}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  )
}
