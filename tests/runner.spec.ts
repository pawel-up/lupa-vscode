import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'stream'
import * as cp from 'child_process'
import * as vscode from 'vscode'
import {
  buildArgs,
  detectLevel,
  titleString,
  runTests,
} from '../src/runner'
import type { LupaConfig } from '../src/config'

vi.mock('child_process')
vi.mock('../src/logger', () => ({
  log: vi.fn(),
  logVerbose: vi.fn(),
}))

// Helper to create mock test items
function createMockTestItem(id: string, label: string, uriPath?: string, parent?: vscode.TestItem): vscode.TestItem {
  const childrenMap = new Map<string, vscode.TestItem>()
  
  const item = {
    id,
    label,
    uri: uriPath ? vscode.Uri.file(uriPath) : undefined,
    parent,
    children: {
      get size() { return childrenMap.size },
      add: (child: vscode.TestItem) => {
        childrenMap.set(child.id, child)
      },
      get: (id: string) => childrenMap.get(id),
      forEach: (cb: (i: vscode.TestItem) => void) => childrenMap.forEach(cb),
    } as any
  } as vscode.TestItem

  if (parent) {
    parent.children.add(item)
  }

  return item
}

describe('runner.ts', () => {
  const config: LupaConfig = {
    binPath: '/mock/lupa',
    configPath: '/mock/lupa.config.ts',
    workspaceRoot: '/mock',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('titleString', () => {
    it('returns undefined for undefined', () => {
      expect(titleString(undefined)).toBeUndefined()
    })

    it('returns string if title is string', () => {
      expect(titleString('my test')).toBe('my test')
    })

    it('returns original if title is object', () => {
      expect(titleString({ original: 'orig', expanded: 'exp' })).toBe('orig')
    })
  })

  describe('detectLevel', () => {
    it('detects file level', () => {
      const fileItem = createMockTestItem('file1', 'test.ts', '/test.ts')
      expect(detectLevel(fileItem)).toBe('file')
    })

    it('detects group level', () => {
      const fileItem = createMockTestItem('file1', 'test.ts', '/test.ts')
      const groupItem = createMockTestItem('group1', 'My Group', undefined, fileItem)
      groupItem.children.add(createMockTestItem('test1', 'my test')) // has children
      
      expect(detectLevel(groupItem)).toBe('group')
    })

    it('detects test level under file', () => {
      const fileItem = createMockTestItem('file1', 'test.ts', '/test.ts')
      const testItem = createMockTestItem('test1', 'My Test', undefined, fileItem)
      // no children
      expect(detectLevel(testItem)).toBe('test')
    })

    it('detects test level under group', () => {
      const fileItem = createMockTestItem('file1', 'test.ts', '/test.ts')
      const groupItem = createMockTestItem('group1', 'My Group', undefined, fileItem)
      const testItem = createMockTestItem('test1', 'My Test', undefined, groupItem)
      expect(detectLevel(testItem)).toBe('test')
    })
  })

  describe('buildArgs', () => {
    const controller = {} as vscode.TestController

    it('returns base args when no include is specified', () => {
      const request = { include: undefined } as vscode.TestRunRequest
      const args = buildArgs(request, controller, config)
      expect(args).toEqual(['test', '--config', '/mock/lupa.config.ts', '--reporters', 'ndjson'])
    })

    it('builds args for file level', () => {
      const item1 = createMockTestItem('file1', 'test1.ts', '/mock/test1.ts')
      const item2 = createMockTestItem('file2', 'test2.ts', '/mock/test2.ts')
      const request = { include: [item1, item2] } as unknown as vscode.TestRunRequest

      const args = buildArgs(request, controller, config)
      expect(args).toEqual([
        'test', '--config', '/mock/lupa.config.ts', '--reporters', 'ndjson',
        '--files', '/mock/test1.ts',
        '--files', '/mock/test2.ts'
      ])
    })

    it('builds args for group level', () => {
      const fileItem = createMockTestItem('file1', 'test.ts', '/mock/test.ts')
      const groupItem1 = createMockTestItem('group1', 'Group A', undefined, fileItem)
      groupItem1.children.add(createMockTestItem('test1', 'test'))
      const request = { include: [groupItem1] } as unknown as vscode.TestRunRequest

      const args = buildArgs(request, controller, config)
      expect(args).toEqual([
        'test', '--config', '/mock/lupa.config.ts', '--reporters', 'ndjson',
        '--files', '/mock/test.ts',
        '--groups', 'Group A'
      ])
    })

    it('builds args for test level under file', () => {
      const fileItem = createMockTestItem('file1', 'test.ts', '/mock/test.ts')
      const testItem1 = createMockTestItem('test1', 'Test A', undefined, fileItem)
      const testItem2 = createMockTestItem('test2', 'Test B', undefined, fileItem)
      const request = { include: [testItem1, testItem2] } as unknown as vscode.TestRunRequest

      const args = buildArgs(request, controller, config)
      expect(args).toEqual([
        'test', '--config', '/mock/lupa.config.ts', '--reporters', 'ndjson',
        '--files', '/mock/test.ts',
        '--tests', 'Test A',
        '--tests', 'Test B'
      ])
    })

    it('builds args for test level under group', () => {
      const fileItem = createMockTestItem('file1', 'test.ts', '/mock/test.ts')
      const groupItem = createMockTestItem('group1', 'Group A', undefined, fileItem)
      groupItem.children.add(createMockTestItem('t', 't')) // make it detect as group
      const testItem = createMockTestItem('test1', 'Test X', undefined, groupItem)
      const request = { include: [testItem] } as unknown as vscode.TestRunRequest

      const args = buildArgs(request, controller, config)
      expect(args).toEqual([
        'test', '--config', '/mock/lupa.config.ts', '--reporters', 'ndjson',
        '--files', '/mock/test.ts',
        '--groups', 'Group A',
        '--tests', 'Test X'
      ])
    })
  })

  describe('runTests', () => {
    it('parses NDJSON stream and reports results', async () => {
      const mockRun = {
        enqueued: vi.fn(),
        started: vi.fn(),
        passed: vi.fn(),
        failed: vi.fn(),
        skipped: vi.fn(),
        end: vi.fn(),
        appendOutput: vi.fn(),
      } as unknown as vscode.TestRun

      const fileItem = createMockTestItem('file1', 'test.ts', '/mock/test.ts')
      const testItem = createMockTestItem('test:/mock/test.ts::::my test', 'my test', undefined, fileItem)

      const controller = {
        createTestRun: vi.fn().mockReturnValue(mockRun),
        items: {
          forEach: (cb: any) => [fileItem].forEach(cb)
        } as any
      } as unknown as vscode.TestController

      const request = { include: undefined } as vscode.TestRunRequest
      const token = { onCancellationRequested: vi.fn() } as unknown as vscode.CancellationToken

      // Mock child process
      const mockStdout = new PassThrough()
      const mockStderr = new PassThrough()
      const mockProc = new PassThrough() as unknown as cp.ChildProcess
      mockProc.stdout = mockStdout as any
      mockProc.stderr = mockStderr as any
      mockProc.kill = vi.fn()

      vi.mocked(cp.spawn).mockReturnValue(mockProc)

      const runPromise = runTests(request, controller, config, token)

      // Emit NDJSON
      mockStdout.emit('data', Buffer.from(JSON.stringify({ event: 'test:start', title: 'my test', filePath: '/mock/test.ts' }) + '\n'))
      mockStdout.emit('data', Buffer.from(JSON.stringify({ event: 'test:end', title: 'my test', filePath: '/mock/test.ts', duration: 100 }) + '\n'))
      mockStdout.emit('data', Buffer.from(JSON.stringify({ hasError: false }) + '\n'))
      
      // Complete process
      mockStdout.emit('end')
      mockProc.emit('close', 0)

      await runPromise

      expect(mockRun.started).toHaveBeenCalledWith(testItem)
      expect(mockRun.passed).toHaveBeenCalledWith(testItem, 100)
      expect(mockRun.end).toHaveBeenCalled()
    })
  })
})
