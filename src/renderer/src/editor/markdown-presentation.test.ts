import { expect, test } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { hiddenMarkdownMarkers } from './markdown-presentation'

function state(doc: string, anchor = doc.length): EditorState {
  return EditorState.create({ doc, selection: { anchor }, extensions: [markdown()] })
}
function hiddenText(editor: EditorState): string[] {
  return hiddenMarkdownMarkers(editor).map(({ from, to }) => editor.sliceDoc(from, to))
}
test('inactive headings hide opening whitespace and optional closing markers', () => {
  const editor = state('## Heading ##\nElsewhere')
  expect(hiddenText(editor)).toEqual(['## ', ' ##'])
  expect(editor.sliceDoc()).toBe('## Heading ##\nElsewhere')
  for (let anchor = 0; anchor <= 13; anchor++) {
    expect(hiddenText(editor.update({ selection: { anchor } }).state)).toEqual([])
  }
})
test('safe emphasis and inline code hide markers, revealing the whole touched construct', () => {
  const editor = state('**bold** *italic* `code`\nElsewhere')
  expect(hiddenText(editor)).toEqual(['**', '**', '*', '*', '`', '`'])
  expect(hiddenText(editor.update({ selection: { anchor: 3 } }).state)).toEqual([
    '*',
    '*',
    '`',
    '`'
  ])
  expect(hiddenText(editor.update({ selection: { anchor: 8 } }).state)).toEqual([
    '*',
    '*',
    '`',
    '`'
  ])
})
test('crossing selections and multiple cursors reveal all intersecting constructs', () => {
  const editor = state('## Heading\n**bold** *italic*\nElsewhere')
  expect(hiddenText(editor.update({ selection: { anchor: 1, head: 27 } }).state)).toEqual([])
  const multiple = EditorState.create({
    doc: editor.doc,
    selection: EditorSelection.create([EditorSelection.cursor(2), EditorSelection.cursor(14)]),
    extensions: [markdown(), EditorState.allowMultipleSelections.of(true)]
  })
  expect(hiddenText(multiple)).toEqual(['*', '*'])
})
test('code blocks, escaped markers, incomplete syntax and multiline emphasis remain source', () => {
  expect(
    hiddenText(
      state(
        '```md\n## heading\n**bold**\n```\n\\*escaped* **unfinished\n*multiple\nlines*\nElsewhere'
      )
    )
  ).toEqual([])
})
test('nested emphasis and viewport-limited collection stay ordered', () => {
  const editor = state('## Heading\n**bold with *italic***\nElsewhere')
  const markers = hiddenMarkdownMarkers(editor, 11, 33)
  expect(markers.map(({ from, to }) => editor.sliceDoc(from, to))).toEqual(['**', '*', '*', '**'])
})

test('a cursor in heading indentation reveals markers on that line', () => {
  expect(hiddenText(state('   ## Heading\nElsewhere', 0))).toEqual([])
  expect(hiddenText(state('   ## Heading\nElsewhere'))).toEqual(['## '])
})
