import { useEffect, useId, useRef, useState } from 'react'
import { defaultAppearance } from '../../../shared/appearance'
import { Icon } from './Icon'
import './FontPicker.css'

const fonts = [
  { label: 'System sans', value: defaultAppearance.fontFamily },
  { label: 'System serif', value: 'ui-serif, Georgia, serif' },
  { label: 'System monospace', value: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Palatino', value: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif" },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Consolas', value: 'Consolas, "Liberation Mono", monospace' }
]

export function FontPicker({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  // Keep fonts saved by earlier versions selectable without offering free-form CSS input.
  const options = fonts.some((font) => font.value === value)
    ? fonts
    : [{ label: value, value }, ...fonts]
  const selected = options.find((font) => font.value === value)!
  const matches = options.filter((font) =>
    font.label.toLowerCase().includes(query.trim().toLowerCase())
  )
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(font: (typeof fonts)[number]): void {
    onChange(font.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="setting-row font-picker">
      <label htmlFor={id}>Editor font family</label>
      <div className="font-picker-control">
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-options` : undefined}
          aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={open ? `Search fonts · ${selected.label}` : undefined}
          value={open ? query : selected.label}
          onFocus={() => {
            setOpen(true)
            setQuery('')
            setActive(options.indexOf(selected))
          }}
          onClick={() => {
            if (!open) {
              setOpen(true)
              setQuery('')
              setActive(options.indexOf(selected))
            }
          }}
          onBlur={() => {
            setOpen(false)
            setQuery('')
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              setActive((index) =>
                !open
                  ? options.indexOf(selected)
                  : matches.length
                    ? (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
                      matches.length
                    : 0
              )
            } else if (event.key === 'Enter' && open) {
              event.preventDefault()
              if (matches[active]) choose(matches[active])
            } else if (event.key === 'Escape' && open) {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              setQuery('')
            }
          }}
        />
        <Icon name="chevron-down" />
      </div>
      {open && (
        <div className="font-picker-menu">
          <ul ref={list} id={`${id}-options`} role="listbox" aria-label="Editor fonts">
            {matches.map((font, index) => (
              <li
                id={`${id}-option-${index}`}
                key={font.value}
                role="option"
                aria-selected={font.value === value}
                className={index === active ? 'font-option active' : 'font-option'}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(font)}
              >
                <span>{font.label}</span>
                <span
                  className="font-option-preview"
                  style={{ fontFamily: font.value }}
                  aria-hidden="true"
                >
                  Aa
                </span>
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p role="status">No matching fonts</p>}
          <p className="font-picker-hint">Fonts use local fallbacks when unavailable.</p>
        </div>
      )}
    </div>
  )
}
