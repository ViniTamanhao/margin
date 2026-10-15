import type { WorkspaceEntry, WorkspaceResult } from './api'

// Shared validation keeps inline feedback and main-process authorization aligned.
// Main still validates every request; renderer validation grants no filesystem access.
export function normalizeEntryName(
  name: string,
  kind: WorkspaceEntry['kind']
): WorkspaceResult<string> {
  const invalid = (message: string): WorkspaceResult<string> => ({
    ok: false,
    error: { code: 'invalid-name', message }
  })
  if (
    !name ||
    name !== name.trim() ||
    name === '.' ||
    name === '..' ||
    /[<>:"/\\|?*]/.test(name) ||
    [...name].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    ['.git', 'node_modules', '.hg', '.svn'].includes(name)
  ) {
    return invalid(
      'Use a single name without path separators, reserved names, or trailing spaces/dots.'
    )
  }
  if (kind === 'directory') return { ok: true, value: name }
  if (name.toLowerCase() === '.md') return invalid('Enter a filename before .md.')
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot) : ''
  if (extension && extension.toLowerCase() !== '.md')
    return invalid('Margin creates Markdown files. Use a name ending in .md.')
  return { ok: true, value: extension ? name : `${name}.md` }
}
