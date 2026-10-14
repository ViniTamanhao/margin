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
    window.webContents.setBackgroundThrottling(false)
    window.show()
    window.focus()
    const evaluate = (code) => window.webContents.executeJavaScript(code)
    const screenshot = async (name) => {
      window.show()
      window.focus()
      await sleep(200)
      await evaluate(
        'Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 500))])'
      )
      await sleep(200)
      await writeFile(join(root, name), (await window.capturePage()).toPNG())
    }
    const click = async (label) => {
      if (label.endsWith('.md')) {
        const expanded = await evaluate(
          "document.querySelector('.file-list')?.classList.contains('expanded')"
        )
        if (!expanded) {
          await evaluate('document.querySelector(\'[aria-label="Toggle files"]\').click()')
          await sleep(160)
        }
      }
      return evaluate(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(label)} || button.getAttribute('aria-label') === ${JSON.stringify(label)})?.click()`
      )
    }
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
      assert.equal(
        await evaluate('getComputedStyle(document.documentElement).colorScheme'),
        'light'
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size').trim()"
        ),
        '22px'
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--editor-font-family').trim()"
        ),
        'Georgia, serif'
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--margin-accent').trim()"
        ),
        '#536a5a'
      )
      console.log('PASS workspace, theme, font and color restored after process restart')
      window.close()
      await until(() => window.isDestroyed(), 'restored window closes')
      app.exit(0)
    } else {
      assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), 'dark')
      assert.equal(
        await evaluate("document.querySelector('.app-header').getBoundingClientRect().height"),
        32
      )
      assert.equal(
        await evaluate("document.querySelector('.navigation-rail').getBoundingClientRect().width"),
        40
      )
      assert.equal(
        await evaluate("document.querySelector('.app-header').textContent.trim()"),
        '',
        'top bar contains only icon controls'
      )
      await click('Open Folder')
      await until(
        async () => (await evaluate('document.querySelectorAll(".file-list button").length')) === 2,
        'recursive Markdown discovery'
      )
      assert.equal(await evaluate("document.querySelector('.file-list').inert"), true)
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'b', modifiers: ['control'] })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'b', modifiers: ['control'] })
      await until(
        async () =>
          await evaluate("document.querySelector('.file-list').classList.contains('expanded')"),
        'files keyboard command'
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await until(
        async () => await evaluate("document.querySelector('.file-list').inert"),
        'Escape collapses files'
      )
      assert.equal(
        await evaluate("document.activeElement.getAttribute('aria-label')"),
        'Toggle files',
        'Escape restores rail focus'
      )
      await until(
        async () =>
          await evaluate("document.querySelector('.file-panel').getBoundingClientRect().width < 1"),
        'collapse animation completes'
      )
      const editorBounds = await evaluate(
        "document.querySelector('.writing-pane').getBoundingClientRect().x"
      )
      await click('Toggle files')
      await until(
        async () =>
          await evaluate(
            "document.querySelector('.file-panel').getBoundingClientRect().width > 100"
          ),
        'expansion completes'
      )
      assert.equal(await evaluate("document.querySelector('.file-list').inert"), false)
      const layout = await evaluate(`(() => {
        const files = document.querySelector('.file-panel').getBoundingClientRect();
        const editor = document.querySelector('.writing-pane').getBoundingClientRect();
        return { filesRight: files.right, editorLeft: editor.left, editorWidth: editor.width };
      })()`)
      assert.ok(layout.editorLeft > editorBounds, 'expanding files moves the editor')
      assert.ok(Math.abs(layout.filesRight - layout.editorLeft) < 1, 'files never cover the editor')
      await screenshot('files.png')
      await evaluate("document.querySelector('.file-list button').focus()")
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
      await until(
        async () => await evaluate("document.activeElement.textContent === 'nested/b.md'"),
        'file-list arrow navigation'
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
      window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await until(async () => (await heading()).includes('nested/b.md'), 'file opens from keyboard')
      assert.equal(
        await evaluate("document.querySelector('.file-list').inert"),
        true,
        'file opening collapses rail'
      )
      await click('a.md')
      await until(async () => (await text()).includes('# Original'), 'document opens')
      await sleep(160)
      assert.equal(
        await evaluate("document.querySelector('.writing-pane').getBoundingClientRect().x"),
        editorBounds,
        'collapse restores editor layout'
      )
      await click('Toggle files')
      await screenshot('editor-files.png')
      const originalBounds = window.getBounds()
      window.setContentSize(480, 640)
      await sleep(200)
      assert.ok(
        await evaluate(
          "document.querySelector('.writing-pane').getBoundingClientRect().width >= 240"
        ),
        'editor stays usable at narrow widths'
      )
      assert.equal(
        await evaluate(
          "document.querySelector('.workspace-body').scrollWidth <= document.querySelector('.workspace-body').clientWidth"
        ),
        true,
        'narrow shell has no horizontal overflow'
      )
      await screenshot('editor-files-narrow.png')
      window.setBounds(originalBounds)
      await click('Toggle files')
      const markdown = '## Heading\n\n**bold** *italic* `code`\n\nTail\n'
      await writeFile(join(root, 'workspace/a.md'), markdown)
      await until(async () => (await text()).includes('Heading'), 'presentation fixture loaded')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End', modifiers: ['control'] })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End', modifiers: ['control'] })
      await until(
        async () =>
          !(await text()).includes('##') &&
          !(await text()).includes('**') &&
          !(await text()).includes('`'),
        'inactive syntax hidden'
      )
      assert.equal(
        (await evaluate("window.margin.document.read('a.md')")).content,
        markdown,
        'decorations leave source untouched'
      )
      await screenshot('dark.png')
      window.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: 'Home',
        modifiers: ['control']
      })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home', modifiers: ['control'] })
      await until(
        async () => (await text()).includes('## Heading'),
        'cursor reveals heading syntax'
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: ['control'] })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: ['control'] })
      await until(
        async () => (await text()).includes('**bold**') && (await text()).includes('`code`'),
        'crossing selection reveals syntax'
      )
      const copied = await evaluate(`(() => {
        const data = new DataTransfer();
        document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true }));
        return data.getData('text/plain');
      })()`)
      assert.equal(copied, markdown, 'copy uses actual Markdown source')
      await evaluate(`(() => {
        const data = new DataTransfer(); data.setData('text/plain', ${JSON.stringify(markdown)});
        document.querySelector('.cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      })()`)
      await until(async () => (await text()).includes('Tail'), 'paste keeps Markdown editable')
      await writeFile(join(root, 'workspace/a.md'), '# Original\n')
      await until(async () => (await text()).includes('Original'), 'original fixture restored')
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
      const typography = await evaluate(
        "({ font: getComputedStyle(document.querySelector('.cm-scroller')).fontFamily, padding: getComputedStyle(document.querySelector('.cm-content')).paddingLeft })"
      )
      assert.ok(typography.font.includes('sans-serif'), 'editor consumes typography tokens')
      assert.equal(typography.padding, '48px', 'editor consumes spacing tokens')
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
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: ',', modifiers: ['control'] })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: ',', modifiers: ['control'] })
      await until(
        async () => await evaluate("document.querySelector('dialog')?.open"),
        'appearance keyboard command'
      )
      assert.equal(
        await evaluate("document.querySelector('dialog').contains(document.activeElement)"),
        true,
        'dialog takes focus'
      )
      assert.equal(
        await evaluate("document.querySelector('#settings-title').textContent"),
        'Settings'
      )
      assert.equal(
        await evaluate("document.querySelectorAll('.settings-navigation button').length"),
        1
      )
      assert.equal(
        await evaluate("document.querySelector('.settings-navigation [aria-current]').textContent"),
        'Appearance'
      )
      assert.ok(
        await evaluate("document.querySelector('dialog').getBoundingClientRect().width > 600"),
        'intentional settings surface'
      )
      await screenshot('settings-dark.png')
      await evaluate(
        "Array.from(document.querySelectorAll('dialog button')).find(button => button.textContent === 'Done').focus()"
      )
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
      await sleep(100)
      assert.equal(
        await evaluate("document.querySelector('dialog').contains(document.activeElement)"),
        true,
        'modal traps keyboard focus'
      )
      window.setContentSize(480, 640)
      await sleep(200)
      assert.equal(
        await evaluate(
          "document.querySelector('.settings-content').scrollWidth <= document.querySelector('.settings-content').clientWidth"
        ),
        true,
        'settings content fits narrow windows'
      )
      await screenshot('settings-narrow.png')
      window.setBounds(originalBounds)
      await evaluate("document.querySelector('dialog input[name=theme][value=light]').click()")
      await until(
        async () =>
          await evaluate("getComputedStyle(document.documentElement).colorScheme === 'light'"),
        'immediate theme preview'
      )
      await screenshot('settings.png')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await until(
        async () => await evaluate("!document.querySelector('dialog')"),
        'Escape cancels settings'
      )
      assert.equal(
        await evaluate('getComputedStyle(document.documentElement).colorScheme'),
        'dark',
        'cancel restores theme'
      )
      assert.equal(
        await evaluate("document.activeElement?.classList.contains('cm-content')"),
        true,
        'settings restore editor focus'
      )
      await click('Settings')
      await evaluate("document.querySelector('dialog input[name=theme][value=light]').click()")
      async function setInput(selector, value) {
        await evaluate(`(() => {
          const input = document.querySelector(${JSON.stringify(selector)});
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`)
      }
      await setInput('dialog input:not([type])', 'Georgia, serif')
      await setInput('dialog input[type=number]', '22')
      await setInput('dialog input[type=color]', '#f7f6f2')
      await evaluate(`(() => {
        const input = document.querySelectorAll('dialog input[type=color]')[5];
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#536a5a');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
      await click('Done')
      await until(
        async () => await evaluate("!document.querySelector('dialog')"),
        'settings persisted'
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size').trim()"
        ),
        '22px'
      )
      const persisted = JSON.parse(await readFile(join(root, 'app-data/appearance.json'), 'utf8'))
      assert.equal(persisted.version, 1)
      const appearance = persisted.appearance
      assert.equal(appearance.theme, 'light')
      assert.equal(appearance.fontFamily, 'Georgia, serif')
      assert.equal(appearance.colors.accent, '#536a5a')
      await screenshot('light.png')
      await evaluate("document.querySelector('.cm-content').focus()")
      await window.webContents.insertText(' flush before close')
      await evaluate(
        'Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 500))])'
      )
      await screenshot('screenshot.png')
      window.close()
      await until(() => window.isDestroyed(), 'close flush completed')
      assert.ok(
        (await readFile(join(root, 'workspace/nested/b.md'), 'utf8')).includes('flush before close')
      )
      console.log(
        'PASS compact chrome, temporary rail, syntax hiding/reveal, Markdown clipboard, live appearance, focus restoration, isolated preload, editing, autosave, undo/redo, external reload/conflicts, recovery copy and close flush'
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
