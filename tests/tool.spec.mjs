// Tests for the tool: the permission table, the argv it produces, the output
// contract the pipeline enforces, and — when opted in — one real container run.
//
//   npm test        (needs `npm run setup` once, for the SDK link)
//
// The container tests stay skipped unless DSH_APPTAINER_TEST_IMAGE names a .sif,
// so the suite is hermetic by default:
//
//   DSH_APPTAINER_TEST_IMAGE=/abs/path/alpine.sif npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateJsonSchemaValue, valueSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools'
import { apply, buildArgv, Config, mergePermissions, resolvePathPermission } from '../src/index.ts'

const WS = '/home/fanix/projects/dsh-apptainer'
const dir = () => mkdtempSync(join(tmpdir(), 'bind-'))

const run = (permissions = {}, args = {}) =>
  buildArgv({
    apptainer: '/usr/bin/apptainer',
    image: '/images/alpine.sif',
    workspaceRoot: WS,
    permissions: mergePermissions(permissions),
    args: { image: '/images/alpine.sif', command: 'true', ...args },
  })

// --- the permission table ---------------------------------------------------

test('rejects a relative key', () => {
  assert.throws(() => mergePermissions({ relative: 'ro' }), /must be an absolute host path/)
})

test('rejects an unknown value', () => {
  assert.throws(() => mergePermissions({ '/data': 'rw' }), /must be false, true or "ro"/)
})

test('a bare key means read-only, so read access needs no fallback restated', () => {
  // YAML parses a bare `key:` as null rather than undefined, so the shorthand
  // only works when null is accepted too.
  assert.equal(mergePermissions({ '/data': null })['/data'], 'ro')
  assert.equal(mergePermissions({ '/data': 'ro' })['/data'], 'ro')
  assert.equal(mergePermissions({})['*'], false, 'the shipped fallback mounts nothing')
})

test('the defaults hide home and keep a writable container tmpfs', () => {
  const merged = mergePermissions({ '*': 'ro' })
  assert.equal(merged['/home'], false)
  assert.equal(merged['/tmp'], true)
})

test('the fallback decides an unmentioned path', () => {
  assert.equal(resolvePathPermission({ '*': 'ro' }, '/anywhere'), 'ro')
  assert.equal(resolvePathPermission({}, '/anywhere'), false)
})

test('the longest matching key wins', () => {
  const table = { '*': 'ro', '/data': 'ro', '/data/write': true }
  assert.equal(resolvePathPermission(table, '/data/read/file'), 'ro')
  assert.equal(resolvePathPermission(table, '/data/write/file'), true)
})

test('a shared prefix is not a match', () => {
  assert.equal(resolvePathPermission({ '*': false, '/data': true }, '/database'), false)
})

test('the container-path keys are never treated as host binds', () => {
  assert.equal(resolvePathPermission({ '*': false, '/tmp': true }, '/tmp'), false)
})

// --- the argv, which is the boundary ----------------------------------------

test('mounts the workspace read-write at the neutral path, not its host path', () => {
  const argv = run()
  assert.ok(argv.includes(`${WS}:/work:rw`))
  assert.ok(!argv.includes(`${WS}:${WS}:rw`), 'a host path would resurrect /home/<user> in the container')
})

test('hides host home and tmp by default', () => {
  const argv = run()
  assert.ok(argv.includes('--containall'))
  assert.ok(argv.includes('--no-home'))
  assert.ok(argv.includes('--writable-tmpfs'))
  assert.ok(!argv.includes('--no-mount'))
})

test('the container-path keys switch those flags', () => {
  const argv = run({ '/home': true, '/tmp': false })
  assert.ok(!argv.includes('--no-home'))
  assert.ok(argv.includes('--no-mount'))
})

test('an unmentioned bind source is not mounted', () => {
  const source = dir()
  assert.ok(!run({}, { binds: [{ source }] }).some(a => a.includes(source)))
})

test('"ro" mounts read-only and true mounts read-write', () => {
  const source = dir()
  assert.ok(run({ [source]: 'ro' }, { binds: [{ source }] }).includes(`${source}:${source}:ro`))
  assert.ok(run({ [source]: true }, { binds: [{ source }] }).includes(`${source}:${source}:rw`))
})

test('the fallback mounts an unmentioned source read-only', () => {
  const source = dir()
  assert.ok(run({ '*': 'ro' }, { binds: [{ source }] }).includes(`${source}:${source}:ro`))
})

test('a specific key overrides the fallback', () => {
  const source = dir()
  assert.ok(!run({ '*': 'ro', [source]: false }, { binds: [{ source }] }).some(a => a.includes(source)))
})

test('binds accept a distinct container target', () => {
  const source = dir()
  assert.ok(run({ [source]: 'ro' }, { binds: [{ source, target: '/data' }] }).includes(`${source}:/data:ro`))
})

test('rejects a relative or missing bind source', () => {
  assert.throws(() => run({}, { binds: [{ source: 'relative/dir' }] }), /absolute path/)
  assert.throws(() => run({}, { binds: [{ source: '/nonexistent/path' }] }), /does not exist/)
})

test('runs the command through a shell inside the image', () => {
  const argv = run({}, { command: 'make test' })
  assert.deepEqual(argv.slice(-3), ['/bin/sh', '-c', 'make test'])
  assert.equal(argv.at(-4), '/images/alpine.sif')
})

// --- the output contract ----------------------------------------------------
// The pipeline validates every successful value against `output.schema` and
// throws `ToolOutputError` on a violation, so a schema that refuses a value the
// body actually returns replaces the report with an opaque failure. A killed
// child — timeout, caller abort, spawn error — reports `exitCode: null`.

/**
 * Resolve a raw config through the real schema, so volatile fields arrive as the
 * `Volatile<T>` references `apply` reads with `.get()`.
 */
const resolved = (config = {}) => new Config(config)

/** Register the tool against a throwaway context and return its definition. */
const definition = (config = {}) => {
  let registered
  apply({ tools: { register: (value) => { registered = value } } }, resolved(config))
  return registered
}

/** The JSON Schema the pipeline actually enforces on a successful value. */
const enforcedOutput = (config = {}) => valueSchemaSpecToJsonSchema(definition(config).output.schema)

const value = (overrides = {}) => ({
  exitCode: 0, stdout: '', stderr: '', workspace: WS, timedOut: false, truncated: false, ...overrides,
})

test('the output schema accepts a killed run, which reports exitCode null', () => {
  // Without this the timeout, abort and spawn-error paths all fail validation.
  assert.deepEqual(validateJsonSchemaValue(enforcedOutput(), value({ exitCode: null, timedOut: true }), 'value'), [])
})

test('the output schema still accepts a normal exit code', () => {
  assert.deepEqual(validateJsonSchemaValue(enforcedOutput(), value({ exitCode: 0 }), 'value'), [])
})

test('the output schema rejects a value the tool never returns', () => {
  assert.ok(validateJsonSchemaValue(enforcedOutput(), value({ exitCode: '0' }), 'value').length > 0)
})

test('the render explains a timeout once the value is accepted', () => {
  const tool = definition()
  const text = tool.output.render({}, value({ exitCode: null, timedOut: true, stdout: '', stderr: '' }))[0].text
  assert.match(text, /exceeded its time limit/)
  assert.match(text, /exit code: null/)
})

test('env is an open object, so the model cannot pass a bare string', () => {
  const env = definition().parameters.properties.env
  assert.equal(env.type, 'object')
  assert.equal(env.additionalProperties, true)
})

// --- a real container, only when one is named -------------------------------

const IMAGE = process.env.DSH_APPTAINER_TEST_IMAGE
const apptainer = IMAGE === undefined
  ? undefined
  : spawnSync('sh', ['-c', 'command -v apptainer || command -v singularity'], { encoding: 'utf8' }).stdout?.trim()
const containerSkip = IMAGE === undefined
  ? 'set DSH_APPTAINER_TEST_IMAGE to a .sif to run the container tests'
  : apptainer === undefined || apptainer === '' ? 'no apptainer or singularity binary on PATH' : probeSkip()

/**
 * Why Apptainer cannot run here, or false when it can.
 *
 * Apptainer needs an unprivileged user namespace, which the DSH file sandbox
 * denies — the plugin spawns it from the unsandboxed Host process for exactly
 * that reason. Probing once turns a sandboxed `npm test` into a skip with the
 * real reason instead of five confusing failures.
 * @returns The skip reason, or false when Apptainer starts.
 */
function probeSkip() {
  const probe = spawnSync(apptainer, ['exec', IMAGE, 'true'], { encoding: 'utf8' })
  if (probe.status === 0) return false
  const reason = `${probe.stderr ?? ''}`.split('\n').map(line => line.trim()).filter(line => line.startsWith('ERROR')).join(' ').replace(/\u001b\[\d+m/g, '')
  return `Apptainer cannot start in this environment${reason === '' ? '' : ` (${reason})`}; run the container tests outside the sandbox, or exercise them through the apptainer_run tool`
}

/**
 * Run one command through `execute` against a context that records approvals.
 * @returns the canonical value plus every `approval.request` call it made.
 */
const execute = async (config, args, approvalOutcome = 'allowed-once') => {
  let registered
  const approvalCalls = []
  apply({
    tools: { register: (value) => { registered = value } },
    sandboxPolicy: { resolve: () => ({ workspaceRoot: WS }) },
    approval: { request: async (request) => { approvalCalls.push(request); return approvalOutcome } },
  }, resolved(config))
  const exec = { agent: { session: { header: { cwd: WS } } }, callId: 'test-call', signal: undefined }
  return { value: await registered.execute(args, exec), approvalCalls }
}

test('a real run reports exit 0 and satisfies the declared schema', { skip: containerSkip }, async () => {
  const { value } = await execute({ allowImages: [IMAGE] }, { image: IMAGE, command: 'echo hello' })
  assert.equal(value.exitCode, 0)
  assert.match(value.stdout, /hello/)
  assert.deepEqual(validateJsonSchemaValue(enforcedOutput({ allowImages: [IMAGE] }), value, 'value'), [])
})

test('a timed-out run stays schema-valid instead of failing the call', { skip: containerSkip }, async () => {
  const config = { timeoutMs: 500, allowImages: [IMAGE] }
  const { value } = await execute(config, { image: IMAGE, command: 'sleep 30' })
  assert.equal(value.timedOut, true)
  assert.equal(value.exitCode, null)
  assert.deepEqual(validateJsonSchemaValue(enforcedOutput(config), value, 'value'), [], 'the timeout report must survive validation')
})

test('a run needs no approval by default', { skip: containerSkip }, async () => {
  const { value, approvalCalls } = await execute({ allowImages: [IMAGE] }, { image: IMAGE, command: 'echo unapproved' })
  assert.equal(value.exitCode, 0)
  assert.deepEqual(approvalCalls, [], 'the default deployment must not ask a human')
})

test('requireApproval: true asks once and runs on a one-shot grant', { skip: containerSkip }, async () => {
  const config = { allowImages: [IMAGE], requireApproval: true }
  const { value, approvalCalls } = await execute(config, { image: IMAGE, command: 'echo approved' }, 'allowed-once')
  assert.equal(value.exitCode, 0)
  assert.equal(approvalCalls.length, 1)
  assert.equal(approvalCalls[0].toolName, 'apptainer_run')
})

test('requireApproval: true refuses to run when the request is denied', { skip: containerSkip }, async () => {
  const config = { allowImages: [IMAGE], requireApproval: true }
  await assert.rejects(
    execute(config, { image: IMAGE, command: 'echo denied' }, 'rejected'),
    /did not approve this container run \(rejected\)/,
  )
})

test('requireApproval is off unless a deployment asks for it', () => {
  assert.equal(new Config({}).requireApproval.get(), false)
  assert.equal(new Config({ requireApproval: true }).requireApproval.get(), true)
})

// --- the settings page contract ---------------------------------------------
// The Host builds a plugin's settings form from its VOLATILE fields only, and
// leaves a config with none out of `settings.describe()` entirely. A namespace
// the Host does not serve never reaches the browser half, so `whileServed` never
// fires and the row shows no Configure control at all. Every field the page
// edits must therefore be volatile.

/** The serialized schema node for one root field, following the uid indirection. */
const fieldNode = (name) => {
  const json = Config.toJSON()
  const root = json.refs[String(json.uid)]
  const entry = root.dict[name]
  return typeof entry === 'number' ? json.refs[String(entry)] : entry
}

test('every field the settings page edits is volatile', () => {
  for (const name of ['apptainerPath', 'allowImages', 'requireApproval', 'allowFakeroot', 'timeoutMs', 'maxOutputBytes', 'permissions']) {
    assert.equal(fieldNode(name).meta?.volatile, true, `${name} must be volatile or the namespace is never served`)
  }
})

test('the permissions schema rejects a mount decision the plugin cannot read', () => {
  // The Host validates a write against this schema, so a bad value is refused on
  // the settings page instead of failing plugin load on the next restart.
  for (const accepted of [{ '*': 'ro' }, { '/srv/data': true }, { '/srv/data': false }, { '/data': null }, {}]) {
    assert.doesNotThrow(() => new Config({ permissions: accepted }), `${JSON.stringify(accepted)} must be accepted`)
  }
  for (const rejected of [{ '/data': 'rw' }, { '/data': 'true' }, 'nope', 42]) {
    assert.throws(() => new Config({ permissions: rejected }), `${JSON.stringify(rejected)} must be rejected`)
  }
})

test('a permissions override merges over the deployment defaults', () => {
  const merged = mergePermissions(new Config({ permissions: { '/srv/data': true } }).permissions.get())
  assert.deepEqual(merged, { '*': false, '/home': false, '/tmp': true, '/srv/data': true })
})
