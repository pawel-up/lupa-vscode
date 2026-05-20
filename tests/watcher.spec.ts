import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as vscode from 'vscode'
import { createWatchers } from '../src/watcher'

describe('watcher.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates watchers for test and config files and wires up events', () => {
    const mockFolder = { uri: vscode.Uri.file('/mock/workspace'), name: 'mock', index: 0 }
    const onChanged = vi.fn()

    const mockWatcher = {
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn()
    }
    vi.mocked(vscode.workspace.createFileSystemWatcher).mockReturnValue(mockWatcher as any)

    const disposable = createWatchers(mockFolder, onChanged)
    
    // 4 test patterns + 3 config files = 7 watchers
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(7)

    // Check if relative patterns were created for everything
    const calls = vi.mocked(vscode.workspace.createFileSystemWatcher).mock.calls
    const patterns = calls.map(c => (c[0] as unknown as { pattern: string }).pattern)
    
    expect(patterns).toContain('**/*.spec.ts')
    expect(patterns).toContain('lupa.config.ts')
    expect(patterns).toContain('package.json')

    // Trigger one of the callbacks manually to test trigger()
    const onCreateCallback = mockWatcher.onDidCreate.mock.calls[0][0]
    onCreateCallback()

    expect(onChanged).toHaveBeenCalledTimes(1)

    // Test disposal
    disposable.dispose()
    expect(mockWatcher.dispose).toHaveBeenCalledTimes(7)
  })
})
