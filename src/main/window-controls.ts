import type { BrowserWindow } from 'electron'
import { channels, type WindowState } from '../shared/api'

export function readWindowState(window: BrowserWindow): WindowState {
  return {
    focused: window.isFocused(),
    maximized: window.isMaximized(),
    fullscreen: window.isFullScreen(),
    minimizable: window.isMinimizable(),
    maximizable: window.isMaximizable() && window.isResizable(),
    fullscreenable: window.isFullScreenable()
  }
}

export function observeWindowState(window: BrowserWindow): void {
  const publish = (): void => {
    if (!window.webContents.isDestroyed())
      window.webContents.send(channels.windowStateChanged, readWindowState(window))
  }
  window.on('focus', publish)
  window.on('blur', publish)
  window.on('maximize', publish)
  window.on('unmaximize', publish)
  window.on('enter-full-screen', publish)
  window.on('leave-full-screen', publish)
  window.on('restore', publish)
}

export function performWindowAction(window: BrowserWindow, action: unknown): void {
  switch (action) {
    case 'minimize':
      if (window.isMinimizable()) window.minimize()
      return
    case 'toggle-maximize':
      if (!window.isMaximizable() || !window.isResizable() || window.isFullScreen()) return
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
      return
    case 'toggle-fullscreen':
      if (window.isFullScreenable()) window.setFullScreen(!window.isFullScreen())
      return
    case 'close':
      // Use the same save/close handshake as OS controls and application quit.
      window.close()
      return
    default:
      throw new Error('Invalid window action.')
  }
}
