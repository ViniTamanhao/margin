import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from '@codemirror/view'

export interface HiddenMarker {
  from: number
  to: number
}

// Only parsed, single-line constructs are hidden. Source, history and clipboard
// stay untouched; every selection (including its boundaries) reveals the construct.
export function hiddenMarkdownMarkers(
  state: EditorState,
  from = 0,
  to = state.doc.length
): HiddenMarker[] {
  const markers: HiddenMarker[] = []
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      const heading = /^ATXHeading[1-6]$/.test(node.name)
      const inline = ['Emphasis', 'StrongEmphasis', 'InlineCode'].includes(node.name)
      if (!heading && !inline) return
      if (state.doc.lineAt(node.from).number !== state.doc.lineAt(node.to).number) return
      const end = heading ? state.doc.lineAt(node.to).to : node.to
      if (state.selection.ranges.some((range) => range.from <= end && range.to >= node.from)) return
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (!['HeaderMark', 'EmphasisMark', 'CodeMark'].includes(child.name)) continue
        let start = child.from
        let end = child.to
        if (heading) {
          if (child.from === node.from) {
            while (end < node.to && /[ \t]/.test(state.sliceDoc(end, end + 1))) end++
          } else {
            while (start > node.from && /[ \t]/.test(state.sliceDoc(start - 1, start))) start--
          }
        }
        markers.push({ from: start, to: end })
      }
    }
  })
  return markers.sort((a, b) => a.from - b.from)
}

function decorations(view: EditorView): DecorationSet {
  const ranges = view.visibleRanges.flatMap(({ from, to }) =>
    hiddenMarkdownMarkers(view.state, from, to)
  )
  // Wrapped visible ranges can touch the same construct more than once.
  const unique = new Map(ranges.map((range) => [`${range.from}:${range.to}`, range]))
  return Decoration.set(
    [...unique.values()]
      .sort((a, b) => a.from - b.from)
      .map((range) => Decoration.replace({}).range(range.from, range.to))
  )
}

export const contextualMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorations(view)
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = decorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations }
)
