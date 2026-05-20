import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'stream'
import * as fs from 'fs'
import * as cp from 'child_process'
import * as vscode from 'vscode'
import {
  fileItemId,
  groupItemId,
  testItemId,
  findTestRange,
  runListCommand,
  discoverTests
} from '../src/discovery'
import type { LupaConfig } from '../src/config'

vi.mock('fs')
vi.mock('child_process')

describe('discovery.ts', () => {
  const config: LupaConfig = {
    binPath: '/mock/lupa',
    configPath: '/mock/lupa.config.ts',
    workspaceRoot: '/mock',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ID generators', () => {
    it('fileItemId', () => {
      expect(fileItemId('foo.ts')).toBe('file:foo.ts')
    })
    it('groupItemId', () => {
      expect(groupItemId('foo.ts', 'Group A')).toBe('group:foo.ts::Group A')
    })
    it('testItemId with group', () => {
      expect(testItemId('foo.ts', 'Group A', 'Test 1')).toBe('test:foo.ts::Group A::Test 1')
    })
    it('testItemId without group', () => {
      expect(testItemId('foo.ts', undefined, 'Test 1')).toBe('test:foo.ts::::Test 1')
    })
  })

  describe('findTestRange', () => {
    it('returns undefined if file cannot be read', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('fail') })
      expect(findTestRange('missing.ts', 'Test 1')).toBeUndefined()
    })

    it('finds the test range line', () => {
      const content = `import { test } from 'vitest'\n\ntest('my awesome test', () => {\n})\n`
      vi.mocked(fs.readFileSync).mockReturnValue(content)
      
      const range = findTestRange('found.ts', 'my awesome test')
      expect(range).toBeDefined()
      // "test('my awesome test', () => {" is on line 2 (0-indexed)
      expect(range?.start.line).toBe(2)
      expect(range?.end.line).toBe(2)
    })

    it('handles quotes and special characters in title', () => {
      const content = `test("test with (special) [chars]", () => {})`
      vi.mocked(fs.readFileSync).mockReturnValue(content)
      
      const range = findTestRange('found.ts', 'test with (special) [chars]')
      expect(range).toBeDefined()
      expect(range?.start.line).toBe(0)
    })
  })

  describe('runListCommand', () => {
    it('returns JSON output correctly isolated from ANSI noise', async () => {
      const mockStdout = new PassThrough()
      const mockStderr = new PassThrough()
      const mockProc = new PassThrough() as unknown as cp.ChildProcess
      mockProc.stdout = mockStdout as any
      mockProc.stderr = mockStderr as any
      vi.mocked(cp.spawn).mockReturnValue(mockProc)

      const promise = runListCommand(config)
      
      mockStdout.emit('data', Buffer.from('\x1b[32mVite preamble\x1b[0m\n{"success":true,"list":{}}\n'))
      mockStdout.emit('end')
      mockProc.emit('close', 0)

      const output = await promise
      expect(output).toBe('{"success":true,"list":{}}\n')
    })

    it('returns undefined if exit code is non-zero', async () => {
      const mockStdout = new PassThrough()
      const mockStderr = new PassThrough()
      const mockProc = new PassThrough() as unknown as cp.ChildProcess
      mockProc.stdout = mockStdout as any
      mockProc.stderr = mockStderr as any
      vi.mocked(cp.spawn).mockReturnValue(mockProc)

      const promise = runListCommand(config)
      mockProc.emit('close', 1)

      const output = await promise
      expect(output).toBeUndefined()
    })
  })

  describe('discoverTests', () => {
    it('populates controller with nested items from json', async () => {
      const mockStdout = new PassThrough()
      const mockStderr = new PassThrough()
      const mockProc = new PassThrough() as unknown as cp.ChildProcess
      mockProc.stdout = mockStdout as any
      mockProc.stderr = mockStderr as any
      vi.mocked(cp.spawn).mockReturnValue(mockProc)

      const jsonPayload = {
        success: true,
        list: {
          suites: [
            {
              name: 'Suite 1',
              tests: [
                { title: 'Top level test', meta: { fileName: '/mock/test.ts' } }
              ],
              groups: [
                {
                  title: 'Group A',
                  tests: [
                    { title: 'Group test 1', meta: { fileName: '/mock/test.ts' } }
                  ],
                  groups: []
                }
              ]
            }
          ]
        }
      }

      const replaceFn = vi.fn()
      const controller = {
        items: {
          replace: replaceFn
        },
        createTestItem: vi.fn().mockImplementation((id, label, uri) => ({
          id, label, uri, children: { add: vi.fn() }
        }))
      } as unknown as vscode.TestController

      const promise = discoverTests(controller, config)
      
      mockStdout.emit('data', Buffer.from(JSON.stringify(jsonPayload)))
      mockStdout.emit('end')
      mockProc.emit('close', 0)

      await promise

      expect(replaceFn).toHaveBeenCalled()
      const calls = vi.mocked(controller.createTestItem).mock.calls
      
      // Should create file item, group item, and two test items
      expect(calls.some(c => c[0] === 'file:/mock/test.ts')).toBe(true)
      expect(calls.some(c => c[0] === 'group:/mock/test.ts::Group A')).toBe(true)
      expect(calls.some(c => c[0] === 'test:/mock/test.ts::::Top level test')).toBe(true)
      expect(calls.some(c => c[0] === 'test:/mock/test.ts::Group A::Group test 1')).toBe(true)
    })
    
    it('replaces items with empty array if parsing fails', async () => {
      const mockStdout = new PassThrough()
      const mockProc = new PassThrough() as unknown as cp.ChildProcess
      mockProc.stdout = mockStdout as any
      mockProc.stderr = new PassThrough() as any
      vi.mocked(cp.spawn).mockReturnValue(mockProc)

      const replaceFn = vi.fn()
      const controller = { items: { replace: replaceFn } } as unknown as vscode.TestController

      const promise = discoverTests(controller, config)
      
      mockStdout.emit('data', Buffer.from('invalid json'))
      mockStdout.emit('end')
      mockProc.emit('close', 0)

      await promise
      expect(replaceFn).toHaveBeenCalledWith([])
    })
  })
})
