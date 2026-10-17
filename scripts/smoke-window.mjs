import assert from 'node:assert/strict'
import { nativeTheme } from 'electron'

export async function checkWindowControls({ window, evaluate, until, screenshot }) {
  const original = window.getBounds()
  assert.equal(await evaluate("document.querySelector('input[name=customTitleBar]')"), null)
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.app-header')).getPropertyValue('app-region')"
    ),
    'drag'
  )
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.app-header button')).getPropertyValue('app-region')"
    ),
    'no-drag'
  )
  assert.equal(
    await evaluate("window.margin.window.action('invalid').then(() => false, () => true)"),
    true,
    'IPC rejects unrecognized window actions'
  )
  await evaluate("document.querySelector('[aria-label=Settings]').click()")
  for (const [theme, foreground, background] of [
    ['dark', 'rgb(226, 226, 226)', 'rgb(30, 30, 30)'],
    ['light', 'rgb(39, 39, 39)', 'rgb(250, 250, 250)']
  ]) {
    await evaluate(`document.querySelector('input[name=theme][value=${theme}]').click()`)
    await until(() => nativeTheme.themeSource === theme, 'window theme changes')
    assert.equal(
      await evaluate("getComputedStyle(document.querySelector('.app-header')).backgroundColor"),
      background
    )
    if (process.platform === 'linux') {
      assert.equal(await evaluate("document.querySelectorAll('.window-control').length"), 3)
      assert.equal(
        await evaluate("getComputedStyle(document.querySelector('.window-control')).color"),
        foreground
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.querySelector('.window-control')).backgroundColor"
        ),
        'rgba(0, 0, 0, 0)',
        'no stale GTK background'
      )
    }
    await evaluate(
      "Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === 'Done').click()"
    )
    await until(async () => await evaluate("!document.querySelector('dialog')"), 'settings saved')
    await screenshot(`window-controls-${theme}.png`)
    await evaluate("document.querySelector('[aria-label=Settings]').click()")
  }
  await evaluate(
    "Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === 'Cancel').click()"
  )
  await until(async () => await evaluate("!document.querySelector('dialog')"), 'settings closed')
  if (process.platform === 'linux') {
    await evaluate('document.querySelector(\'[aria-label="Maximize window"]\').click()')
  } else await evaluate("window.margin.window.action('toggle-maximize')")
  await until(() => window.isMaximized(), 'maximize window')
  if (process.platform === 'linux') {
    await until(
      async () =>
        await evaluate('Boolean(document.querySelector(\'[aria-label="Restore window"]\'))'),
      'maximize icon becomes restore'
    )
    await evaluate('document.querySelector(\'[aria-label="Restore window"]\').click()')
  } else await evaluate("window.margin.window.action('toggle-maximize')")
  await until(() => !window.isMaximized(), 'restore window')
  // External OS changes must update the controls too.
  window.maximize()
  await until(() => window.isMaximized(), 'OS maximizes window')
  if (process.platform === 'linux')
    await until(
      async () =>
        await evaluate('Boolean(document.querySelector(\'[aria-label="Restore window"]\'))'),
      'OS maximize updates icon'
    )
  window.unmaximize()
  await until(() => !window.isMaximized(), 'OS restores window')
  window.setBounds(original)
  if (process.platform === 'linux')
    await evaluate('document.querySelector(\'[aria-label="Minimize window"]\').click()')
  else await evaluate("window.margin.window.action('minimize')")
  await until(() => window.isMinimized(), 'minimize window')
  window.restore()
  window.show()
  window.focus()
  await until(() => !window.isMinimized(), 'restore minimized window')
  for (const fullscreen of [true, false]) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' })
    await until(() => window.isFullScreen() === fullscreen, 'F11 toggles fullscreen')
    await until(
      async () =>
        await evaluate(
          `document.querySelector('.app-header').dataset.fullscreen === '${fullscreen}'`
        ),
      'renderer follows fullscreen state'
    )
    if (process.platform === 'linux')
      assert.equal(
        await evaluate("document.querySelectorAll('.window-control').length"),
        fullscreen ? 0 : 3
      )
  }
  window.setBounds(original)
  console.log(
    'PASS themed window controls, minimize, maximize/restore, OS state synchronization, F11 fullscreen and validated IPC'
  )
}
