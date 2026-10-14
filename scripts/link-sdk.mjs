/**
 * Link the DSH SDK into this plugin's `node_modules`.
 *
 * `src/index.ts` imports `@deepseek-ai/dsh-tools` and `@deepseek-ai/schemastery`,
 * and Node resolves a plugin's imports from the plugin's own directory. DSH ships
 * the SDK inside its installation rather than from a registry, so this one link is
 * what makes the plugin loadable — by DSH when it is a profile member, and by a
 * test runner here.
 *
 * Usage: node scripts/link-sdk.mjs [<dsh install dir>]
 */

import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const link = join(root, 'node_modules', '@deepseek-ai')

/** A directory owning the SDK: `<dir>/node_modules/@deepseek-ai/dsh-tools`. */
const ownsSdk = dir => existsSync(join(dir, 'node_modules', '@deepseek-ai', 'dsh-tools', 'package.json'))

// An explicit argument is the only candidate: silently falling back to another
// installation would link a plugin against a harness the caller did not name.
const explicit = process.argv[2]
const candidates = explicit !== undefined ? [explicit] : [process.env.DSH_HARNESS, '/opt/dsh-hub'].filter(c => typeof c === 'string' && c !== '')
const harness = candidates.find(ownsSdk)
if (harness === undefined) {
  console.error('link-sdk: no DSH installation found; pass one: node scripts/link-sdk.mjs <dsh install dir>')
  console.error(`  looked in: ${candidates.join(', ')}`)
  process.exit(1)
}

/** The link's current target, or undefined when the path is absent or not a link. */
function currentTarget(path) {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : undefined
  } catch {
    return undefined
  }
}

const target = join(harness, 'node_modules', '@deepseek-ai')
if (currentTarget(link) === target) {
  console.log(`already linked: ${link} -> ${target}`)
  process.exit(0)
}
mkdirSync(join(root, 'node_modules'), { recursive: true })
rmSync(link, { recursive: true, force: true })
symlinkSync(target, link, 'dir')
console.log(`linked ${link} -> ${target}`)
