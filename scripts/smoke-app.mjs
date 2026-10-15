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
      if (label.includes('/') && label.endsWith('.md')) {
        const parts = label.split('/')
        for (let index = 1; index < parts.length; index++) {
          const path = parts.slice(0, index).join('/')
          await evaluate(
            `Array.from(document.querySelectorAll('.file-list button')).find(button => button.title === ${JSON.stringify(path)} && button.getAttribute('aria-expanded') === 'false')?.click()`
          )
          await sleep(20)
        }
      }
      return evaluate(
        `Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(label)} || button.getAttribute('aria-label') === ${JSON.stringify(label)} || button.title === ${JSON.stringify(label)})?.click()`
      )
    }
    const text = () => evaluate("document.querySelector('.cm-content')?.textContent ?? ''")
    const heading = () =>
      evaluate("document.querySelector('.document-name')?.getAttribute('title') ?? ''")
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
        '18px'
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--editor-font-family').trim()"
        ),
        "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--margin-accent').trim()"
        ),
        '#555555'
      )
      console.log('PASS workspace, theme and font restored after process restart')
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
        await evaluate("document.querySelector('.app-header .app-wordmark')?.textContent"),
        'Margin',
        'top bar shows the wordmark when no document is open'
      )
      assert.equal(
        await evaluate("getComputedStyle(document.querySelector('.navigation-rail')).borderRight"),
        await evaluate("getComputedStyle(document.querySelector('.app-header')).borderBottom"),
        'sidebar divider matches top bar'
      )
      await screenshot('empty-start.png')
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [join(root, 'empty-workspace')]
      })
      await click('Open Folder')
      await until(
        async () => await evaluate("Boolean(document.querySelector('.file-list-empty'))"),
        'empty workspace message'
      )
      await click('Toggle files')
      await screenshot('empty-files.png')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await until(
        async () => await evaluate("document.querySelector('.file-list').inert"),
        'empty file list closes with Escape'
      )
      assert.equal(
        await evaluate("document.activeElement.getAttribute('aria-label')"),
        'Toggle files',
        'empty file list restores toggle focus'
      )
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [join(root, 'workspace')]
      })
      await click('Open Folder')
      await until(
        async () => (await evaluate('document.querySelectorAll(".file-list button").length')) === 3,
        'folder and Markdown discovery'
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
      const key = async (keyCode) => {
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode })
        await sleep(40)
      }
      assert.equal(await evaluate("document.querySelector('[role=treeitem]').textContent"), 'empty')
      assert.equal(
        await evaluate('document.querySelector(\'[role=treeitem][aria-level="2"]\')'),
        null
      )
      await evaluate('document.querySelector(\'.file-list [tabindex="0"]\').focus()')
      await key('Down')
      assert.equal(await evaluate('document.activeElement.title'), 'nested')
      await key('Right')
      assert.equal(await evaluate("document.activeElement.getAttribute('aria-expanded')"), 'true')
      await key('Right')
      assert.equal(await evaluate('document.activeElement.title'), 'nested/b.md')
      await key('Left')
      assert.equal(await evaluate('document.activeElement.title'), 'nested')
      await key('Left')
      assert.equal(await evaluate("document.activeElement.getAttribute('aria-expanded')"), 'false')
      assert.equal(
        await evaluate('document.querySelector(\'[role=treeitem][aria-level="2"]\')'),
        null
      )
      await key('Right')
      await key('Down')
      assert.equal(await evaluate('document.activeElement.title'), 'nested/b.md')
      await screenshot('folder-tree.png')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
      window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
      await until(async () => (await heading()).includes('nested/b.md'), 'file opens from keyboard')
      assert.equal(
        await evaluate("document.querySelector('.document-name').textContent"),
        'b.md',
        'header shows only basename'
      )
      assert.equal(
        await evaluate("document.querySelector('.app-header .app-wordmark')?.textContent"),
        'Margin',
        'top bar keeps the wordmark when a document is open'
      )
      assert.equal(
        await evaluate("document.querySelector('.document-name').title"),
        'nested/b.md',
        'relative path remains discoverable'
      )
      assert.equal(
        await evaluate("document.querySelector('.document-heading') === null"),
        true,
        'no duplicate editor heading'
      )
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
      assert.ok(
        await evaluate(
          "['Unsaved', 'Saving…'].includes(document.querySelector('.document-status').textContent)"
        ),
        'pending edits show transient status'
      )
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
      await until(
        async () => await evaluate("document.querySelector('.document-status').textContent === ''"),
        'save status disappears'
      )
      await writeFile(join(root, 'workspace/a.md'), 'Clean external change')
      await until(async () => (await text()) === 'Clean external change', 'clean external reload')
      await window.webContents.insertText(' local edits')
      await writeFile(join(root, 'workspace/a.md'), 'External conflict')
      await until(
        async () => await evaluate("document.body.textContent.includes('autosave is paused')"),
        'dirty conflict detected'
      )
      assert.equal(await readFile(join(root, 'workspace/a.md'), 'utf8'), 'External conflict')
      await screenshot('conflict.png')
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
      await until(
        async () => await evaluate("document.querySelector('.document-status').textContent === ''"),
        'save status disappears'
      )
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
        await evaluate("document.querySelectorAll('dialog input').length"),
        3,
        'settings contain only two theme radios and one font field'
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
      await evaluate("document.querySelector('dialog input[name=theme][value=dark]').focus()")
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
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
      await click('Done')
      await until(
        async () => await evaluate("!document.querySelector('dialog')"),
        'settings persisted'
      )
      assert.equal(
        await evaluate(
          "getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size').trim()"
        ),
        '18px'
      )
      const persisted = JSON.parse(await readFile(join(root, 'app-data/appearance.json'), 'utf8'))
      assert.equal(persisted.version, 1)
      const appearance = persisted.appearance
      assert.equal(appearance.theme, 'light')
      assert.equal(appearance.fontFamily, 'Georgia, serif')
      assert.deepEqual(Object.keys(appearance).sort(), ['fontFamily', 'theme'])
      await screenshot('light.png')
      const intentionalSerif = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
      await click('Settings')
      await setInput('dialog input:not([type])', intentionalSerif)
      await click('Done')
      await until(
        async () => await evaluate("!document.querySelector('dialog')"),
        'intentional former-default font saved'
      )
      const savedSerif = JSON.parse(await readFile(join(root, 'app-data/appearance.json'), 'utf8'))
      assert.equal(savedSerif.version, 1)
      assert.equal(savedSerif.appearance.fontFamily, intentionalSerif)
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
