import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises'
import { join, sep } from 'node:path'
import assert from 'node:assert/strict'

export async function runFileOperations({
  window,
  evaluate,
  until,
  screenshot,
  root,
  dialog,
  shell
}) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const key = async (keyCode, modifiers = []) => {
    const nativeEnter =
      keyCode === 'Return' &&
      (await evaluate(
        "Boolean(document.activeElement?.closest('.tree-inline-edit, .tree-context-menu'))"
      ))
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    if (nativeEnter) window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await sleep(40)
  }
  const setInput = async (selector, value) => {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error('Expected input: ' + ${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    await sleep(40)
  }
  const click = async (label) => {
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === ${JSON.stringify(label)})?.click()`
    )
    await sleep(40)
  }
  const focusItem = async (path) => {
    await evaluate(
      `Array.from(document.querySelectorAll('[role=treeitem]')).find(item => item.title === ${JSON.stringify(path)})?.focus()`
    )
    await until(
      async () => (await evaluate('document.activeElement?.title')) === path,
      `focus ${path}`
    )
  }
  const rootTarget = async () => {
    await evaluate("document.querySelector('.file-tree-scroll').click()")
    await sleep(40)
  }
  const confirmName = async (name) => {
    await until(
      async () => await evaluate("Boolean(document.querySelector('.tree-inline-edit input'))"),
      'inline name input opens'
    )
    await setInput('.tree-inline-edit input', name)
    await key('Return')
    await until(
      async () => await evaluate("!document.querySelector('.tree-inline-edit')"),
      `inline operation commits ${name}`
    )
  }
  const picker = async (query, command = false) => {
    await key('p', command ? ['control', 'shift'] : ['control'])
    await until(
      async () => await evaluate("Boolean(document.querySelector('.picker[open]'))"),
      'picker opens'
    )
    await setInput('.picker-input', query)
    await key('Return')
  }
  const heading = () => evaluate("document.querySelector('.document-name').getAttribute('title')")

  // Matching is instrumented in a test-only caller of the real Picker.
  await evaluate(await readFile(join(root, 'picker-probe.js'), 'utf8'))
  await until(
    async () =>
      await evaluate(
        'Boolean(window.marginPickerProbe && document.querySelector(".picker-input"))'
      ),
    'instrumented Picker mounts'
  )
  const calls = await evaluate('window.marginPickerProbe.calls()')
  assert.equal(
    await evaluate("document.querySelectorAll('.picker [role=option]').length"),
    100,
    'Picker keeps rendering cap'
  )
  await key('Down')
  await key('Down')
  await key('Up')
  await evaluate(
    "document.querySelectorAll('.picker [role=option]')[5].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))"
  )
  await evaluate('window.marginPickerProbe.rerender()')
  await sleep(40)
  assert.equal(
    await evaluate('window.marginPickerProbe.calls()'),
    calls,
    'selection and unrelated parent renders do not recompute matches'
  )
  await setInput('.picker-input', 'File 1')
  assert.equal(
    await evaluate('window.marginPickerProbe.calls()'),
    calls + 1,
    'query changes recompute matching'
  )
  await evaluate('window.marginPickerProbe.replaceSource()')
  await sleep(40)
  assert.equal(
    await evaluate('window.marginPickerProbe.calls()'),
    calls + 2,
    'source changes invalidate matching'
  )
  await setInput('.picker-input', 'New')
  assert.equal(
    await evaluate("document.querySelector('.picker [aria-selected=true]')?.textContent"),
    'New source',
    'query resets active selection after source change'
  )
  await key('Escape')
  await evaluate('window.marginPickerProbe.unmount()')

  if (!(await evaluate('window.margin.workspace.current()'))) await click('Open Folder')
  await until(
    async () => await evaluate('Boolean(document.querySelector(".file-list"))'),
    'workspace files available'
  )
  const workspaceRoot = (await evaluate('window.margin.workspace.current()')).root
  await click('Toggle files')
  await rootTarget()
  await click('New Folder')
  await confirmName('Campaign')
  await focusItem('Campaign')
  assert.equal(
    await evaluate(
      "document.querySelector('[role=treeitem][title=Campaign]').getAttribute('aria-selected')"
    ),
    'true'
  )
  await click('New Folder')
  await confirmName('Notes')
  await focusItem('Campaign/Notes')
  await click('New File')
  await until(
    async () =>
      await evaluate("document.activeElement?.getAttribute('aria-label') === 'New file name'"),
    'inline creation focuses input'
  )
  await key('Escape')
  assert.deepEqual(
    await readdir(join(root, 'workspace/Campaign/Notes')),
    [],
    'Escape cancels creation without filesystem changes'
  )
  await focusItem('Campaign')
  await click('New File')
  await setInput('.tree-inline-edit input', 'not-markdown.txt')
  await key('Return')
  await until(
    async () =>
      await evaluate(
        "document.querySelector('.tree-inline-error')?.textContent.includes('Markdown')"
      ),
    'invalid extension remains editable'
  )
  assert.equal(
    await evaluate('document.activeElement?.getAttribute("aria-label")'),
    'New file name'
  )
  await screenshot('inline-create.png')
  await confirmName('Dragonfire')
  await until(
    async () => (await heading()) === 'Campaign/Dragonfire.md',
    'new Markdown document opens'
  )
  assert.equal(
    await evaluate("document.activeElement.classList.contains('cm-content')"),
    true,
    'creation focuses editor'
  )
  await window.webContents.insertText('# Dragonfire\n\nDraft armor rules.')
  // F2 must flush the dirty document before changing its pathname.
  await focusItem('Campaign/Dragonfire.md')
  await key('F2')
  assert.equal(
    await evaluate('document.querySelector(".tree-inline-edit input").selectionEnd'),
    'Dragonfire'.length,
    'rename initially selects filename stem'
  )
  await confirmName('Dragonfire Mechanics')
  await until(
    async () => (await heading()) === 'Campaign/Dragonfire Mechanics.md',
    'renamed active document stays open'
  )
  assert.equal(
    await readFile(join(root, 'workspace/Campaign/Dragonfire Mechanics.md'), 'utf8'),
    '# Dragonfire\n\nDraft armor rules.',
    'rename flushes pending content'
  )
  assert.equal(
    await evaluate(
      "document.querySelector('.cm-content').textContent.includes('Draft armor rules.')"
    ),
    true,
    'rename preserves editor content'
  )
  await picker('dragonfire mechanics')
  await until(
    async () => (await heading()) === 'Campaign/Dragonfire Mechanics.md',
    'Quick Open finds renamed file'
  )
  await key('z', ['control'])
  await until(
    async () =>
      !(await evaluate(
        "document.querySelector('.cm-content').textContent.includes('Draft armor rules.')"
      )),
    'undo history survives active-file rename'
  )
  await key('z', ['control', 'shift'])
  await until(
    async () =>
      await evaluate(
        "document.querySelector('.cm-content').textContent.includes('Draft armor rules.')"
      ),
    'redo survives rename'
  )
  // A is cached while B is active. Rename A from the tree, then travel through it.
  await picker('a.md')
  await until(async () => (await heading()) === 'a.md', 'history A opens')
  await picker('dragonfire mechanics')
  await until(
    async () => (await heading()) === 'Campaign/Dragonfire Mechanics.md',
    'history B opens'
  )
  await click('Toggle files')
  await focusItem('a.md')
  await key('F2')
  await confirmName('Renamed A')
  assert.equal(
    await heading(),
    'Campaign/Dragonfire Mechanics.md',
    'renaming selected cached file does not switch active document'
  )
  await evaluate("document.querySelector('.cm-content').focus()")
  await key('Left', ['alt'])
  await until(
    async () => (await heading()) === 'Renamed A.md',
    'Back uses renamed cached file path'
  )
  await key('Right', ['alt'])
  await until(
    async () => (await heading()) === 'Campaign/Dragonfire Mechanics.md',
    'Forward returns to active B'
  )
  await focusItem('Campaign')
  await key('F2')
  await confirmName('World')
  await until(
    async () => (await heading()) === 'World/Dragonfire Mechanics.md',
    'folder rename remaps active descendant'
  )
  assert.equal(
    await readFile(join(root, 'workspace/World/Dragonfire Mechanics.md'), 'utf8'),
    '# Dragonfire\n\nDraft armor rules.'
  )
  await evaluate("document.querySelector('.cm-content').focus()")
  await key('Left', ['alt'])
  await until(
    async () => (await heading()) === 'Renamed A.md',
    'Back remains valid after folder rename'
  )
  await key('Right', ['alt'])
  await until(
    async () => (await heading()) === 'World/Dragonfire Mechanics.md',
    'Forward uses remapped nested path'
  )
  await picker('world/dragonfire')
  await until(
    async () => (await heading()) === 'World/Dragonfire Mechanics.md',
    'Quick Open recents/path metadata follows folder rename'
  )
  await click('Toggle files')
  await focusItem('World/Notes')
  await key('F10', ['shift'])
  await until(
    async () => await evaluate("Boolean(document.querySelector('[role=menu]'))"),
    'keyboard context menu opens'
  )
  assert.equal(await evaluate('document.activeElement.textContent'), 'New File')
  await key('Return')
  await confirmName('Temporary')
  await until(
    async () => (await heading()) === 'World/Notes/Temporary.md',
    'context menu creates inside selected folder'
  )
  // Replace only the OS Trash boundary in this temporary test workspace.
  const confirmations = []
  let response = 0
  dialog.showMessageBox = async (options) => {
    confirmations.push(options)
    return { response, checkboxChecked: false }
  }
  const trashed = []
  await mkdir(join(root, 'test-trash'))
  shell.trashItem = async (path) => {
    assert.ok(path.startsWith(workspaceRoot + sep), 'only test workspace paths reach Trash')
    trashed.push(path)
    await rename(path, join(root, 'test-trash', String(trashed.length)))
  }
  await focusItem('World/Notes/Temporary.md')
  await key('Delete')
  await until(() => confirmations.length === 1, 'Delete asks for confirmation')
  assert.deepEqual(trashed, [], 'Cancel does not invoke OS Trash')
  assert.equal(confirmations[0].message, 'Move “Temporary.md” to Trash?')
  response = 1
  await focusItem('World/Notes/Temporary.md')
  await key('Delete')
  await until(
    async () =>
      !(await evaluate('window.margin.workspace.current()')).files.includes(
        'World/Notes/Temporary.md'
      ),
    'trashed file removed immediately'
  )
  assert.equal(
    await readFile(join(root, 'test-trash/1'), 'utf8'),
    '',
    'Trash boundary preserves the file'
  )
  assert.equal(await heading(), null, 'trashing active file closes its safely saved session')
  // Folder warning must include unseen content, even when no Markdown children remain.
  await writeFile(join(root, 'workspace/World/Notes/unseen.png'), 'Image')
  response = 0
  await focusItem('World/Notes')
  await key('Delete')
  await until(() => confirmations.length === 3, 'folder Trash asks for confirmation')
  assert.equal(confirmations[2].message, 'Move “Notes” and all of its contents to Trash?')
  assert.equal(
    confirmations[2].detail,
    'The folder may contain files that Margin does not display.'
  )
  assert.equal(trashed.length, 1, 'cancelled folder Trash keeps unseen assets')
  // File selection creates beside a file, never below its filename.
  await focusItem('World/Dragonfire Mechanics.md')
  await click('New File')
  await confirmName('Sibling')
  await until(
    async () => (await heading()) === 'World/Sibling.md',
    'file-target creation uses its parent'
  )
  // Root/background context and pointer menu selection share the command path.
  await evaluate(
    "document.querySelector('.file-tree-scroll').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 200 }))"
  )
  await until(
    async () => await evaluate("document.querySelectorAll('[role=menuitem]').length === 2"),
    'root menu exposes creation only'
  )
  await evaluate("document.querySelectorAll('[role=menuitem]')[1].click()")
  await confirmName('Root Folder')
  assert.ok((await readdir(join(root, 'workspace'))).includes('Root Folder'))
  await screenshot('file-operations.png')
  // A conflicting local draft must block both operations before filesystem IPC.
  await evaluate("document.querySelector('.cm-content').focus()")
  await window.webContents.insertText('Local draft')
  await writeFile(join(root, 'workspace/World/Sibling.md'), 'External version')
  await until(
    async () => await evaluate("document.body.textContent.includes('autosave is paused')"),
    'conflicting external change detected'
  )
  await focusItem('World/Sibling.md')
  await key('F2')
  await setInput('.tree-inline-edit input', 'Blocked')
  await key('Return')
  await until(
    async () =>
      await evaluate(
        "document.querySelector('.tree-inline-error')?.textContent.includes('Resolve or save')"
      ),
    'conflict blocks rename inline'
  )
  assert.equal(await readFile(join(root, 'workspace/World/Sibling.md'), 'utf8'), 'External version')
  assert.ok(!(await readdir(join(root, 'workspace/World'))).includes('Blocked.md'))
  await key('Escape')
  const beforeBlockedTrash = confirmations.length
  await focusItem('World/Sibling.md')
  await key('Delete')
  await until(
    async () =>
      await evaluate("document.body.textContent.includes('before moving this item to Trash')"),
    'conflict blocks Trash before confirmation'
  )
  assert.equal(confirmations.length, beforeBlockedTrash)
  assert.equal(trashed.length, 1)
  await evaluate(
    "Array.from(document.querySelectorAll('.conflict-actions button')).find(button => button.textContent === 'Use disk version').click()"
  )
  await until(
    async () => !(await evaluate("document.body.textContent.includes('autosave is paused')")),
    'conflict resolved through existing workflow'
  )
  await writeFile(join(root, 'workspace/World/external.md'), '# External file')
  await until(
    async () =>
      await evaluate(
        'Boolean(document.querySelector(\'[role=treeitem][title="World/external.md"]\'))'
      ),
    'external create updates tree'
  )
  await rename(
    join(root, 'workspace/World/external.md'),
    join(root, 'workspace/World/external-renamed.md')
  )
  await until(
    async () =>
      (await evaluate('window.margin.workspace.current()')).files.includes(
        'World/external-renamed.md'
      ) &&
      !(await evaluate('window.margin.workspace.current()')).files.includes('World/external.md'),
    'external rename reconciles known paths'
  )
  // Keep existing restore fixtures intact for the next process.
  const reverted = await evaluate(
    `window.margin.workspace.rename({ root: ${JSON.stringify(workspaceRoot)}, path: 'Renamed A.md', name: 'a.md' })`
  )
  assert.equal(reverted.ok, true)
  console.log(
    'PASS Picker memoization, inline create/cancel/validation, F2 rename, undo preservation, renamed navigation, folder remapping, context menus, confirmed OS Trash boundary and unseen-folder warning'
  )
}
