# dsh-apptainer-runner

Run containerized builds and tests from a DeepSeek Harness session **without leaving
`workspace-write`**.

Apptainer cannot start inside the DSH file sandbox: its `starter` needs an
unprivileged user namespace and a mount-propagation call, and the Landlock launcher
DSH wraps around every command denies both. This plugin adds an `apptainer_run` tool
that spawns Apptainer from the unsandboxed host process instead, and builds the
boundary out of its own argv.

## What it does

| | |
| --- | --- |
| Runs | any Apptainer/Singularity image, as `apptainer exec … /bin/sh -c <command>` |
| Gives it | the session workspace, read-write, mounted at the neutral `/work` |
| Keeps out | host home, `/tmp` and `/etc`; writes outside the bounds land in a throwaway overlay |
| Adds on request | host paths from a permission table, read-only unless the table says otherwise |
| Asks first | nothing by default; `requireApproval: true` restores a one-shot prompt per run |
| Configured by | profile YAML, or the plugin's page in the Web GUI |

The container is built with `--containall --no-home --writable-tmpfs`, one
read-write bind for `/work`, and whatever else `permissions` grants.

Requires Apptainer or Singularity on the host. Carries no dependencies of its own.

## Install

```sh
dsh plugin --profile web add github:Fan-iX/dsh-apptainer-runner
```

That is the whole install. Nothing runs at install time, so no pnpm `allowBuilds`
approval is needed.

Working on a checkout instead — edits then take effect without reinstalling:

```sh
git clone https://github.com/Fan-iX/dsh-apptainer-runner.git
cd dsh-apptainer-runner
npm run setup
dsh plugin --profile web add link:../dsh-apptainer-runner
```

## Use

```js
apptainer_run({
  image: '/images/alpine.sif',        // absolute path to a .sif
  command: 'make test',               // runs as /bin/sh -c
  binds: [{ source: '/mnt/d', target: '/data' }],   // only if permissions grants it
  workdir: '/work',
})
// -> { exitCode, stdout, stderr, workspace, timedOut, truncated }
```

A bind is mounted only when the permission table grants its source; the table also
decides read-only versus read-write. Everything else about the run is fixed by the
plugin.

## Configuration

| Field | Default | Meaning |
| --- | --- | --- |
| `permissions` | see below | Path-keyed mount policy. |
| `allowImages` | `[]` | Images a run may name; empty allows any existing absolute path. |
| `requireApproval` | `false` | Ask a human before each run. |
| `allowFakeroot` | `false` | Permit `fakeroot: true`. |
| `apptainerPath` | `PATH` | Absolute path to the Apptainer binary. |
| `timeoutMs` | `300000` | Wall-clock limit for one run. |
| `maxOutputBytes` | `100000` | Character cap on captured output. |

### Mount permissions

A bind's source is matched by its **longest** matching key, with `"*"` as the
fallback. Values are `false` (not mounted), `"ro"`, or `true`; a key written bare
(`/srv/data:`) means `"ro"`. Defaults are `{ "*": false, "/home": false, "/tmp":
true }`, merged under your table, so a deployment states only its differences.

```yaml
- id: apptainer-runner
  name: dsh-apptainer-runner
  config:
    permissions:
      "*": "ro"          # mount anything requested read-only
      /srv/data: true    # ...except this, read-write
    allowImages:
      - /images/alpine.sif
```

`/home` and `/tmp` are reserved: they select Apptainer's isolation flags rather than
binds. `true` for `/home` omits `--no-home`; `false` or `"ro"` for `/tmp` passes
`--no-mount tmp`.

> **A read-only grant reaches the source, not the mounts nested under it.**
> `--bind` is recursive, so a mount point *inside* a read-only source arrives with
> its own flags and may still be writable — granting `/mnt: ro` on a host where
> `/mnt/wsl` is a separate mount leaves that mount writable. Grant leaf paths instead
> (`/mnt/d: ro`), and audit a grant before trusting it:
>
> ```sh
> awk -v src=/mnt '$2 ~ "^" src "/" {print $2, $3, $4}' /proc/mounts
> ```

### Approval

Runs need no approval by default, because the model cannot widen the argv: binds are
gated by `permissions`, `fakeroot` by `allowFakeroot`, and everything outside the
bound paths stays in a throwaway overlay. `requireApproval: true` asks a human
before each spawn, and the grant is one-shot — never remembered across calls.

With approval off, `allowImages` is the one model-chosen input that still selects
what code runs: an empty list accepts **any existing absolute image path**, so pin it
to the images you trust.

## Settings in the Web GUI

**Settings → Plugins → `dsh-apptainer-runner`** edits the same values: switches for
the booleans, text and number fields, and an addable key/dropdown list for
`permissions`. A save is written to the profile patch and applies to the next run
without reloading the plugin. `permissions` values are constrained by the plugin's
schema, so the Host refuses an unreadable one such as `"rw"` at write time rather
than failing plugin load later.

## Development

```sh
npm run setup
npm test        # 48 tests
DSH_APPTAINER_TEST_IMAGE=/abs/path/alpine.sif npm test   # + 5 real-container runs
```

`src/index.ts` is the source; `npm run build` emits `lib/index.js` and that file is
committed, because Node refuses to strip TypeScript types under `node_modules` and
every install path except `link:` copies the package there. `npm test` fails if the
two drift apart, and the container tests skip themselves with the real reason when
Apptainer cannot create a user namespace here. If DSH is not installed at
`/opt/dsh-hub`, pass it to the setup script: `node scripts/link-sdk.mjs <dsh-dir>`.

## Notes

- **Enable it in exactly one layer.** Two enabled rows for the same tool abort
  startup with `tool "apptainer_run" is already registered`.
- **No dependencies.** DSH resolves `@deepseek-ai/*` from the running harness for a
  copied plugin, so pinning a second copy from the registry would only invent version
  drift.
- **The browser half is hand-written.** The tsdown client preset is not published, so
  `client/index.js` is written directly in the runtime's dynamic-bundle format.
- **The launcher itself runs unsandboxed** in the DSH host process. That is
  unavoidable, and the plugin does not claim otherwise.
