/**
 * Emit the host half as plain JavaScript.
 *
 * `main` and `exports["."]` point at `lib/index.js` rather than at
 * `src/index.ts` because Node refuses to strip TypeScript types for any file
 * under a `node_modules` directory — and every install path except `link:` (npm,
 * a packed tarball, `github:`) copies the package into one. The emitted file is
 * committed, so an install needs no build script and therefore no pnpm
 * `allowBuilds` approval.
 *
 * Source stays `src/index.ts`; this script is the whole toolchain, so nothing
 * here depends on a TypeScript compiler being available.
 *
 * Usage: node scripts/build.mjs [--check]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'src', 'index.ts')
const target = join(root, 'lib', 'index.js')

const banner = '// GENERATED from src/index.ts by `npm run build` — edit the source, not this file.\n'
const emitted = banner + stripTypeScriptTypes(readFileSync(source, 'utf8'), { mode: 'strip' })

if (process.argv.includes('--check')) {
  let current
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    console.error('build: lib/index.js is missing; run `npm run build`')
    process.exit(1)
  }
  if (current !== emitted) {
    console.error('build: lib/index.js is stale; run `npm run build`')
    process.exit(1)
  }
  console.log('build: lib/index.js is up to date')
} else {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, emitted)
  console.log(`build: wrote ${target} (${emitted.length} bytes)`)
}
