import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import assert from 'node:assert/strict'

// Wrap the real IPC handlers only in the smoke process, so race tests exercise
// production preload/components/services with deterministic delayed responses.
export function instrumentSearchIPC(ipcMain) {
  const probe = { reads: [], delays: {}, fail: null, searches: [], searchDelays: {} }
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, handler) =>
    handle(channel, async (event, ...args) => {
      if (channel === 'document:read') {
        const path = args[0]
        probe.reads.push(path)
        const result = await handler(event, ...args)
        if (probe.delays[path])
          await new Promise((resolve) => setTimeout(resolve, probe.delays[path]))
        if (probe.fail === path) throw new Error('Smoke: preview read unavailable')
        return result
      }
      if (channel === 'workspace:search') {
        probe.searches.push(args[0].query)
        const result = await handler(event, ...args)
        if (probe.searchDelays[args[0].query])
          await new Promise((resolve) => setTimeout(resolve, probe.searchDelays[args[0].query]))
        return result
      }
      return handler(event, ...args)
    })
  return probe
}

export async function runSearchPolish({
  window,
  evaluate,
  until,
  screenshot,
  root,
  dialog,
  probe
}) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  window.webContents.sendInputEvent({ type: 'mouseMove', x: 4, y: 4 })
  const key = async (keyCode, modifiers = []) => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await sleep(45)
  }
  const query = async (value) => {
    await evaluate(`(() => {
      const input = document.querySelector('.picker-input')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await sleep(35)
  }
  const preview = () => evaluate("document.querySelector('.picker-preview')?.textContent ?? ''")
  const title = () => evaluate("document.querySelector('.document-name')?.title")
  const selected = () =>
    evaluate("document.querySelector('.picker [aria-selected=true]')?.textContent ?? ''")
  const workspace = join(root, 'polish-workspace')
  await mkdir(workspace)
  const source =
    '# First\n\n## Second\n\n### Third\n\n#### Fourth\n\n##### Fifth\n\n###### Sixth\n\nEnd'
  await writeFile(join(workspace, 'a.md'), source)
  const dragon =
    '# Dragonfire Mechanics\n\n' +
    'Surrounding context.\n'.repeat(35) +
    'Magical fire ignores normal armor resistance.\n\n## Exceptions\nMore context.\n'
  await writeFile(join(workspace, 'Dragonfire Mechanics.md'), dragon)
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] })
  await evaluate('document.querySelector(\'[aria-label="Open Folder"]\').click()')
  await until(
    async () =>
      await evaluate(
        `document.querySelector('[aria-label="Open Folder"]').disabled === false && document.querySelectorAll('[role=treeitem]').length >= 2`
      ),
    'polish workspace loaded'
  )
  await key('p', ['control'])
  await until(
    async () => await evaluate(`document.querySelector('.picker[aria-label="Quick Open"]')?.open`),
    'polish Quick Open opens'
  )
  await query('a.md')
  await key('Return')
  await until(async () => (await title()) === 'a.md', 'polish source opens')
  await key('End', ['control'])
  await until(
    async () => await evaluate("document.querySelectorAll('.cm-md-heading').length === 6"),
    'heading classes rendered'
  )
  const sizes = await evaluate(`Array.from({length: 6}, (_, i) => {
    const node = document.querySelector('.cm-md-h' + (i + 1))
    return { size: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height }
  })`)
  assert.ok(
    sizes.every((entry, i) => i === 0 || entry.size < sizes[i - 1].size),
    'H1 through H6 have distinct decreasing sizes'
  )
  await screenshot('heading-hierarchy.png')
  await key('Home', ['control'])
  assert.equal(await evaluate("document.querySelector('.cm-md-h1').textContent"), '# First')
  const focusedHeight = await evaluate(
    "document.querySelector('.cm-md-h1').getBoundingClientRect().height"
  )
  assert.ok(
    Math.abs(focusedHeight - sizes[0].height) < 1,
    'revealing heading source keeps line height'
  )
  await key('Right')
  await evaluate(await readFile(join(root, 'editor-probe.js'), 'utf8'))
  const cursor = () => evaluate('window.marginEditorLocation()')
  await evaluate("document.querySelector('.cm-content').focus()")
  const previousCursor = await cursor()

  probe.reads.length = 0
  await key('p', ['control'])
  await until(async () => (await preview()).includes('First'), 'Quick Open previews active file')
  assert.ok(
    probe.reads.every((path) => path === 'a.md'),
    'unselected files are not previewed'
  )
  const previewBounds = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.preview-line')]
    const text = rows.map(row => row.querySelector('.preview-text').getBoundingClientRect().left)
    return { aligned: text.every(left => Math.abs(left - text[0]) < 1),
      height: rows[0].getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(rows[0]).lineHeight) }
  })()`)
  assert.ok(previewBounds.aligned, 'preview text shares a column independent of line numbers')
  assert.ok(
    Math.abs(previewBounds.height - previewBounds.lineHeight) < 1,
    'source rows have one line of height without extra newline spacing'
  )
  const bounds = window.getBounds()
  window.setContentSize(480, 640)
  await until(
    async () =>
      await evaluate(
        "getComputedStyle(document.querySelector('.picker-preview')).display === 'none'"
      ),
    'narrow picker hides preview'
  )
  window.setBounds(bounds)
  probe.reads.length = 0
  await key('Down')
  await until(
    async () => (await preview()).includes('Dragonfire Mechanics'),
    'highlight loads another file'
  )
  assert.ok(
    probe.reads.includes('Dragonfire Mechanics.md'),
    'active preview is read through the typed boundary'
  )
  const readsBeforeReturn = probe.reads.length
  await key('Up')
  await until(async () => (await preview()).includes('# First'), 'cached preview returns')
  assert.equal(probe.reads.length, readsBeforeReturn, 'returning to a preview reuses picker cache')
  probe.delays['Dragonfire Mechanics.md'] = 350
  await key('Down')
  assert.ok(
    (await preview()).includes('# First'),
    'prior preview stays visible until replacement is ready'
  )
  await until(
    async () => (await preview()).includes('Dragonfire Mechanics'),
    'replacement preview appears'
  )
  probe.delays = {}
  assert.equal(await title(), 'a.md', 'preview does not open a session')
  await screenshot('quick-open-preview.png')
  await key('Escape')
  await until(
    async () => await evaluate("document.activeElement?.classList.contains('cm-content')"),
    'preview restores editor focus'
  )
  await until(
    async () => JSON.stringify(await cursor()) === JSON.stringify(previousCursor),
    'preview leaves cursor unchanged'
  )
  await key('p', ['control'])
  assert.ok((await selected()).startsWith('a.md'), 'preview does not change recents')
  await query('armor')
  assert.equal(
    await evaluate("document.querySelectorAll('.picker [role=option]').length"),
    0,
    'Quick Open remains filename-only'
  )
  await key('Escape')

  // A late first response must not replace the second file's preview.
  probe.delays['a.md'] = 450
  await key('p', ['control'])
  await sleep(110)
  await key('Down')
  await until(async () => (await preview()).includes('Dragonfire Mechanics'), 'new preview wins')
  await sleep(500)
  assert.ok((await preview()).includes('Dragonfire Mechanics'), 'late stale preview is rejected')
  await key('Escape')
  probe.delays = {}
  probe.fail = 'Dragonfire Mechanics.md'
  await key('p', ['control'])
  await key('Down')
  await until(async () => (await preview()).includes('unavailable'), 'preview failure is nonfatal')
  assert.equal(await title(), 'a.md')
  await key('Escape')
  probe.fail = null
  await key('p', ['control', 'shift'])
  await query('Go Back')
  assert.equal(
    await evaluate("document.querySelectorAll('.picker [role=option]').length"),
    0,
    'previews do not create navigation history'
  )
  await key('Escape')

  await key('f', ['control', 'shift'])
  assert.equal(probe.searches.length, 0, 'empty query does not search')
  await query('armor')
  await until(
    async () => (await selected()).includes('Dragonfire Mechanics.md:38'),
    'content result contains path and line'
  )
  await until(
    async () =>
      (await preview()).includes('Surrounding context.') &&
      (await preview()).includes('Exceptions'),
    'preview has match context'
  )
  assert.equal(
    await evaluate("document.querySelector('.preview-line-active mark')?.textContent"),
    'armor'
  )
  const stableHeight = await evaluate(
    "document.querySelector('.picker').getBoundingClientRect().height"
  )
  probe.searchDelays.Magical = 350
  await query('Magical')
  assert.ok((await preview()).includes('armor'), 'query change retains the last complete preview')
  assert.equal(
    await evaluate("document.querySelector('.picker').getBoundingClientRect().height"),
    stableHeight,
    'query changes preserve picker geometry'
  )
  await key('Return')
  assert.ok(
    await evaluate("document.querySelector('.picker')?.open"),
    'pending results cannot open a stale match'
  )
  await until(
    async () =>
      await evaluate(
        "document.querySelector('[role=listbox]').getAttribute('aria-busy') === 'false'"
      ),
    'replacement search finishes'
  )
  await until(
    async () =>
      await evaluate(
        "document.querySelector('.preview-line-active mark')?.textContent === 'Magical'"
      ),
    'preview updates to the new match'
  )
  await query('armor')
  await until(
    async () =>
      await evaluate(
        "document.querySelector('.preview-line-active mark')?.textContent === 'armor'"
      ),
    'original match returns'
  )
  await screenshot('content-search-preview.png')
  await key('Return')
  await until(
    async () => (await title()) === 'Dragonfire Mechanics.md',
    'search opens matching document'
  )
  assert.ok((await cursor()).text?.includes('armor'), 'cursor is on matching line')
  assert.equal(
    (await cursor()).position,
    dragon.indexOf('armor'),
    'cursor is at the exact UTF-16 match position'
  )
  assert.equal(await evaluate("document.activeElement?.classList.contains('cm-content')"), true)
  // Dispatch the edit and command together, before the autosave timer can run.
  const inserted = 'New text above the match.\n'
  await evaluate(`window.marginInsertAboveAndSearch(${JSON.stringify(inserted)})`)
  await until(
    async () =>
      await evaluate(`document.querySelector('.picker[aria-label="Search Workspace"]')?.open`),
    'search opens after flushing unsaved edits'
  )
  assert.equal(
    await readFile(join(workspace, 'Dragonfire Mechanics.md'), 'utf8'),
    inserted + dragon
  )
  await query('armor')
  await until(
    async () => (await selected()).includes('Dragonfire Mechanics.md:39'),
    'search uses the shifted match line'
  )
  await key('Return')
  await until(
    async () => (await cursor()).position === inserted.length + dragon.indexOf('armor'),
    'search result lands at the actual match after an unsaved edit'
  )
  assert.ok((await cursor()).text.includes('armor'))
  await key('Left', ['alt'])
  await key('Left', ['alt'])
  await until(async () => (await title()) === 'a.md', 'Back returns to prior document')
  assert.deepEqual(await cursor(), previousCursor, 'Back restores original position')

  probe.searchDelays.armor = 450
  await key('f', ['control', 'shift'])
  await query('armor')
  await sleep(160)
  await query('Exceptions')
  await until(async () => (await selected()).includes('Exceptions'), 'new query completes')
  await sleep(500)
  assert.ok((await selected()).includes('Exceptions'), 'late stale search response is rejected')
  await key('Escape')
  await key('f', ['control', 'shift'])
  await query('armor')
  await sleep(160)
  await key('Escape')
  const beforeTyping = await cursor()
  window.webContents.sendInputEvent({ type: 'char', keyCode: 'x' })
  await until(
    async () => (await cursor()).text !== beforeTyping.text,
    'typing stays responsive with search in flight'
  )
  await key('z', ['control'])
  await until(async () => (await cursor()).text === beforeTyping.text, 'typing probe undone')
  assert.equal(
    await readFile(join(workspace, 'a.md'), 'utf8'),
    source,
    'preview and search preserve Markdown source'
  )

  await evaluate(
    'document.querySelector(\'[aria-label="Keyboard Shortcuts"]\').focus(); document.querySelector(\'[aria-label="Keyboard Shortcuts"]\').click()'
  )
  await until(
    async () => await evaluate("document.querySelector('.shortcut-dialog')?.open"),
    'shortcut sheet opens'
  )
  assert.equal(
    await evaluate(
      "document.querySelector('.shortcuts-toggle').nextElementSibling.getAttribute('aria-label')"
    ),
    'Settings',
    'keyboard icon immediately precedes Settings'
  )
  assert.ok(
    await evaluate(
      "document.querySelector('.shortcut-dialog').textContent.includes('Quick OpenCtrl/Cmd+P')"
    )
  )
  assert.ok(
    await evaluate(
      "document.querySelector('.shortcut-dialog').textContent.includes('Search WorkspaceCtrl/Cmd+Shift+F')"
    )
  )
  await screenshot('keyboard-shortcuts.png')
  await key('Escape')
  assert.equal(
    await evaluate("document.activeElement?.getAttribute('aria-label')"),
    'Keyboard Shortcuts',
    'sheet restores focus to opener'
  )
  console.log(
    'PASS heading hierarchy, contextual source, active previews, failure and stale races, lexical search, location history, shortcuts and focus'
  )
}
