import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './Picker.css'

export interface PickerItem {
  id: string
  title: string
  subtitle?: string
  detail?: string
}
interface PickerProps<T extends PickerItem> {
  label: string
  busy?: boolean
  emptyMessage: string
  getItems(query: string): readonly T[]
  onSelect(item: T): void
  onClose(): void
}

// Input retains DOM focus; aria-activedescendant exposes keyboard/mouse selection.
export function Picker<T extends PickerItem>({
  label,
  busy = false,
  emptyMessage,
  getItems,
  onSelect,
  onClose
}: PickerProps<T>): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const id = useId()
  const items = useMemo(() => getItems(query).slice(0, 100), [getItems, query])
  const found = items.findIndex((item) => item.id === activeId)
  const active = found < 0 ? 0 : found
  const optionId = (index: number): string => `${id}-option-${index}`

  useEffect(() => {
    restoreFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    element?.showModal()
    input.current?.focus()
    return () => {
      if (element?.open) {
        element.close()
        restoreFocus.current?.focus()
      }
    }
  }, [])
  useLayoutEffect(() => {
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [id, active, query])

  const close = (): void => {
    dialog.current?.close()
    restoreFocus.current?.focus()
    onClose()
  }
  const select = (item: T): void => {
    close()
    onSelect(item)
  }
  return (
    <dialog
      ref={dialog}
      className="picker"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
    >
      <input
        ref={input}
        className="picker-input"
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-autocomplete="list"
        aria-controls={`${id}-results`}
        aria-activedescendant={items.length ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={label}
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveId(null)
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const next = Math.max(
              0,
              Math.min(items.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))
            )
            setActiveId(items[next]?.id ?? null)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (items[active]) select(items[active])
          }
        }}
      />
      <div
        className="picker-results"
        id={`${id}-results`}
        role="listbox"
        aria-label={label}
        aria-busy={busy}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            className="picker-option"
            onMouseMove={() => setActiveId(item.id)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => select(item)}
          >
            <span className="picker-option-text">
              <span>{item.title}</span>
              {item.subtitle && <span className="picker-subtitle">{item.subtitle}</span>}
            </span>
            {item.detail && <span className="picker-detail">{item.detail}</span>}
          </div>
        ))}
      </div>
      {!items.length && (
        <p className="picker-empty" role="status">
          {emptyMessage}
        </p>
      )}
    </dialog>
  )
}
