import { expect, test } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { extractHeadings, matchHeadings } from './headings'
const state = (doc: string): EditorState => EditorState.create({ doc, extensions: [markdown()] })

test('extracts ATX and Setext levels, readable titles and exact source targets', async () => {
  const doc =
    '# Dragonfire #\n\n## **Damage**\n\n### [Interaction with Armor](armor.md)\n\n#### `Magic`\n\n##### Five\n\n###### Six\n\nSetext One\n===\n\nSetext Two\n---\n'
  const headings = await extractHeadings(state(doc))
  expect(headings?.map(({ title, level }) => [title, level])).toEqual([
    ['Dragonfire', 1],
    ['Damage', 2],
    ['Interaction with Armor', 3],
    ['Magic', 4],
    ['Five', 5],
    ['Six', 6],
    ['Setext One', 1],
    ['Setext Two', 2]
  ])
  expect(headings?.[2].position).toBe(doc.indexOf('### '))
  expect(matchHeadings('armor', headings!)).toEqual([headings![2]])
  expect(matchHeadings('iwA', headings!)).toEqual([headings![2]])
  expect(matchHeadings('', headings!)).toEqual(headings)
  expect(matchHeadings('zzz', headings!)).toEqual([])
})
test('ignores code fences, indented code, escaped markers and ordinary text', async () => {
  const doc =
    '```md\n# Fenced\n```\n\n~~~\n## Also fenced\n~~~\n\n    # Indented\n\n\\# Escaped\n\nNot # a heading\n\n> ## Quoted heading\n'
  expect((await extractHeadings(state(doc)))?.map(({ title }) => title)).toEqual(['Quoted heading'])
})
test('includes headings beyond the initial parser viewport and supports cancellation', async () => {
  const doc = 'A paragraph.\n\n'.repeat(4000) + '# Far away\n'
  expect((await extractHeadings(state(doc)))?.at(-1)).toMatchObject({
    title: 'Far away',
    position: doc.indexOf('# Far away')
  })
  expect(await extractHeadings(state('# Heading'), () => true)).toBeNull()
  expect(await extractHeadings(state('No headings here'))).toEqual([])
})
