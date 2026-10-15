// Paths at the application boundary use '/' and are workspace-relative.
export function isWithinPath(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`)
}

export function remapPath(path: string, from: string, to: string): string {
  return isWithinPath(path, from) ? to + path.slice(from.length) : path
}

export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

export function entryName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
