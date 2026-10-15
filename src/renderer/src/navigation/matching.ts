// Subsequence scoring rewards word/camel-case boundaries and contiguous runs.
// Dynamic programming chooses the best run rather than the first possible match.
export function fuzzyScore(query: string, text: string): number | null {
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  const haystack = text.toLowerCase()
  let previous = new Array<number>(text.length).fill(-Infinity)
  for (let i = 0; i < needle.length; i++) {
    const current = new Array<number>(text.length).fill(-Infinity)
    let bestGap = -Infinity
    for (let j = 0; j < text.length; j++) {
      if (j > 0) bestGap = Math.max(bestGap, previous[j - 1] + j - 1)
      if (needle[i] !== haystack[j]) continue
      const boundary =
        j === 0 ||
        /[\s/_.-]/.test(text[j - 1]) ||
        (text[j] !== haystack[j] && text[j - 1] === haystack[j - 1])
      const bonus = 5 + (boundary ? 16 : 0)
      current[j] =
        i === 0
          ? bonus - j * 0.3
          : bonus + Math.max(bestGap - j + 1, j > 0 ? previous[j - 1] + 12 : -Infinity)
    }
    previous = current
  }
  const best = previous.reduce((best, score) => Math.max(best, score), -Infinity)
  if (!Number.isFinite(best)) return null
  return (
    best -
    text.length * 0.05 +
    (haystack.startsWith(needle) ? 20 : 0) +
    (haystack === needle ? 30 : 0)
  )
}

export function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface FileMatch {
  path: string
  score: number
}

export function matchFiles(
  query: string,
  files: readonly string[],
  recents: readonly string[] = []
): FileMatch[] {
  const recentOrder = new Map(recents.map((path, index) => [path, index]))
  return files
    .flatMap((path): FileMatch[] => {
      if (!query.trim()) return [{ path, score: 0 }]
      const filename = path.slice(path.lastIndexOf('/') + 1)
      const nameScore = fuzzyScore(query, filename)
      const pathScore = fuzzyScore(query, path)
      if (nameScore === null && pathScore === null) return []
      return [
        {
          path,
          score: Math.max(nameScore === null ? -Infinity : nameScore + 40, pathScore ?? -Infinity)
        }
      ]
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (recentOrder.get(a.path) ?? Infinity) - (recentOrder.get(b.path) ?? Infinity) ||
        comparePaths(a.path, b.path)
    )
}
