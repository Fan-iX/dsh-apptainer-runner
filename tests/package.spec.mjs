// Guards the two properties that make the package installable from anywhere
// other than `link:`: the committed plain-JavaScript entry, and a manifest that
// points at it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('lib/index.js is the committed build of src/index.ts', () => {
  const build = spawnSync(process.execPath, ['scripts/build.mjs', '--check'], { cwd: root, encoding: 'utf8' })
  assert.equal(build.status, 0, (build.stderr || build.stdout).trim())
})

test('the entry is plain JavaScript under lib, not the TypeScript source', () => {
  // Node refuses to strip types for any file under node_modules, and every
  // install path except `link:` (npm, a tarball, github:) copies the package
  // there — a `.ts` entry could never load from one.
  assert.equal(pkg.main, './lib/index.js')
  assert.equal(pkg.exports['.'].default, './lib/index.js')
  assert.ok(!pkg.main.endsWith('.ts'), 'a TypeScript entry cannot load from node_modules')
  assert.ok(pkg.files.includes('lib'), 'the published payload must carry the built entry')
  assert.ok(pkg.files.includes('client'), 'the published payload must carry the browser half')
})

test('installing needs no build approval, so there is no prepare or install script', () => {
  // pnpm >= 10 refuses a git dependency's build scripts unless the profile opts
  // in with `allowBuilds`. Committing the built entry keeps that gate closed.
  for (const lifecycle of ['prepare', 'prepack', 'postinstall', 'install']) {
    assert.equal(pkg.scripts[lifecycle], undefined, `${lifecycle} would require the profile to allow builds`)
  }
})
