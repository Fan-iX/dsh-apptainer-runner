// GENERATED from src/index.ts by `npm run build` — edit the source, not this file.
// apptainer_run — run an Apptainer/Singularity image with a boundary equivalent to
// `workspace-write`, without switching the session to `danger-full-access`.
//
// Apptainer cannot start inside the DSH file sandbox: its `starter` needs an
// unprivileged user namespace and a mount-propagation call, and the Landlock
// launcher DSH wraps around every command denies both. The DSH host process is not
// wrapped by that launcher, so this plugin spawns Apptainer there instead, and the
// boundary comes from the argv built below: host `$HOME`, `/tmp` and `/etc` are
// hidden, only the session workspace is writable, and every other host path is
// opt-in through the `permissions` table.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
                                                            
import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'

/** How one host path may be mounted into the container. */
                                                

/** Path-keyed mount policy; `*` is the fallback for a path no key mentions. */
                                                            

// Every editable field is volatile: the Host builds a plugin's settings page from
// its volatile fields only — a config with none is left out of
// `settings.describe()` entirely, so the browser half would never see the
// namespace — and it refuses writes below a non-volatile node.

                         
                                                                                 
                                             
                                                                                      
                                                                          
                                                                              
                                 
     
                                                                                
                                                                              
                                                           
     
                                    
                                                   
                                  
                                                       
                             
                                          
                                  
 

export const Config = Schema.object({
  apptainerPath: Schema.string().volatile(),
  // A dictionary of the three mount decisions, plus the `null` a bare YAML key
  // produces, which `mergePermissions` reads as "ro". Constraining the values
  // here makes the Host reject a bad one at write time instead of failing plugin
  // load — and taking the tool with it — on the next restart.
  permissions: Schema.dict(Schema.union([
    Schema.const(false), Schema.const(null), Schema.const('ro'), Schema.const(true),
  ])).volatile(),
  allowImages: Schema.array(Schema.string()).default([]).volatile(),
  requireApproval: Schema.boolean().default(false).volatile(),
  allowFakeroot: Schema.boolean().default(false).volatile(),
  timeoutMs: Schema.number().default(300_000).volatile(),
  maxOutputBytes: Schema.number().default(100_000).volatile(),
})

export const name = 'dsh-apptainer-runner'

/**
 * Cordis services this plugin needs; it stays unloaded until they are available.
 * `approval` is declared unconditionally because a deployment may set
 * `requireApproval: true`; every base-backed profile ships the seam.
 */
export const inject = ['tools', 'approval', 'sandboxPolicy']

/** Container path the session workspace is always mounted read-write at. */
const WORKSPACE_MOUNT = '/work'

/** Defaults, merged under `config.permissions` so a deployment states differences. */
const DEFAULT_PERMISSIONS                  = { '*': false, '/home': false, '/tmp': true }

/** One extra mount requested by the model. */
                    
                
                 
 

/** The model-facing arguments, inferred by `defineTool` from `parameters`. */
                   
               
                 
                  
                    
                                                                                 
                                                                                
                               
                    
 

/** Resolve the Apptainer binary, honouring the configured override. */
function resolveApptainer(configured                    )                     {
  if (configured !== undefined) return existsSync(configured) ? configured : undefined
  const found = spawnSync('sh', ['-c', 'command -v apptainer || command -v singularity'], { encoding: 'utf8' })
  const path = found.stdout?.trim()
  return path !== undefined && path.length > 0 ? path : undefined
}

/**
 * Merge the deployment's table over the defaults and validate every value.
 * @param configured - the raw `permissions` config value, if any.
 * @returns the effective, validated table.
 */
export function mergePermissions(configured                                                               )                  {
  const merged                  = { ...DEFAULT_PERMISSIONS }
  for (const [key, raw] of Object.entries(configured ?? {})) {
    if (key !== '*') {
      if (!key.startsWith('/')) throw new Error(`permissions key must be an absolute host path or "*", got ${JSON.stringify(key)}`)
    }
    // A bare key (`/data:`) parses as YAML null, not `undefined`, and means
    // read-only — the one shorthand this table has.
    merged[key] = raw == null ? 'ro' : raw
  }
  for (const [key, value] of Object.entries(merged)) {
    if (value !== false && value !== true && value !== 'ro') {
      throw new Error(`permissions["${key}"] must be false, true or "ro", got ${JSON.stringify(value)}`)
    }
  }
  return merged
}

/**
 * Resolve the permission for one host path: the longest matching key wins, with
 * `*` as the fallback.
 * @param table - a validated permission table.
 * @param path - the absolute host path a bind names.
 * @returns the effective permission.
 */
export function resolvePathPermission(table                 , path        )                 {
  let best                            
  let bestLength = -1
  for (const [key, value] of Object.entries(table)) {
    if (key === '*' || key === '/home' || key === '/tmp') continue
    if ((path === key || path.startsWith(key.endsWith('/') ? key : `${key}/`)) && key.length > bestLength) {
      best = value
      bestLength = key.length
    }
  }
  return best ?? table['*'] ?? false
}

/**
 * Build the complete Apptainer argv.
 *
 * Every boundary rule lives here so the spawned command is auditable in one place.
 * @param options - binary, image, workspace root, permissions and model arguments.
 * @returns the argv to spawn.
 */
export function buildArgv(options   
                   
               
                       
                              
               
 )           {
  const { apptainer, image, workspaceRoot, permissions, args } = options
  const argv = [apptainer, 'exec', '--containall', '--no-home', '--writable-tmpfs']
  // `/home` and `/tmp` select Apptainer's own isolation flags rather than binds.
  if (permissions['/home'] === true) argv.splice(argv.indexOf('--no-home'), 1)
  if (permissions['/tmp'] !== true) argv.push('--no-mount', 'tmp')
  // The one standing read-write grant, at a neutral path so the host workspace path
  // never materializes inside the container.
  argv.push('--bind', `${workspaceRoot}:${WORKSPACE_MOUNT}:rw`)
  for (const bind of args.binds ?? []) {
    const target = bind.target ?? bind.source
    if (!isAbsolute(bind.source)) throw new Error(`bind source must be an absolute path: ${JSON.stringify(bind.source)}`)
    if (!existsSync(bind.source)) throw new Error(`bind source does not exist on the host: ${JSON.stringify(bind.source)}`)
    if (!isAbsolute(target)) throw new Error(`bind target must be an absolute path: ${JSON.stringify(target)}`)
    const permission = bind.source === workspaceRoot ? true : resolvePathPermission(permissions, bind.source)
    if (permission === false) continue
    argv.push('--bind', `${bind.source}:${target}:${permission === true ? 'rw' : 'ro'}`)
  }
  for (const [key, value] of Object.entries(args.env ?? {})) argv.push('--env', `${key}=${String(value)}`)
  if (args.fakeroot === true) argv.push('--fakeroot')
  argv.push('--pwd', args.workdir ?? WORKSPACE_MOUNT, image, '/bin/sh', '-c', args.command)
  return argv
}

/** One run, as `execute` reports it. */
                     
                         
                
                
                   
                   
                    
 

export function apply(ctx         , config        ) {
  // The mount policy is read once per call, like every other volatile field, so a
  // save on the settings page governs the next run without reloading the plugin.
  // Merging here keeps the deployment defaults under whatever the user overrode.
  const permissionsNow = () => mergePermissions(config.permissions.get())

  ctx.tools.register(defineTool({
    name: 'apptainer_run',
    description: [
      'Run a command inside an Apptainer/Singularity image with a workspace-write-equivalent boundary.',
      `The session workspace is mounted read-write at ${WORKSPACE_MOUNT}, which is also the default working directory.`,
      'Every other host path must be requested through binds; the deployment permission table decides whether a source mounts at all, and mounts it read-only unless the table grants write access.',
      'The container never sees the host home directory, /tmp or /etc, and writes outside the bound paths stay in a throwaway overlay.',
      'Use it for containerized builds and tests that the file sandbox cannot run.',
    ].join(' '),
    parameters: {
      image: { type: 'string', required: true, description: 'Absolute path to a container image on the host.' },
      command: { type: 'string', required: true, description: 'Shell command to run inside the container.' },
      workdir: { type: 'string', description: `Absolute working directory inside the container. Defaults to ${WORKSPACE_MOUNT}.` },
      binds: {
        type: 'array',
        description: 'Extra host paths to mount. Whether a source mounts, and whether it is writable, comes from the deployment permission table.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            source: { type: 'string', required: true, description: 'Absolute host path to mount.' },
            target: { type: 'string', description: 'Absolute container path. Defaults to the source path.' },
          },
        },
      },
      env: { type: 'object', additionalProperties: true, description: 'Environment variables to set inside the container, as a string map.' },
      fakeroot: { type: 'boolean', description: 'Run as fake root inside the container. Only when the deployment enables it.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // A killed child reports `null`: the timeout, the caller's abort and a
          // spawn error all leave `exitCode` null, and the pipeline rejects any
          // value its own `output.schema` refuses — which would replace the report
          // explaining the timeout with an opaque "invalid output".
          exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
          stdout: { type: 'string' },
          stderr: { type: 'string' },
          workspace: { type: 'string' },
          timedOut: { type: 'boolean' },
          truncated: { type: 'boolean' },
        },
      },
      render: (_args, value) => {
        const run = value             
        const lines           = []
        if (run.timedOut) lines.push('[apptainer: the run exceeded its time limit and was killed]')
        lines.push(`exit code: ${String(run.exitCode)}`)
        lines.push(`workspace (mounted read-write): ${run.workspace}`)
        if (run.truncated) lines.push('[apptainer: output truncated]')
        if (run.stdout.length > 0) lines.push(`--- stdout ---\n${run.stdout}`)
        if (run.stderr.length > 0) lines.push(`--- stderr ---\n${run.stderr}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args         , exec) {
      const agent = exec.agent
      if (agent === undefined) throw new Error('apptainer_run requires an agent session to resolve the workspace and request approval')
      const cwd = agent.session.header.cwd
      if (cwd === undefined) throw new Error('apptainer_run requires a session with a working directory')
      const workspaceRoot = resolve(ctx.sandboxPolicy.resolve({ session: agent.session }).workspaceRoot)

      // Read every volatile field once, at the start of the operation, so one run
      // sees a single consistent configuration even if the settings page saves
      // while it is in flight.
      const apptainer = resolveApptainer(config.apptainerPath.get())
      if (apptainer === undefined) throw new Error('apptainer_run found no `apptainer` or `singularity` binary on PATH')
      if (!isAbsolute(args.image)) throw new Error(`image must be an absolute path: ${JSON.stringify(args.image)}`)
      if (!existsSync(args.image)) throw new Error(`image does not exist on the host: ${JSON.stringify(args.image)}`)
      const allowImages = config.allowImages.get()
      if (allowImages.length > 0 && !allowImages.includes(args.image)) {
        throw new Error(`image is not in this deployment's allowImages: ${JSON.stringify(args.image)}`)
      }
      const permissions = permissionsNow()
      if (args.fakeroot === true && config.allowFakeroot.get() !== true) {
        throw new Error('apptainer_run: fakeroot is disabled by this deployment; ask the operator to enable allowFakeroot')
      }
      for (const bind of args.binds ?? []) {
        if (!isAbsolute(bind.source) || !existsSync(bind.source)) {
          throw new Error(`bind source must be an existing absolute path: ${JSON.stringify(bind.source)}`)
        }
        if (resolvePathPermission(permissions, bind.source) === false) {
          throw new Error(`bind source is not permitted by this deployment's permission table: ${JSON.stringify(bind.source)}`)
        }
      }

      // Approval is optional and off by default: the boundary is the argv below,
      // which the model cannot widen. A deployment that wants a human confirmation
      // per run sets `requireApproval: true`, and then the grant is one-shot —
      // never remembered across calls.
      if (config.requireApproval.get()) {
        const outcome = await ctx.approval.request({
          agent,
          toolName: 'apptainer_run',
          callId: exec.callId,
          reason: `Run an Apptainer container: ${args.image} — ${args.command}`,
          ...exec.signal === undefined ? {} : { signal: exec.signal },
        })
        if (outcome !== 'allowed-once') {
          throw new Error(`the user did not approve this container run (${outcome}); stop and explain instead of retrying`)
        }
      }
      exec.signal?.throwIfAborted()

      const argv = buildArgv({ apptainer, image: args.image, workspaceRoot, permissions, args })
      const maxOutputBytes = config.maxOutputBytes.get()
      const timeoutMs = config.timeoutMs.get()
      const run            = { exitCode: null, stdout: '', stderr: '', workspace: workspaceRoot, timedOut: false, truncated: false }
      const append = (stream                     , text        )       => {
        const current = run[stream]
        if (current.length >= maxOutputBytes) {
          run.truncated = true
          return
        }
        const room = maxOutputBytes - current.length
        if (text.length > room) run.truncated = true
        run[stream] = current + text.slice(0, room)
      }

      const timeout = AbortSignal.timeout(timeoutMs)
      const signals = exec.signal === undefined ? [timeout] : [timeout, exec.signal]
      const child = spawn(argv[0]          , argv.slice(1), {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: AbortSignal.any(signals),
      })
      child.stdout.on('data', (chunk        ) => append('stdout', chunk.toString('utf8')))
      child.stderr.on('data', (chunk        ) => append('stderr', chunk.toString('utf8')))
      await new Promise      ((settle) => {
        child.on('error', (error                       ) => {
          if (timeout.aborted) run.timedOut = true
          else append('stderr', `apptainer_run: ${error.message}`)
          settle()
        })
        child.on('close', (code) => {
          run.exitCode = code
          if (timeout.aborted) run.timedOut = true
          settle()
        })
      })
      // A non-zero exit is a normal outcome, not a failure: report the canonical
      // value and let `output.render` explain it.
      return run
    },
  }))
}
