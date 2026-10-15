// Bundled only by the desktop smoke harness; never imported by the application.
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Picker } from '../../src/renderer/src/components/Picker'

interface PickerProbe {
  calls(): number
  rerender(): void
  replaceSource(): void
  unmount(): void
}
declare global {
  interface Window {
    marginPickerProbe: PickerProbe
  }
}
let calls = 0
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)

export function Probe(): React.JSX.Element | null {
  const [source, setSource] = useState(() =>
    Array.from({ length: 120 }, (_, index) => ({ id: String(index), title: `File ${index}` }))
  )
  const [open, setOpen] = useState(true)
  const [, rerender] = useState(0)
  const getItems = useCallback(
    (query: string) => {
      calls++
      return source.filter((item) => item.title.includes(query))
    },
    [source]
  )
  useEffect(() => {
    window.marginPickerProbe = {
      calls: () => calls,
      rerender: () => rerender((value) => value + 1),
      replaceSource: () => setSource([{ id: 'new', title: 'New source' }]),
      unmount: () => {
        root.unmount()
        host.remove()
      }
    }
  }, [])
  return open ? (
    <Picker
      label="Picker regression probe"
      emptyMessage="No results."
      getItems={getItems}
      onClose={() => setOpen(false)}
      onSelect={() => setOpen(false)}
    />
  ) : null
}
root.render(<Probe />)
