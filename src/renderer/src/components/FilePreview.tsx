import { useEffect, useState } from 'react'

export function FilePreview({
  path,
  line,
  column,
  length
}: {
  path?: string
  line?: number
  column?: number
  length?: number
}): React.JSX.Element {
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let cancelled = false
    const timer = setTimeout(() => {
      void window.margin.document.read(path).then(
        ({ content }) => {
          if (!cancelled) setPreview({ path, content })
        },
        () => {
          if (!cancelled) setPreview({ path, content: '' })
        }
      )
    }, 75)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [path])
  if (!path) return <p className="picker-empty">Select a result to preview.</p>
  if (preview?.path !== path)
    return (
      <p className="picker-empty" role="status">
        Loading preview…
      </p>
    )
  if (!preview.content)
    return (
      <p className="picker-empty" role="status">
        Preview unavailable or empty.
      </p>
    )
  const lines = preview.content.split(/\r?\n/)
  const start = line ? Math.max(0, line - 9) : 0
  return (
    <pre className="preview-source">
      {lines.slice(start, line ? line + 8 : 30).map((text, index) => {
        const number = start + index + 1
        const active = number === line
        const from = active ? Math.max(0, (column ?? 1) - 1) : 0
        return (
          <span key={number} className={`preview-line ${active ? 'preview-line-active' : ''}`}>
            <span className="preview-number">{number}</span>
            {active ? (
              <>
                {text.slice(0, from)}
                <mark>{text.slice(from, from + (length ?? 0))}</mark>
                {text.slice(from + (length ?? 0))}
              </>
            ) : (
              text
            )}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}
