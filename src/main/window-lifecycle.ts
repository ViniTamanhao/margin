import { app, BrowserWindow } from 'electron'
import { channels } from '../shared/api'

const allowed = new WeakSet<BrowserWindow>()
const pending = new WeakSet<BrowserWindow>()
let quitting = false
app.on('before-quit', () => {
  quitting = true
})

export function guardWindowClose(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (allowed.has(window) || window.webContents.isDestroyed()) return
    event.preventDefault()
    if (!pending.has(window)) {
      pending.add(window)
      window.webContents.send(channels.windowClosing)
    }
  })
}

export function confirmWindowClose(window: BrowserWindow, saved: boolean): void {
  if (!pending.has(window)) return
  pending.delete(window)
  if (!saved) {
    quitting = false
    return
  }
  allowed.add(window)
  window.close()
  if (quitting) app.quit()
}
