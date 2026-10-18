import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMarkdown } from './render-markdown'

const render = (source: string): string => renderToStaticMarkup(<>{renderMarkdown(source)}</>)

test('renders the V0 Markdown subset without exposing source markers', () => {
  const html = render(
    '# Heading\n\nParagraph **bold** and *italic* with `code`.\n\n```ts\nconst x = 1\n```\n\n- First\n- Second\n\n3. Third\n\n> Quote\n\n---\n\n[Margin](https://example.com)'
  )
  for (const fragment of [
    '<h1>',
    'Heading',
    '<p>',
    '<strong>bold</strong>',
    '<em>italic</em>',
    '<code>code</code>',
    '<pre><code>const x = 1</code></pre>',
    '<ul>',
    '<li>',
    '<ol start="3">',
    '<blockquote>',
    '<hr/>',
    'href="https://example.com"'
  ])
    expect(html).toContain(fragment)
  expect(html).not.toContain('```')
})

test('raw HTML, images and unsafe links stay inert', () => {
  const html = render(
    '<script>alert(1)</script>\n\n[x](javascript:alert)\n\n![image](https://example.com/image.png)'
  )
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('href=')
  expect(html).not.toContain('<img')
  expect(html).toContain('&lt;script&gt;')
})
