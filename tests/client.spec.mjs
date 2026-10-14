// Tests for the browser half: the `dsh.client` manifest the client module system
// reads, the dynamic bundle's registration id and exports, and the controls its
// configuration page renders. Pure — no browser, no DOM, and no settings service.
//
// The page is exercised by mounting it against stub services and expanding the
// element tree the way the renderer would, so a control change is observable as
// the draft text the form would save.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const bundlePath = join(root, 'client', 'index.js')
const source = readFileSync(bundlePath, 'utf8')

/** The shell's baseline module table; a dynamic bundle may require nothing else. */
const BASELINE_EXTERNALS = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
])

// --- the manifest and the bundle artifact -----------------------------------

test('the manifest declares a web client half with a ./client bundle', () => {
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'].default, './client/index.js')
  assert.equal(pkg.exports['.'].default, './lib/index.js', 'the host half must resolve to the built entry')
  assert.equal(pkg.main, './lib/index.js')
  assert.ok(pkg.files.includes('lib'), 'the published payload must carry the host half')
  assert.ok(pkg.files.includes('client'), 'the published payload must carry the browser half')
})

test('the bundle requires only baseline externals, with no relative require', () => {
  const specifiers = [...source.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map(match => match[1])
  assert.ok(specifiers.length > 0, 'the bundle must require the modules it uses')
  for (const specifier of specifiers) {
    assert.ok(!specifier.startsWith('.'), `relative require is unsupported by the runtime: ${specifier}`)
    assert.ok(BASELINE_EXTERNALS.has(specifier), `not a baseline external: ${specifier}`)
  }
})

test('the bundle carries no JSX syntax, which nothing would compile', () => {
  // Strip comments and string literals, then look for an element-like `<Tag`.
  const scrubbed = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  assert.doesNotMatch(scrubbed, /<[A-Za-z][A-Za-z0-9._]*[\s/>]/)
})

// --- mounting the page against stub services --------------------------------

/** The form model the last `apply` built, so a test can seed the field states. */
const mounted = { model: undefined }

/** Baseline primitives the bundle may require, with the controls as leaves. */
const primitives = {
  SettingsForm: 'SettingsForm',
  SettingsValueField: 'SettingsValueField',
  Switch: 'Switch',
  settingsTextField: field => ({ field }),
  settingsNumberField: field => ({ field }),
  SettingsFormModel: class {
    constructor(scope, specs) {
      this.scope = scope
      this.specs = specs
      this.fields = {}
      this.edits = []
      mounted.model = this
    }
    shell() { return { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false } }
    field(name) { return this.fields[name] ?? { text: '', overridden: false, invalid: false } }
    bind(project) { this.project = project; return { getSnapshot: () => project() } }
    actions() {
      return {
        edit: (name, text) => { this.edits.push([name, text]); this.fields[name] = { text, overridden: true, invalid: false } },
        resetField: () => {}, save: () => {}, discard: () => {},
      }
    }
    dispose() {}
  },
}

const stubRequire = (specifier) => {
  if (specifier === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' }
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`the bundle required an undeclared external: ${specifier}`)
}

// The bundle registers itself on load, so capture that once for every test here.
let registration
globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value } } }
await import(pathToFileURL(bundlePath).href)

/** Mount the browser half against stub services and return its slot entries. */
const mount = () => {
  const registrations = []
  const ctx = {
    locale: { bind: () => (key) => key, register: () => () => {} },
    effect: (fn) => { fn(); return () => {} },
    configForms: {
      get: () => ({ subscribe: () => () => {} }),
      whileServed: (namespaces, register) => register(new Set(namespaces)),
    },
    slots: {
      inject: (_name, contribution) => contribution(),
      register: (options, component) => { registrations.push({ options, component }); return () => {} },
    },
  }
  registration.factory(stubRequire).apply(ctx)
  return registrations
}

/** Expand the function components in a stub element tree, as the renderer would. */
const expand = (node) => {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(expand)
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return { type: node.type, props: { ...node.props, children: expand(node.props.children) } }
}

/** Render the registered card for one view, with the form's injected face. */
const render = (entry, view = 'page') => {
  const injected = entry.options.inject()
  const props = {
    view,
    t: (key) => key,
    useApptainerSettings: (select) => select(injected.hooks.apptainerSettings.getSnapshot()),
    ...injected,
  }
  return { tree: expand(entry.component(props)), injected }
}

/** Every node in an expanded tree whose type matches. */
const findAll = (node, type, found = []) => {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (Array.isArray(node)) { node.forEach(child => { findAll(child, type, found) }); return found }
  if (node.type === type) found.push(node)
  findAll(node.props?.children, type, found)
  return found
}

// --- the registered entries and their controls ------------------------------

test('the bundle registers the plugin id and exports apply and inject', () => {
  assert.equal(registration.id, 'dsh-apptainer-runner')
  const exported = registration.factory(stubRequire)
  assert.equal(typeof exported.apply, 'function')
  assert.deepEqual(exported.inject, ['slots', 'locale', 'configForms'])
})

test('the page registers both the bundle entry and the row entry', () => {
  const registrations = mount()
  assert.deepEqual(registrations.map(entry => entry.options.name), ['plugins.bundle.config', 'plugins.row.config'])
  assert.deepEqual(registrations.map(entry => entry.options.key), ['dsh-apptainer-runner', 'dsh-apptainer-runner#apptainer-runner'])
})

test('a summary view renders the one-liner, not the form', () => {
  const [entry] = mount()
  assert.equal(render(entry, 'summary').tree, 'description')
})

test('the booleans render as switches reflecting the effective value', () => {
  const [entry] = mount()
  mounted.model.fields.requireApproval = { text: 'true', overridden: false, invalid: false }
  mounted.model.fields.allowFakeroot = { text: 'false', overridden: false, invalid: false }
  const switches = findAll(render(entry).tree, 'Switch')
  assert.equal(switches.length, 2)
  assert.equal(switches[0].props.checked, true)
  assert.equal(switches[1].props.checked, false)
  assert.equal(typeof switches[0].props.onChange, 'function', 'a switch must report its next state')
})

test('flipping a boolean stages the matching draft text', () => {
  const [entry] = mount()
  const switches = findAll(render(entry).tree, 'Switch')
  switches[1].props.onChange(true)
  assert.deepEqual(mounted.model.edits.at(-1), ['allowFakeroot', 'true'])
  switches[1].props.onChange(false)
  assert.deepEqual(mounted.model.edits.at(-1), ['allowFakeroot', 'false'])
})

test('the permission list renders one key input and dropdown per entry', () => {
  const [entry] = mount()
  mounted.model.fields.permissions = { text: JSON.stringify({ '*': 'ro', '/srv/data': true }), overridden: false, invalid: false }
  const tree = render(entry).tree
  const rows = findAll(tree, 'select')
  assert.equal(rows.length, 2, 'one dropdown per row')
  assert.deepEqual(rows.map(row => row.props.value), ['ro', 'true'])
  const keyInputs = findAll(tree, 'input')
  assert.deepEqual(keyInputs.map(input => input.props.value), ['*', '/srv/data'])
  // Every dropdown offers exactly the three mount decisions the Host accepts.
  assert.deepEqual(rows[0].props.children.map(option => option.props.value), ['true', 'ro', 'false'])
})

test('editing a permission row stages the whole table as JSON', () => {
  const [entry] = mount()
  mounted.model.fields.permissions = { text: JSON.stringify({ '/srv/data': false }), overridden: false, invalid: false }
  const tree = render(entry).tree
  findAll(tree, 'select')[0].props.onChange({ target: { value: 'ro' } })
  const [field, text] = mounted.model.edits.at(-1)
  assert.equal(field, 'permissions')
  assert.deepEqual(JSON.parse(text), { '/srv/data': 'ro' })
})

test('adding a permission row starts an empty key that the dropdown can set', () => {
  const [entry] = mount()
  const tree = render(entry).tree
  const add = findAll(tree, 'button').find(button => button.props.children === 'permissionsAdd')
  assert.ok(add !== undefined, 'the list must offer an add control')
  add.props.onClick()
  const [field, text] = mounted.model.edits.at(-1)
  assert.equal(field, 'permissions')
  assert.deepEqual(JSON.parse(text), { '': false })
})

test('removing the last permission row clears the field instead of writing {}', () => {
  const [entry] = mount()
  mounted.model.fields.permissions = { text: JSON.stringify({ '/srv/data': true }), overridden: false, invalid: false }
  const tree = render(entry).tree
  const remove = findAll(tree, 'button').find(button => button.props.children === 'permissionsRemove')
  assert.ok(remove !== undefined, 'the list must offer a remove control')
  remove.props.onClick()
  assert.deepEqual(mounted.model.edits.at(-1), ['permissions', ''], 'an empty draft re-inherits the defaults')
})

test('a read-only deployment disables every control', () => {
  const [entry] = mount()
  mounted.model.shell = () => ({ available: true, writable: false, dirty: false, invalid: false, saving: false, failed: false })
  const tree = render(entry).tree
  assert.ok(findAll(tree, 'Switch').every(node => node.props.disabled === true))
  assert.ok(findAll(tree, 'select').every(node => node.props.disabled === true))
  assert.ok(findAll(tree, 'input').every(node => node.props.disabled === true))
})
