import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const root = await mkdtemp(join(tmpdir(), 'margin-smoke-'))
await mkdir(join(root, 'app-data'))
await mkdir(join(root, 'workspace/nested'), { recursive: true })
await mkdir(join(root, 'empty-workspace'))
await mkdir(join(root, 'workspace/.git'))
await mkdir(join(root, 'workspace/empty'))
await writeFile(join(root, 'workspace/a.md'), '# Original\n')
await writeFile(join(root, 'workspace/nested/b.md'), '# Second\n')
await writeFile(join(root, 'workspace/.git/ignored.md'), 'ignored')
async function run(mode) {
  await new Promise((resolve, reject) => {
    const environment = { ...process.env, MARGIN_SMOKE_ROOT: root, MARGIN_SMOKE_MODE: mode }
    delete environment.ELECTRON_RUN_AS_NODE
    const child = spawn(require('electron'), ['scripts/smoke-app.mjs'], {
      env: environment,
      timeout: 60_000,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Electron smoke (${mode}) exited with ${code}`))
    )
  })
}
try {
  await run('initial')
  await run('restore')
  await rm(join(root, 'workspace'), { recursive: true, force: true })
  await run('missing')
  console.log(`Smoke artifacts: ${root}`)
} catch (error) {
  console.error(`Smoke artifacts: ${root}`)
  throw error
}
