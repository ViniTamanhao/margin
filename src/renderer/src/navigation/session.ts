import { isWithinPath, remapPath } from '../../../shared/workspace-paths'

export interface NavigationLocation {
  path: string
  position: number
}
export type NavigationDirection = 'back' | 'forward'
const sameLocation = (a: NavigationLocation, b: NavigationLocation): boolean =>
  a.path === b.path && a.position === b.position

// Session-only metadata. Locations are recorded at explicit navigation boundaries.
export class NavigationSession {
  private back: NavigationLocation[] = []
  private forward: NavigationLocation[] = []
  recents: readonly string[] = []

  target(direction: NavigationDirection): NavigationLocation | undefined {
    return (direction === 'back' ? this.back : this.forward).at(-1)
  }

  private push(stack: NavigationLocation[], location: NavigationLocation): void {
    if (!stack.length || !sameLocation(stack[stack.length - 1], location)) {
      stack.push({ ...location })
      if (stack.length > 100) stack.shift()
    }
  }

  record(from: NavigationLocation | null, to: NavigationLocation): void {
    if (!from || !sameLocation(from, to)) {
      if (from) this.push(this.back, from)
      this.forward = []
    }
    this.visit(to.path)
  }

  // Commit only after the editor has successfully loaded the target.
  travel(direction: NavigationDirection, from: NavigationLocation | null): void {
    const source = direction === 'back' ? this.back : this.forward
    const destination = direction === 'back' ? this.forward : this.back
    const target = source.pop()
    if (!target) return
    if (from) this.push(destination, from)
    this.visit(target.path)
  }

  private visit(path: string): void {
    this.recents = [path, ...this.recents.filter((recent) => recent !== path)].slice(0, 50)
  }

  remap(from: string, to: string): void {
    const location = (entry: NavigationLocation): NavigationLocation => ({
      ...entry,
      path: remapPath(entry.path, from, to)
    })
    this.back = this.back.map(location)
    this.forward = this.forward.map(location)
    this.recents = [...new Set(this.recents.map((path) => remapPath(path, from, to)))]
  }

  remove(path: string): void {
    this.back = this.back.filter((entry) => !isWithinPath(entry.path, path))
    this.forward = this.forward.filter((entry) => !isWithinPath(entry.path, path))
    this.recents = this.recents.filter((recent) => !isWithinPath(recent, path))
  }

  reset(): void {
    this.back = []
    this.forward = []
    this.recents = []
  }
}
