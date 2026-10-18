import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SaveIndicator } from './SaveIndicator'

test.each([
  ['dirty', 'not saved'],
  ['saving', 'saving...'],
  ['saved', 'saved'],
  ['idle', '']
] as const)('%s displays quiet text without icons', (status, text) => {
  const html = renderToStaticMarkup(<SaveIndicator status={status} />)
  expect(html).toContain(`>${text}</span>`)
  expect(html).not.toContain('<svg')
})

test.each([
  ['error', 'Could not save'],
  ['conflict', 'Save conflict'],
  ['missing', 'File unavailable']
] as const)('%s displays not saved with accessible failure details', (status, label) => {
  const html = renderToStaticMarkup(<SaveIndicator status={status} />)
  expect(html).toContain(`aria-label="${label}"`)
  expect(html).toContain('>not saved</span>')
  expect(html).toContain(`title="${label}"`)
  expect(html).not.toContain('<svg')
})
