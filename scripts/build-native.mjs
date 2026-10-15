import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// A tiny standalone helper avoids Node/Electron ABI bindings. Compile for the
// current host; cross-platform packages must be built on their target platform.
export function buildNative() {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const directory = join(root, 'resources/native')
  mkdirSync(directory, { recursive: true })
  const windows = process.platform === 'win32'
  const compiler = process.env.CC || (windows ? 'clang' : 'cc')
  execFileSync(
    compiler,
    [
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      join(root, 'native/rename-no-replace.c'),
      '-o',
      join(directory, windows ? 'rename-no-replace.exe' : 'rename-no-replace'),
      ...(windows ? ['-lshell32'] : [])
    ],
    { stdio: 'inherit' }
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) buildNative()
