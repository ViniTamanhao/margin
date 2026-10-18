import { createElement, type ReactNode } from 'react'
import { markdownLanguage } from '@codemirror/lang-markdown'

type MarkdownNode = ReturnType<typeof markdownLanguage.parser.parse>['topNode']

// Reuse the editor's Markdown grammar. React escapes all source text; raw HTML,
// images and unsupported constructs remain text rather than executable markup.
export function renderMarkdown(source: string): ReactNode {
  function render(node: MarkdownNode): ReactNode {
    const text = source.slice(node.from, node.to)
    const children: ReactNode[] = []
    let position = node.from
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.from > position) children.push(source.slice(position, child.from))
      children.push(render(child))
      position = child.to
    }
    if (position < node.to) children.push(source.slice(position, node.to))
    const element = (tag: string, content: ReactNode = children): ReactNode =>
      createElement(tag, { key: node.from }, content)
    if (/^(HeaderMark|EmphasisMark|CodeMark|ListMark|QuoteMark)$/.test(node.name)) return null
    const heading = /^(?:ATXHeading([1-6])|SetextHeading([12]))$/.exec(node.name)
    if (heading) return element(`h${heading[1] ?? heading[2]}`)
    switch (node.name) {
      case 'Document':
        return children
      case 'Paragraph':
        return element('p')
      case 'StrongEmphasis':
        return element('strong')
      case 'Emphasis':
        return element('em')
      case 'InlineCode':
        return element('code', text.replace(/^(`+)\s?([\s\S]*?)\s?\1$/, '$2').replace(/\n/g, ' '))
      case 'FencedCode':
      case 'CodeBlock': {
        const code = node.getChild('CodeText')
        return element(
          'pre',
          createElement('code', null, code ? source.slice(code.from, code.to) : '')
        )
      }
      case 'BulletList':
        return element('ul')
      case 'OrderedList':
        return createElement(
          'ol',
          { key: node.from, start: Number(/^\d+/.exec(text)?.[0] ?? 1) },
          children
        )
      case 'ListItem':
        return element('li')
      case 'Blockquote':
        return element('blockquote')
      case 'HorizontalRule':
        return createElement('hr', { key: node.from })
      case 'HardBreak':
        return createElement('br', { key: node.from })
      case 'Escape':
        return text.slice(1)
      case 'Link': {
        const url = node.getChild('URL')
        const href = url ? source.slice(url.from, url.to).replace(/^<|>$/g, '') : ''
        if (!/^(https?:\/\/|mailto:)/i.test(href)) return text
        const label: ReactNode[] = []
        const marks = node.getChildren('LinkMark')
        let position = marks[0].to
        const end = marks[1].from
        for (let child = node.firstChild; child && child.from < end; child = child.nextSibling) {
          if (child.from < position) continue
          if (child.from > position) label.push(source.slice(position, child.from))
          label.push(render(child))
          position = child.to
        }
        if (position < end) label.push(source.slice(position, end))
        return createElement(
          'a',
          { key: node.from, href, target: '_blank', rel: 'noreferrer' },
          label
        )
      }
      default:
        return text
    }
  }
  return render(markdownLanguage.parser.parse(source).topNode)
}
