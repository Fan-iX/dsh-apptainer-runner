// Browser half of dsh-apptainer-runner: the configuration page its bundle and its
// row open on the Plugins page (Settings → Plugins → `dsh-apptainer-runner`).
//
// Hand-written rather than built: this plugin's whole design is that DSH loads
// its source directly, and the `clientBundle` tsdown preset the workspace client
// packages use is not part of the published SDK. The registration below is the
// runtime's dynamic-bundle format (`window.__ModuleLoader__.load`), consumed by
// `@deepseek-ai/dsh-client-modules`. Only the shell's baseline module table may
// be required, and there is no JSX because nothing compiles it.
//
// Every edit goes through `SettingsFormModel`: this module stages draft text per
// field and the form's save is the single point where a draft becomes a document
// mutation. The controls are therefore free to be whatever suits the value — a
// switch, a dropdown, a row list — as long as each reports its draft as text
// through its field's `format`/`parse` pair.
window.__ModuleLoader__.load({
  id: 'dsh-apptainer-runner',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var jsxRuntime = require('react/jsx-runtime')
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    var jsx = jsxRuntime.jsx
    var jsxs = jsxRuntime.jsxs

    /** Dictionary namespace owned by this browser half. */
    var NS = 'settings.apptainerRunner'

    /** Loader entry id whose settings namespace this page edits. */
    var ENTRY_ID = 'apptainer-runner'

    /** The package the bundle-level configuration entry is keyed by. */
    var PACKAGE_NAME = 'dsh-apptainer-runner'

    /** The editable fields, in the order the page renders them. */
    var FIELD_NAMES = [
      'apptainerPath', 'allowImages', 'timeoutMs', 'maxOutputBytes',
      'requireApproval', 'allowFakeroot', 'permissions',
    ]

    /** The mount decisions a permission row offers, in dropdown order. */
    var PERMISSION_CHOICES = ['true', 'ro', 'false']

    /** English copy. */
    var en = {
      description: 'Run containerized builds and tests through Apptainer with a workspace-write-equivalent boundary.',
      apptainerPath: 'Apptainer binary',
      apptainerPathHint: 'Absolute path to the apptainer or singularity binary. Leave blank to resolve it from PATH.',
      allowImages: 'Allowed images',
      allowImagesHint: 'Comma-separated absolute .sif paths a run may name. Leave blank to allow any existing absolute image path.',
      timeoutMs: 'Run timeout (ms)',
      timeoutMsHint: 'Wall-clock limit for one run. Leave blank for the default 300000.',
      maxOutputBytes: 'Output cap (characters)',
      maxOutputBytesHint: 'Character cap on each captured stream. Leave blank for the default 100000.',
      requireApproval: 'Require approval',
      requireApprovalHint: 'On asks a human before every run. Off (default) runs without a prompt, because the profile fixes the mount policy.',
      allowFakeroot: 'Allow fakeroot',
      allowFakerootHint: 'On lets the model pass fakeroot: true. Off (default) refuses it.',
      permissions: 'Path permissions',
      permissionsHint: 'One row per host path. A path is mounted only when the longest matching key grants it — `*` covers every path no other row mentions, while `/home` and `/tmp` select Apptainer isolation flags instead of binds. The built-in defaults (`*`: false, `/home`: false, `/tmp`: true) stay underneath these rows. A repeated key keeps its last row.',
      permissionsKeyLabel: 'Host path',
      permissionsKeyPlaceholder: '/srv/data',
      permissionsValueLabel: 'Access',
      permissionsAdd: 'Add a path',
      permissionsRemove: 'Remove',
      permissionTrue: 'true — read-write',
      permissionReadOnly: 'ro — read-only',
      permissionFalse: 'false — not mounted',
      permissionsInvalid: 'Each key must be `*` or an absolute path starting with /, and each value must be true, ro or false.',
      overridden: 'Overridden',
      reset: 'Reset to default',
      invalidValue: 'Enter a value this field accepts, or leave blank to use the default.',
      readOnly: 'This deployment stores settings read-only.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
    }

    /** Simplified Chinese copy. */
    var zh = {
      description: '通过 Apptainer 运行容器化的构建与测试，边界等价于 workspace-write。',
      apptainerPath: 'Apptainer 可执行文件',
      apptainerPathHint: 'apptainer 或 singularity 可执行文件的绝对路径；留空表示从 PATH 中解析。',
      allowImages: '允许的镜像',
      allowImagesHint: '允许运行的绝对 .sif 路径，用逗号分隔；留空表示允许任何已存在的绝对镜像路径。',
      timeoutMs: '运行超时（毫秒）',
      timeoutMsHint: '单次运行的墙钟上限；留空使用默认值 300000。',
      maxOutputBytes: '输出上限（字符）',
      maxOutputBytesHint: '每个输出流捕获的字符上限；留空使用默认值 100000。',
      requireApproval: '需要审批',
      requireApprovalHint: '开启后每次运行前询问人工；关闭（默认）不询问，因为挂载策略由配置文件固定。',
      allowFakeroot: '允许 fakeroot',
      allowFakerootHint: '开启后允许模型传入 fakeroot: true；关闭（默认）拒绝。',
      permissions: '路径权限',
      permissionsHint: '每个宿主路径一行。只有当匹配该路径的最长键授予权限时才会挂载——`*` 覆盖所有未被其他行提到的路径，`/home` 和 `/tmp` 用于选择 Apptainer 的隔离参数而不是挂载。这些行之下仍然保留内置默认值（`*`: false、`/home`: false、`/tmp`: true）。键重复时以最后一行为准。',
      permissionsKeyLabel: '宿主路径',
      permissionsKeyPlaceholder: '/srv/data',
      permissionsValueLabel: '访问权限',
      permissionsAdd: '添加路径',
      permissionsRemove: '删除',
      permissionTrue: 'true —— 读写',
      permissionReadOnly: 'ro —— 只读',
      permissionFalse: 'false —— 不挂载',
      permissionsInvalid: '键必须是 `*` 或以 / 开头的绝对路径，值必须是 true、ro 或 false。',
      overridden: '已覆盖',
      reset: '恢复默认',
      invalidValue: '请输入该字段接受的值；留空表示使用默认值。',
      readOnly: '本部署的设置为只读。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
    }

    /** Layout for a field whose control is not the text-input primitive. */
    var FRAME_STYLE = { marginBottom: '14px' }
    var LABEL_STYLE = { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }
    var LABEL_TEXT_STYLE = { fontWeight: 500 }
    var BADGE_STYLE = { fontSize: '0.75em', opacity: 0.75, border: '1px solid currentColor', borderRadius: '4px', padding: '0 4px' }
    var HINT_STYLE = { margin: '6px 0 0', opacity: 0.72, fontSize: '0.85em' }
    var LINK_STYLE = { background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0, cursor: 'pointer', textDecoration: 'underline', opacity: 0.8 }
    var ROW_STYLE = { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }
    var KEY_INPUT_STYLE = { flex: '1 1 auto', minWidth: 0 }

    /**
     * A whole-boolean field. Only `true` and `false` are values this field
     * accepts, so anything else blocks the save instead of writing a string where
     * the config schema requires a boolean. An empty draft clears the override and
     * re-inherits the schema default.
     * @param field - field name inside the namespace section.
     * @returns the field's conversion spec.
     */
    function settingsBooleanField(field) {
      return {
        field,
        format: value => typeof value === 'boolean' ? String(value) : '',
        parse: (text) => {
          var trimmed = text.trim().toLowerCase()
          if (trimmed === '') return { kind: 'clear' }
          if (trimmed === 'true') return { kind: 'set', value: true }
          if (trimmed === 'false') return { kind: 'set', value: false }
          return undefined
        },
      }
    }

    /**
     * A comma-separated string-array field. Image paths cannot contain a comma, so
     * the separator round-trips every value a run may name. An empty draft clears
     * the field, which re-inherits the documented `[]` default.
     * @param field - field name inside the namespace section.
     * @returns the field's conversion spec.
     */
    function settingsListField(field) {
      return {
        field,
        format: value => Array.isArray(value) ? value.join(', ') : '',
        parse: (text) => {
          var items = text.split(',').map(item => item.trim()).filter(item => item !== '')
          return items.length === 0 ? { kind: 'clear' } : { kind: 'set', value: items }
        },
      }
    }

    /**
     * The path permission table as one staged field. Its draft text is the table's
     * JSON, which the row editor below renders and rewrites; an empty draft clears
     * the field so the built-in defaults show through again. Keys are validated
     * here because the Host's dictionary schema can only constrain the values.
     * @param field - field name inside the namespace section.
     * @returns the field's conversion spec.
     */
    function settingsPermissionsField(field) {
      return {
        field,
        format: value => value === undefined ? '' : JSON.stringify(value),
        parse: (text) => {
          var trimmed = text.trim()
          if (trimmed === '') return { kind: 'clear' }
          var table
          try { table = JSON.parse(trimmed) } catch { return undefined }
          if (typeof table !== 'object' || table === null || Array.isArray(table)) return undefined
          var keys = Object.keys(table)
          for (var index = 0; index < keys.length; index++) {
            var key = keys[index]
            var value = table[key]
            if (key !== '*' && key.charAt(0) !== '/') return undefined
            if (value !== true && value !== false && value !== 'ro' && value !== null) return undefined
          }
          return { kind: 'set', value: table }
        },
      }
    }

    /** The field specs this page stages over the entry's settings section. */
    var FIELDS = [
      primitives.settingsTextField('apptainerPath'),
      settingsListField('allowImages'),
      primitives.settingsNumberField('timeoutMs'),
      primitives.settingsNumberField('maxOutputBytes'),
      settingsBooleanField('requireApproval'),
      settingsBooleanField('allowFakeroot'),
      settingsPermissionsField('permissions'),
    ]

    /**
     * Build the page snapshot: the shared form shell plus one entry per field.
     * @param form - the staged form model over the entry's settings section.
     * @returns the state the card renders.
     */
    function project(form) {
      var state = Object.assign({}, form.shell())
      for (var i = 0; i < FIELD_NAMES.length; i++) state[FIELD_NAMES[i]] = form.field(FIELD_NAMES[i])
      return state
    }

    /**
     * Read the staged permission table as rows. A bare `null` value — what YAML
     * writes for a key with no value — reads as "ro", which is how the Host reads it.
     * @param text - the field's staged draft text.
     * @returns one row per table entry, or none when the draft is not a table.
     */
    function permissionRows(text) {
      var trimmed = text.trim()
      if (trimmed === '') return []
      var table
      try { table = JSON.parse(trimmed) } catch { return [] }
      if (typeof table !== 'object' || table === null || Array.isArray(table)) return []
      return Object.keys(table).map(key => ({
        key,
        value: table[key] === true ? 'true' : table[key] === false ? 'false' : 'ro',
      }))
    }

    /**
     * Write rows back as the field's draft text. Removing the last row yields an
     * empty draft, which the spec reads as a clear back to the deployment defaults.
     * @param rows - the rows the editor holds.
     * @returns the staged draft text.
     */
    function permissionText(rows) {
      if (rows.length === 0) return ''
      var table = {}
      for (var i = 0; i < rows.length; i++) table[rows[i].key] = rows[i].value === 'true' ? true : rows[i].value === 'false' ? false : 'ro'
      return JSON.stringify(table)
    }

    /**
     * The label, override badge, reset control and hint shared by the fields whose
     * control is not the text-input primitive.
     * @param props - copy, the field's state, and the field's own control.
     * @returns the framed field.
     */
    function FieldFrame(props) {
      var marks = [jsx('span', { key: 'label', style: LABEL_TEXT_STYLE, children: props.label })]
      if (props.overridden) {
        marks.push(jsx('span', { key: 'badge', style: BADGE_STYLE, children: props.overriddenLabel }))
        marks.push(jsx('button', {
          key: 'reset', type: 'button', style: LINK_STYLE, disabled: props.disabled,
          onClick: props.onReset, children: props.resetLabel,
        }))
      }
      return jsxs('div', {
        style: FRAME_STYLE,
        children: [
          jsxs('div', { style: LABEL_STYLE, children: marks }),
          props.control,
          jsx('p', { style: HINT_STYLE, children: props.invalid ? props.invalidLabel : props.hint }),
        ],
      })
    }

    /**
     * One boolean field as a switch. The staged text is the switch's state, so what
     * the form saves is exactly what the toggle shows.
     * @param props - copy, the field's state, and the form's edit action.
     * @returns the switch field.
     */
    function SwitchField(props) {
      var state = props.state
      return jsx(FieldFrame, {
        label: props.label,
        hint: props.hint,
        overridden: state.overridden,
        overriddenLabel: props.overriddenLabel,
        resetLabel: props.resetLabel,
        invalid: state.invalid,
        invalidLabel: props.invalidLabel,
        disabled: props.disabled,
        onReset: props.onReset,
        control: jsx(primitives.Switch, {
          checked: state.text === 'true',
          onChange: next => { props.onEdit(next ? 'true' : 'false') },
          label: props.label,
          disabled: props.disabled,
        }),
      })
    }

    /**
     * The path permission table as an addable key/value list: a text input for the
     * host path and a dropdown for the mount decision. Every edit rewrites the
     * field's draft text, so one save writes one table.
     * @param props - copy, the field's state, and the form's edit action.
     * @returns the list field.
     */
    function PermissionsField(props) {
      var state = props.state
      var rows = permissionRows(state.text)
      var disabled = props.disabled
      var commit = next => { props.onEdit(permissionText(next)) }
      var controls = rows.map((row, index) => jsxs('div', {
        key: 'row-' + String(index),
        style: ROW_STYLE,
        children: [
          jsx('input', {
            type: 'text',
            value: row.key,
            disabled,
            style: KEY_INPUT_STYLE,
            'aria-label': props.keyLabel,
            placeholder: props.keyPlaceholder,
            onChange: event => {
              var next = rows.slice()
              next[index] = { key: event.target.value, value: row.value }
              commit(next)
            },
          }),
          jsx('select', {
            value: row.value,
            disabled,
            'aria-label': props.valueLabel,
            onChange: event => {
              var next = rows.slice()
              next[index] = { key: row.key, value: event.target.value }
              commit(next)
            },
            children: PERMISSION_CHOICES.map(choice => jsx('option', {
              key: choice,
              value: choice,
              children: choice === 'true' ? props.trueLabel : choice === 'ro' ? props.readOnlyLabel : props.falseLabel,
            })),
          }),
          jsx('button', {
            type: 'button',
            style: LINK_STYLE,
            disabled,
            onClick: () => { commit(rows.filter((_row, keep) => keep !== index)) },
            children: props.removeLabel,
          }),
        ],
      }))
      controls.push(jsx('button', {
        key: 'add',
        type: 'button',
        style: LINK_STYLE,
        disabled,
        onClick: () => { commit(rows.concat([{ key: '', value: 'false' }])) },
        children: props.addLabel,
      }))
      return jsx(FieldFrame, {
        label: props.label,
        hint: props.hint,
        overridden: state.overridden,
        overriddenLabel: props.overriddenLabel,
        resetLabel: props.resetLabel,
        invalid: state.invalid,
        invalidLabel: props.invalidLabel,
        disabled,
        onReset: props.onReset,
        control: jsxs('div', { children: controls }),
      })
    }

    /**
     * The bundle's or row's configuration entry: its one-liner, or its staged
     * settings form.
     * @param props - the view asked for, the locale reader, the form snapshot, its
     * actions, and the `use<Name>` hook the renderer binds from the hooks compartment.
     * @returns the one-liner, or the form.
     */
    function ApptainerCard(props) {
      var t = props.t
      var state = props.useApptainerSettings(snapshot => snapshot)
      if (props.view === 'summary') return t('description')
      var disabled = !state.writable
      var textField = (name, label, hint, numeric) => jsx(primitives.SettingsValueField, {
        key: name,
        id: 'plugin-config-apptainer-' + name,
        label,
        hint,
        numeric: numeric === true ? true : undefined,
        overriddenLabel: t('overridden'),
        resetLabel: t('reset'),
        invalidLabel: t('invalidValue'),
        disabled,
        ...state[name],
        onEdit: text => { props.edit(name, text) },
        onReset: () => { props.resetField(name) },
      })
      var switchField = (name, label, hint) => jsx(SwitchField, {
        key: name,
        label,
        hint,
        state: state[name],
        overriddenLabel: t('overridden'),
        resetLabel: t('reset'),
        invalidLabel: t('invalidValue'),
        disabled,
        onEdit: text => { props.edit(name, text) },
        onReset: () => { props.resetField(name) },
      })
      return jsxs(primitives.SettingsForm, {
        labels: {
          unavailable: t('unavailable'),
          readOnly: t('readOnly'),
          saveFailed: t('saveFailed'),
          save: t('save'),
          saving: t('saving'),
        },
        state,
        onSave: props.save,
        onDiscard: props.discard,
        children: [
          textField('apptainerPath', t('apptainerPath'), t('apptainerPathHint'), false),
          textField('allowImages', t('allowImages'), t('allowImagesHint'), false),
          textField('timeoutMs', t('timeoutMs'), t('timeoutMsHint'), true),
          textField('maxOutputBytes', t('maxOutputBytes'), t('maxOutputBytesHint'), true),
          switchField('requireApproval', t('requireApproval'), t('requireApprovalHint')),
          switchField('allowFakeroot', t('allowFakeroot'), t('allowFakerootHint')),
          jsx(PermissionsField, {
            key: 'permissions',
            label: t('permissions'),
            hint: t('permissionsHint'),
            state: state.permissions,
            overriddenLabel: t('overridden'),
            resetLabel: t('reset'),
            invalidLabel: t('permissionsInvalid'),
            keyLabel: t('permissionsKeyLabel'),
            keyPlaceholder: t('permissionsKeyPlaceholder'),
            valueLabel: t('permissionsValueLabel'),
            addLabel: t('permissionsAdd'),
            removeLabel: t('permissionsRemove'),
            trueLabel: t('permissionTrue'),
            readOnlyLabel: t('permissionReadOnly'),
            falseLabel: t('permissionFalse'),
            disabled,
            onEdit: text => { props.edit('permissions', text) },
            onReset: () => { props.resetField('permissions') },
          }),
        ],
      })
    }

    /**
     * Mount the configuration page while the Host serves the entry's settings
     * namespace. A deployment that never activated the row serves no such
     * namespace, so it shows no trace of the page.
     *
     * The same form registers twice — on the bundle's own page and on the row's
     * page — so it is reachable from whichever the user opens first. Both slots
     * are keyed and they key differently, so neither registration displaces the
     * other.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      var t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-apptainer-runner: dictionaries')
      var form = new primitives.SettingsFormModel(ctx.configForms.get(ENTRY_ID), FIELDS)
      var store = form.bind(() => project(form))
      ctx.effect(() => () => { form.dispose() }, 'dsh-apptainer-runner: form subscription')
      var face = () => ({ hooks: { apptainerSettings: store }, ...form.actions() })
      ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        locale: NS,
        inject: face,
      }, ApptainerCard))), 'dsh-apptainer-runner: bundle configuration page')
      ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: PACKAGE_NAME + '#' + ENTRY_ID,
        locale: NS,
        inject: face,
      }, ApptainerCard))), 'dsh-apptainer-runner: row configuration page')
    }

    exports.NS = NS
    exports.apply = apply
    exports.inject = ['slots', 'locale', 'configForms']
    return module.exports
  },
})
