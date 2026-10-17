import { useEffect, useRef, useState } from 'react'

interface PreviewTarget {
  path?: string
  line?: number
  column?: number
  length?: number
}
interface Preview extends PreviewTarget {
  path: string
  lines: string[]
  error?: boolean
}

export function FilePreview({
  path,
  line,
  column,
  length,
  pending = false
}: PreviewTarget & { pending?: boolean }): React.JSX.Element {
  const [preview, setPreview] = useState<Preview | null>(null)
  // Scoped to this picker: closing it discards potentially stale filesystem data.
  const cache = useRef(new Map<string, string[]>())
  useEffect(() => {
    if (!path || pending) return
    let cancelled = false
    const timer = setTimeout(() => {
      const target = { path, line, column, length }
      const cached = cache.current.get(path)
      if (cached) {
        setPreview({ ...target, lines: cached })
        return
      }
      void window.margin.document.read(path).then(
        ({ content }) => {
          if (cancelled) return
          const lines = content.split(/\r?\n/)
          // Keep both entry count and retained text bounded without a global cache.
          if (content.length <= 256_000) {
            if (cache.current.size >= 12) cache.current.delete(cache.current.keys().next().value!)
            cache.current.set(path, lines)
          }
          setPreview({ ...target, lines })
        },
        () => {
          if (!cancelled) setPreview({ ...target, lines: [], error: true })
        }
      )
    }, 60)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [path, line, column, length, pending])

  const visible = path || pending ? preview : null
  const updating =
    pending ||
    Boolean(
      path &&
      (preview?.path !== path ||
        preview.line !== line ||
        preview.column !== column ||
        preview.length !== length)
    )
  const start = visible?.line ? Math.max(0, visible.line - 9) : 0
  return (
    <section className="file-preview" aria-busy={updating}>
      <header className="preview-header">
        <span className="preview-path" title={visible?.path}>
          {visible?.path ?? 'Preview'}
        </span>
        <span className="preview-location">
          {visible?.line ? `Line ${visible.line}` : 'Markdown'}
        </span>
      </header>
      <div className="preview-scroll">
        {!visible ? (
          <p className="picker-empty">
            {path || pending ? 'Loading preview…' : 'Select a result to preview.'}
          </p>
        ) : visible.error ? (
          <p className="picker-empty" role="status">
            Preview unavailable.
          </p>
        ) : visible.lines.length === 1 && !visible.lines[0] ? (
          <p className="picker-empty">Empty Markdown file.</p>
        ) : (
          <div className="preview-source">
            {visible.lines.slice(start, visible.line ? visible.line + 8 : 30).map((text, index) => {
              const number = start + index + 1
              const active = number === visible.line
              const from = active ? Math.max(0, (visible.column ?? 1) - 1) : 0
              return (
                <div key={number} className={`preview-line ${active ? 'preview-line-active' : ''}`}>
                  <span className="preview-number" aria-hidden="true">
                    {number}
                  </span>
                  <span className="preview-text">
                    {active ? (
                      <>
                        {text.slice(0, from)}
                        <mark>{text.slice(from, from + (visible.length ?? 0))}</mark>
                        {text.slice(from + (visible.length ?? 0))}
                      </>
                    ) : (
                      text || '\u00a0'
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
