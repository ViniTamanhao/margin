import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

// Both src/main (tests) and out/main (Electron) sit two levels below the app root.
// Executables must run outside ASAR; electron-builder unpacks resources/**.
const helper = resolve(
  __dirname,
  '../../resources/native',
  process.platform === 'win32' ? 'rename-no-replace.exe' : 'rename-no-replace'
).replace(/\.asar([/\\])/g, '.asar.unpacked$1')

export async function renameNoReplace(source: string, destination: string): Promise<void> {
  try {
    await execute(helper, [source, destination], { windowsHide: true })
  } catch (error) {
    const status = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    const code =
      status === 2 ? 'EEXIST' : status === 3 ? 'ENOENT' : status === 4 ? 'ENOTSUP' : 'EIO'
    // Preserve diagnostics for main-process logs without exposing OS details over IPC.
    throw Object.assign(new Error('Atomic no-replace rename failed.', { cause: error }), { code })
  }
}
