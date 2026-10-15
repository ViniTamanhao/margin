import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, language } from '@codemirror/language'
import { fuzzyScore } from '../navigation/matching'

export interface Heading {
  title: string
  level: number
  position: number
}
export interface HeadingSnapshot {
  path: string
  version: number
  headings: Heading[]
}

export async function extractHeadings(
  state: EditorState,
  isCancelled: () => boolean = () => false
): Promise<Heading[] | null> {
  if (!state.facet(language)) return []
  // Finish only this document's existing incremental parse. Yield between short
  // budgets so opening a picker never demands one long synchronous parse.
  let tree = ensureSyntaxTree(state, state.doc.length, 8)
  while (!tree) {
    if (isCancelled()) return null
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    if (isCancelled()) return null
    tree = ensureSyntaxTree(state, state.doc.length, 8)
  }
  if (isCancelled()) return null
  const headings: Heading[] = []
  tree.iterate({
    enter(node) {
      const match = /^(?:ATXHeading|SetextHeading)([1-6])$/.exec(node.name)
      if (!match) return
      const cursor = node.node.cursor()
      const markers: { from: number; to: number }[] = []
      while (cursor.next() && cursor.from < node.to) {
        if (
          ['HeaderMark', 'EmphasisMark', 'CodeMark', 'LinkMark', 'LinkTitle'].includes(
            cursor.name
          ) ||
          (cursor.name === 'URL' && cursor.node.parent?.name === 'Link')
        ) {
          markers.push({ from: cursor.from, to: cursor.to })
        }
      }
      let from = node.from
      let title = ''
      for (const marker of markers.sort((a, b) => a.from - b.from)) {
        if (marker.from >= from) title += state.sliceDoc(from, marker.from)
        from = Math.max(from, marker.to)
      }
      title += state.sliceDoc(from, node.to)
      headings.push({
        title: title.trim().replace(/\s+/g, ' ') || '(Untitled heading)',
        level: Number(match[1]),
        position: node.from
      })
      return false
    }
  })
  return headings
}

export function matchHeadings(query: string, headings: readonly Heading[]): Heading[] {
  return headings
    .flatMap((heading) => {
      const score = fuzzyScore(query, heading.title)
      return score === null ? [] : [{ heading, score }]
    })
    .sort((a, b) => b.score - a.score || a.heading.position - b.heading.position)
    .map(({ heading }) => heading)
}
