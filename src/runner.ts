import * as cp from 'child_process'
import * as readline from 'readline'
import * as vscode from 'vscode'
import type { LupaConfig } from './config'
import { testItemId } from './discovery'
import { log, logVerbose } from './logger'

/**
 * Shape of a line emitted by the NDJSON reporter.
 * The final line (runner summary) has no `event` field.
 */
interface NdjsonEvent {
  event?: string
  /** Present on test:end — object with original/expanded title */
  title?: { original: string; expanded: string } | string
  duration?: number
  /** Present on final summary line only */
  hasError?: boolean
  isSkipped?: boolean
  isTodo?: boolean
  errors?: Array<{ phase: string; error: { message?: string; name?: string } }>
  /** Absolute path to the current test file, emitted on test:end */
  filePath?: string
}

/**
 * Execute the tests for the given request and stream results back into the testRun.
 */
export async function runTests(
  request: vscode.TestRunRequest,
  controller: vscode.TestController,
  config: LupaConfig,
  token: vscode.CancellationToken
): Promise<void> {
  const run = controller.createTestRun(request)

  const args = buildArgs(request, controller, config)
  log(`Spawning: ${config.binPath} ${args.join(' ')}`)

  const proc = cp.spawn(config.binPath, args, { cwd: config.workspaceRoot })

  token.onCancellationRequested(() => {
    log('Run cancelled — killing process')
    proc.kill()
    run.end()
  })

  // Mark all queued items as enqueued before the run starts
  enqueueItems(request, controller, run)

  // Track active group across group:start / group:end boundaries
  let currentGroup: string | undefined

  const rl = readline.createInterface({ input: proc.stdout })

  // Also collect stderr so we can log it
  let stderrBuf = ''
  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString()
  })

  rl.on('line', (line) => {
    if (!line.trim()) return
    logVerbose(`NDJSON: ${line}`)

    let event: NdjsonEvent
    try {
      event = JSON.parse(line) as NdjsonEvent
    } catch {
      logVerbose(`  (non-JSON line, skipping)`)
      return
    }

    if (event.event === 'group:start') {
      currentGroup = titleString(event.title)
      logVerbose(`  group:start → "${currentGroup}"`)
      return
    }

    if (event.event === 'group:end') {
      logVerbose(`  group:end → "${currentGroup}"`)
      currentGroup = undefined
      return
    }

    if (event.event === 'test:start') {
      const title = titleString(event.title)
      const filePath = event.filePath
      logVerbose(`  test:start title="${title}" file="${filePath}" group="${currentGroup}"`)
      const item = resolveTestItem(controller, filePath, currentGroup, title)
      if (item) {
        run.started(item)
      } else {
        log(`WARNING: no TestItem found for test:start (id=${testItemId(filePath ?? '', currentGroup, title ?? '')})`)
      }
      return
    }

    if (event.event === 'test:end') {
      const title = titleString(event.title)
      // filePath comes from the test:end line itself — this is the authoritative source
      const filePath = event.filePath
      const errors = event.errors ?? []
      const hasError = errors.length > 0
      logVerbose(`  test:end title="${title}" file="${filePath}" group="${currentGroup}" hasError=${hasError}`)

      const item = resolveTestItem(controller, filePath, currentGroup, title)
      if (!item) {
        log(`WARNING: no TestItem found for test:end (id=${testItemId(filePath ?? '', currentGroup, title ?? '')})`)
        return
      }

      const duration = event.duration ?? 0

      if (event.isSkipped || event.isTodo) {
        run.skipped(item)
        return
      }

      if (hasError) {
        const msg = errors[0].error.message ?? 'Test failed'
        run.failed(item, new vscode.TestMessage(msg), duration)
      } else {
        run.passed(item, duration)
      }
      return
    }

    // Final summary line — no `event` field, has `aggregates` or `hasError`
    if (!event.event && 'hasError' in event) {
      log(`  runner summary hasError=${event.hasError}`)
      run.end()
    }
  })

  rl.on('close', () => {
    if (stderrBuf.trim()) {
      log(`stderr:\n${stderrBuf}`)
    }
    log('Process stdout closed — ending run')
    run.end()
  })

  proc.on('error', (err) => {
    log(`Process error: ${err.message}`)
    run.end()
  })

  await new Promise<void>((resolve) => {
    proc.on('close', (code) => {
      log(`Process exited with code ${code}`)
      resolve()
    })
  })
}

/**
 * Normalise a title field that may be a string or {original, expanded} object.
 */
export function titleString(title: NdjsonEvent['title']): string | undefined {
  if (!title) return undefined
  if (typeof title === 'string') return title
  return title.original
}

/**
 * Build the CLI arguments for a given run request.
 */
export function buildArgs(
  request: vscode.TestRunRequest,
  controller: vscode.TestController,
  config: LupaConfig
): string[] {
  const base = ['test', '--config', config.configPath, '--reporters', 'ndjson']

  if (!request.include || request.include.length === 0) {
    return base
  }

  const firstItem = request.include[0]
  const level = detectLevel(firstItem)
  log(`buildArgs: level="${level}" items=${request.include.length}`)

  if (level === 'file') {
    const files = request.include.map((item) => item.uri!.fsPath)
    return [...base, ...files.flatMap((f) => ['--files', f])]
  }

  if (level === 'group') {
    const fileItem = firstItem.parent!
    const file = fileItem.uri!.fsPath
    const groups = request.include.map((item) => item.label)
    return [...base, '--files', file, ...groups.flatMap((g) => ['--groups', g])]
  }

  if (level === 'test') {
    const fileItem = resolveFileAncestor(firstItem)
    const file = fileItem?.uri?.fsPath
    if (!file) return base

    const groupItem = firstItem.parent?.parent ? firstItem.parent : undefined
    const groupName = groupItem && detectLevel(groupItem) === 'group' ? groupItem.label : undefined
    const tests = request.include.map((item) => item.label)

    const args = [...base, '--files', file]
    if (groupName) args.push('--groups', groupName)
    args.push(...tests.flatMap((t) => ['--tests', t]))
    return args
  }

  return base
}

export type ItemLevel = 'file' | 'group' | 'test'

export function detectLevel(item: vscode.TestItem): ItemLevel {
  if (!item.parent) return 'file'
  if (!item.parent.parent) {
    if (item.children.size > 0) return 'group'
    return 'test'
  }
  return 'test'
}

export function resolveFileAncestor(item: vscode.TestItem): vscode.TestItem | undefined {
  let current: vscode.TestItem | undefined = item
  while (current) {
    if (!current.parent) return current
    current = current.parent
  }
  return undefined
}

export function resolveTestItem(
  controller: vscode.TestController,
  filePath: string | undefined,
  groupTitle: string | undefined,
  testTitle: string | undefined
): vscode.TestItem | undefined {
  if (!filePath || !testTitle) return undefined

  const id = testItemId(filePath, groupTitle, testTitle)
  return findById(controller.items, id)
}

export function findById(
  collection: vscode.TestItemCollection,
  id: string
): vscode.TestItem | undefined {
  let found: vscode.TestItem | undefined
  collection.forEach((item) => {
    if (found) return
    if (item.id === id) {
      found = item
      return
    }
    found = findById(item.children, id)
  })
  return found
}

export function enqueueItems(
  request: vscode.TestRunRequest,
  controller: vscode.TestController,
  run: vscode.TestRun
): void {
  if (request.include) {
    request.include.forEach((item) => enqueueRecursive(item, run))
  } else {
    controller.items.forEach((item) => enqueueRecursive(item, run))
  }
}

export function enqueueRecursive(item: vscode.TestItem, run: vscode.TestRun): void {
  run.enqueued(item)
  item.children.forEach((child) => enqueueRecursive(child, run))
}
