import * as cp from 'child_process'
import * as fs from 'fs'
import * as vscode from 'vscode'
import type { LupaConfig } from './config'

/**
 * Mirrors the Lupa list output shape (`lupa list --format json`).
 */
interface ListResult {
  success: boolean
  list: {
    suites: Array<{
      name: string
      groups: Array<{
        title: string
        tests: Array<{ title: string; meta: { fileName?: string } }>
        groups: Array<unknown>
      }>
      tests: Array<{ title: string; meta: { fileName?: string } }>
    }>
  }
}

/**
 * Stable ID helpers — must be consistent between discovery and runner so
 * the runner can look up TestItems by the same key.
 */
export function fileItemId(fileName: string): string {
  return `file:${fileName}`
}

export function groupItemId(fileName: string, groupTitle: string): string {
  return `group:${fileName}::${groupTitle}`
}

export function testItemId(fileName: string, groupTitle: string | undefined, testTitle: string): string {
  return groupTitle ? `test:${fileName}::${groupTitle}::${testTitle}` : `test:${fileName}::::${testTitle}`
}

/**
 * Run `lupa list --format json` and populate the TestController's items.
 * Replaces all existing items on each call.
 */
export async function discoverTests(
  controller: vscode.TestController,
  config: LupaConfig
): Promise<void> {
  const output = await runListCommand(config)
  if (!output) {
    controller.items.replace([])
    return
  }

  let result: ListResult
  try {
    result = JSON.parse(output) as ListResult
  } catch {
    controller.items.replace([])
    return
  }

  if (!result.success || !result.list?.suites) {
    controller.items.replace([])
    return
  }

  const fileItems = new Map<string, vscode.TestItem>()

  for (const suite of result.list.suites) {
    // Collect all tests to find unique file names
    const allTests = [
      ...suite.tests,
      ...suite.groups.flatMap((g) => g.tests),
    ]

    for (const test of allTests) {
      const fileName = test.meta?.fileName
      if (fileName && !fileItems.has(fileName)) {
        fileItems.set(fileName, makeFileItem(controller, fileName))
      }
    }

    // Attach group items to their file items
    for (const group of suite.groups) {
      const firstTest = group.tests[0]
      const fileName = firstTest?.meta?.fileName
      if (!fileName) continue

      let fileItem = fileItems.get(fileName)
      if (!fileItem) {
        fileItem = makeFileItem(controller, fileName)
        fileItems.set(fileName, fileItem)
      }

      const groupItem = makeGroupItem(controller, fileItem, fileName, group.title)

      for (const test of group.tests) {
        makeTestItem(controller, groupItem, fileName, group.title, test.title)
      }
    }

    // Attach top-level (no-group) tests directly to their file items
    for (const test of suite.tests) {
      const fileName = test.meta?.fileName
      if (!fileName) continue

      let fileItem = fileItems.get(fileName)
      if (!fileItem) {
        fileItem = makeFileItem(controller, fileName)
        fileItems.set(fileName, fileItem)
      }

      makeTestItem(controller, fileItem, fileName, undefined, test.title)
    }
  }

  controller.items.replace([...fileItems.values()])
}

function makeFileItem(controller: vscode.TestController, fileName: string): vscode.TestItem {
  const id = fileItemId(fileName)
  const label = fileName.split('/').pop() ?? fileName
  const uri = vscode.Uri.file(fileName)
  const item = controller.createTestItem(id, label, uri)
  return item
}

function makeGroupItem(
  controller: vscode.TestController,
  parent: vscode.TestItem,
  fileName: string,
  groupTitle: string
): vscode.TestItem {
  const id = groupItemId(fileName, groupTitle)
  const item = controller.createTestItem(id, groupTitle, parent.uri)
  parent.children.add(item)
  return item
}

function makeTestItem(
  controller: vscode.TestController,
  parent: vscode.TestItem,
  fileName: string,
  groupTitle: string | undefined,
  testTitle: string
): vscode.TestItem {
  const id = testItemId(fileName, groupTitle, testTitle)
  const item = controller.createTestItem(id, testTitle, parent.uri)
  item.range = findTestRange(fileName, testTitle)
  parent.children.add(item)
  return item
}

/**
 * Scan the file for the test() call matching the given title and return a
 * single-line range so VSCode can place a gutter icon.
 * Returns undefined if the file cannot be read or the title is not found.
 */
function findTestRange(fileName: string, testTitle: string): vscode.Range | undefined {
  let content: string
  try {
    content = fs.readFileSync(fileName, 'utf-8')
  } catch {
    return undefined
  }

  const lines = content.split('\n')
  const escaped = testTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`test\\s*\\(\\s*['"\`]${escaped}['"\`]`)

  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      return new vscode.Range(i, 0, i, lines[i].length)
    }
  }

  return undefined
}

function runListCommand(config: LupaConfig): Promise<string | undefined> {
  return new Promise((resolve) => {
    const args = ['list', '--format', 'json', '--config', config.configPath]
    const proc = cp.spawn(config.binPath, args, { cwd: config.workspaceRoot })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve(undefined)
        return
      }
      // The output may contain ANSI codes or non-JSON preamble from Vite —
      // find the first '{' to isolate the JSON payload.
      const jsonStart = stdout.indexOf('{')
      resolve(jsonStart >= 0 ? stdout.slice(jsonStart) : undefined)
    })

    proc.on('error', () => resolve(undefined))
  })
}
