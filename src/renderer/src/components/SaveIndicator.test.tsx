import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SaveIndicator } from './SaveIndicator'

test('save transitions use a dot, spinner, then no visible indicator', () => {
  const dirty = renderToStaticMarkup(<SaveIndicator status="dirty" />)
  expect(dirty).toContain('Unsaved changes')
  expect(dirty).toContain('save-dot')
  const saving = renderToStaticMarkup(<SaveIndicator status="saving" />)
  expect(saving).toContain('Saving…')
  expect(saving).toContain('save-spinner')
  expect(renderToStaticMarkup(<SaveIndicator status="saved" />)).not.toContain('aria-label')
})

test.each([
  ['error', 'Could not save'],
  ['conflict', 'Save conflict'],
  ['missing', 'File unavailable']
] as const)('%s shows an accessible warning', (status, label) => {
  const html = renderToStaticMarkup(<SaveIndicator status={status} />)
  expect(html).toContain(`aria-label="${label}"`)
  expect(html).toContain('<svg')
})
