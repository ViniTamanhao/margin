import { build } from 'vite'
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
await writeFile(
  join(root, 'workspace/nested/b.md'),
  '# Dragonfire\n\n## Damage\n\n' +
    'A long passage.\n\n'.repeat(90) +
    '## Interaction with Armor\n\nArmor details.\n\n### Magical Resistance\n'
)
await writeFile(join(root, 'workspace/.git/ignored.md'), 'ignored')
// Exercise the real Picker in Electron with an instrumented matcher, without
// introducing a DOM test dependency or production-only diagnostic APIs.
const probe = await build({
  configFile: false,
  logLevel: 'error',
  esbuild: { jsx: 'automatic' },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    write: false,
    minify: false,
    lib: { entry: 'scripts/fixtures/picker-probe.tsx', formats: ['iife'], name: 'PickerProbe' }
  }
})
const output = Array.isArray(probe) ? probe[0] : probe
const chunk = output.output.find((entry) => entry.type === 'chunk')
await writeFile(join(root, 'picker-probe.js'), chunk.code)
const editorProbe = await build({
  configFile: false,
  logLevel: 'error',
  build: {
    write: false,
    lib: { entry: 'scripts/fixtures/editor-probe.ts', formats: ['iife'], name: 'EditorProbe' }
  }
})
const editorOutput = Array.isArray(editorProbe) ? editorProbe[0] : editorProbe
await writeFile(
  join(root, 'editor-probe.js'),
  editorOutput.output.find((entry) => entry.type === 'chunk').code
)
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
  const modes = process.env.MARGIN_SMOKE_ONLY?.split(',') ?? [
    'initial',
    'files',
    'restore',
    'missing',
    'polish'
  ]
  for (const mode of modes) {
    if (mode === 'missing') await rm(join(root, 'workspace'), { recursive: true, force: true })
    await run(mode)
  }
  console.log(`Smoke artifacts: ${root}`)
} catch (error) {
  console.error(`Smoke artifacts: ${root}`)
  throw error
}
