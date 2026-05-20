import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as vscode from 'vscode'
import { LupaController } from '../src/controller'
import { discoverTests } from '../src/discovery'
import { createWatchers } from '../src/watcher'
import type { LupaConfig } from '../src/config'

vi.mock('../src/discovery', () => ({
  discoverTests: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../src/watcher', () => ({
  createWatchers: vi.fn().mockReturnValue({ dispose: vi.fn() })
}))

describe('controller.ts', () => {
  const config: LupaConfig = {
    binPath: '/mock/lupa',
    configPath: '/mock/lupa.config.ts',
    workspaceRoot: '/mock',
  }

  const mockFolder = { uri: vscode.Uri.file('/mock/workspace'), name: 'mock', index: 0 }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes controller, run profile, and watchers', () => {
    const controller = new LupaController(mockFolder, config)

    expect(vscode.tests.createTestController).toHaveBeenCalledWith(
      'lupa-/mock/workspace',
      'Lupa'
    )
    
    // Check that run profile was created
    expect((vscode as any).mockTestControllerInstance.createRunProfile).toHaveBeenCalledWith(
      'Run',
      vscode.TestRunProfileKind.Run,
      expect.any(Function),
      true
    )

    // Check that watchers were created
    expect(createWatchers).toHaveBeenCalledWith(mockFolder, expect.any(Function))
    
    // Ensure initial discovery was scheduled
    vi.advanceTimersByTime(300)
    expect(discoverTests).toHaveBeenCalledWith((vscode as any).mockTestControllerInstance, config)
  })

  it('debounces successive discovery calls', () => {
    new LupaController(mockFolder, config)

    // Initial discovery is pending (300ms timeout)
    expect(discoverTests).not.toHaveBeenCalled()

    // Trigger watcher callback multiple times quickly
    const watcherCallback = vi.mocked(createWatchers).mock.calls[0][1]
    watcherCallback()
    watcherCallback()
    watcherCallback()

    vi.advanceTimersByTime(300)

    // discoverTests should only be called once despite multiple triggers
    expect(discoverTests).toHaveBeenCalledTimes(1)
    expect(discoverTests).toHaveBeenCalledWith((vscode as any).mockTestControllerInstance, config)

    // After it completes, triggering again should work
    watcherCallback()
    vi.advanceTimersByTime(300)
    expect(discoverTests).toHaveBeenCalledTimes(2)
  })

  it('disposes cleanly', () => {
    const mockWatcherDisposable = { dispose: vi.fn() }
    vi.mocked(createWatchers).mockReturnValue(mockWatcherDisposable)
    
    const controller = new LupaController(mockFolder, config)

    controller.dispose()

    expect((vscode as any).mockTestControllerInstance.dispose).toHaveBeenCalled()
    expect(mockWatcherDisposable.dispose).toHaveBeenCalled()
  })
})
