import electron from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const { app, BrowserWindow, dialog } = electron
const root = process.env.MARGIN_SMOKE_ROOT
if (!root) throw new Error('Run this through pnpm test:smoke.')
app.setPath('userData', join(root, 'app-data'))
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(root, 'workspace')] })
dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(root, 'recovered.md') })
// Keep the test harness alive after the real application's close/quit handshake.
app.on('will-quit', (event) => event.preventDefault())

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, description) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await sleep(100)
  }
  throw new Error(`Timed out: ${description}`)
}

async function run() {
  await import('../out/main/index.js')
  try {
    await app.whenReady()
    await until(() => BrowserWindow.getAllWindows().length > 0, 'window created')
    const window = BrowserWindow.getAllWindows()[0]
    window.webContents.on('console-message', (_event, _level, message) => {
      if (message.includes('Error')) console.error('Renderer:', message)
    })
    const evaluate = (code) => window.webContents.executeJavaScript(code)
    const click = (label) =>
      evaluate(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(label)})?.click()`
      )
    const text = () => evaluate("document.querySelector('.cm-content')?.textContent ?? ''")
    const heading = () => evaluate("document.querySelector('.document-heading')?.textContent ?? ''")
    await until(async () => {
      try {
        return await evaluate("Boolean(document.querySelector('.app-header'))")
      } catch {
        return false
      }
    }, 'renderer and preload loaded')
    const isolated = await evaluate(
      "typeof window.require === 'undefined' && typeof window.margin.document.save === 'function' && typeof window.electron === 'undefined'"
    )
    assert.equal(isolated, true, 'renderer has only the narrow preload API')
    assert.equal(window.webContents.getLastWebPreferences().contextIsolation, true)
    assert.equal(window.webContents.getLastWebPreferences().sandbox, true)

    if (process.env.MARGIN_SMOKE_MODE === 'missing') {
      await until(
        async () =>
          await evaluate("document.body.textContent.includes('Open a folder. Start writing.')"),
        'missing workspace handled'
      )
      assert.equal(await evaluate('document.querySelectorAll(".file-list button").length'), 0)
      console.log('PASS missing previous workspace')
      app.exit(0)
    } else if (process.env.MARGIN_SMOKE_MODE === 'restore') {
      await until(
        async () => (await evaluate('document.querySelectorAll(".file-list button").length')) >= 2,
        'workspace restored'
      )
      console.log('PASS previous workspace restored after process restart')
      window.close()
      await until(() => window.isDestroyed(), 'restored window closes')
      app.exit(0)
    } else {
      await click('Open Folder')
      await until(
        async () => (await evaluate('document.querySelectorAll(".file-list button").length')) === 2,
        'recursive Markdown discovery'
      )
      await click('a.md')
      await until(async () => (await text()).includes('# Original'), 'document opens')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['control'] })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['control'] })
      await until(
        async () => await evaluate("document.activeElement?.classList.contains('cm-content')"),
        'editor focused'
      )
      await window.webContents.insertText('Autosaved')
      await until(async () => (await text()).includes('Autosaved'), 'typing enters editor')
      await until(
        async () => (await readFile(join(root, 'workspace/a.md'), 'utf8')).includes('Autosaved'),
        'debounced save'
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z', modifiers: ['control'] })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z', modifiers: ['control'] })
      await until(async () => !(await text()).includes('Autosaved'), 'undo')
      window.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: 'z',
        modifiers: ['control', 'shift']
      })
      window.webContents.sendInputEvent({
        type: 'keyUp',
        keyCode: 'z',
        modifiers: ['control', 'shift']
      })
      await until(async () => (await text()).includes('Autosaved'), 'redo')
      const selection = await evaluate('window.getSelection().anchorOffset')
      await click('nested/b.md')
      await until(async () => (await heading()).includes('nested/b.md'), 'second file opens')
      await click('a.md')
      await until(async () => (await heading()).startsWith('a.md'), 'first file reopens')
      assert.equal(
        await evaluate('window.getSelection().anchorOffset'),
        selection,
        'selection restored'
      )
      await until(async () => (await heading()).includes('Saved'), 'save settled')
      await writeFile(join(root, 'workspace/a.md'), 'Clean external change')
      await until(async () => (await text()) === 'Clean external change', 'clean external reload')
      await window.webContents.insertText(' local edits')
      await writeFile(join(root, 'workspace/a.md'), 'External conflict')
      await until(
        async () => await evaluate("document.body.textContent.includes('autosave is paused')"),
        'dirty conflict detected'
      )
      assert.equal(await readFile(join(root, 'workspace/a.md'), 'utf8'), 'External conflict')
      window.close()
      await sleep(400)
      assert.equal(window.isDestroyed(), false, 'conflict prevents closing')
      await click('Use disk version')
      await until(async () => (await text()) === 'External conflict', 'disk version selected')
      await window.webContents.insertText(' explicit local')
      await writeFile(join(root, 'workspace/a.md'), 'Second external conflict')
      await until(
        async () => await evaluate("document.body.textContent.includes('autosave is paused')"),
        'second conflict'
      )
      const local = await text()
      await click('Keep my version')
      await until(
        async () => (await readFile(join(root, 'workspace/a.md'), 'utf8')) === local,
        'explicit local version saved'
      )
      await until(async () => (await heading()).includes('Saved'), 'save settled')
      await window.webContents.insertText(' recovered')
      await writeFile(join(root, 'workspace/a.md'), 'Third external conflict')
      await until(
        async () => await evaluate("document.body.textContent.includes('autosave is paused')"),
        'copy conflict'
      )
      const copy = await text()
      await click('Save a copy…')
      await until(async () => {
        try {
          return (await readFile(join(root, 'recovered.md'), 'utf8')) === copy
        } catch {
          return false
        }
      }, 'local copy saved')
      assert.equal(await readFile(join(root, 'workspace/a.md'), 'utf8'), 'Third external conflict')
      await click('nested/b.md')
      await until(
        async () => (await heading()).includes('nested/b.md'),
        'file opens after recovery'
      )
      await window.webContents.insertText(' flush before close')
      await writeFile(join(root, 'screenshot.png'), (await window.capturePage()).toPNG())
      window.close()
      await until(() => window.isDestroyed(), 'close flush completed')
      assert.ok(
        (await readFile(join(root, 'workspace/nested/b.md'), 'utf8')).includes('flush before close')
      )
      console.log(
        'PASS isolated preload, folder picker, editing, autosave, undo/redo, selection restoration, external reload, conflicts, recovery copy and close flush'
      )
      app.exit(0)
    }
  } catch (error) {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) {
      console.error(await window.webContents.executeJavaScript('document.body.textContent'))
      await writeFile(join(root, 'failure.png'), (await window.capturePage()).toPNG())
    }
    console.error(error)
    app.exit(1)
  }
}
void run()
